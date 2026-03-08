import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";
import { FailedTrackResult, MatchedTrackResult } from "@/app/types/conversion";
import { getErrorMessage, RequestValidationError } from "@/app/lib/errors";
import { logError, logInfo, logWarn } from "@/app/lib/logger";
import { parseCreatePlaylistRequest, parseYoutubeTokens } from "@/app/lib/validation";
import { getGoogleOAuthConfig } from "@/app/lib/server-config";
import {
  mergeYoutubeTokens,
  setYoutubeTokenCookie,
  shouldRefreshYoutubeTokens,
  YOUTUBE_TOKEN_COOKIE_NAME,
  YoutubeTokens,
} from "@/app/lib/youtube-auth";
import {
  buildYoutubeSearchQueries,
  selectBestYoutubeCandidate,
  YoutubeVideoCandidate,
} from "@/app/lib/youtube-matching";
import {
  estimateYoutubeQuotaUsage,
  getYoutubeQuotaErrorMessage,
  isYoutubeQuotaError,
} from "@/app/lib/youtube-quota";

export const runtime = "nodejs";

const YOUTUBE_SEARCH_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const YOUTUBE_SEARCH_CACHE_MAX_ENTRIES = 500;
const youtubeSearchCache = new Map<string, { cachedAt: number; candidates: YoutubeVideoCandidate[] }>();

function getCachedYoutubeCandidates(query: string) {
  const cachedResult = youtubeSearchCache.get(query);

  if (!cachedResult) {
    return null;
  }

  if (cachedResult.cachedAt + YOUTUBE_SEARCH_CACHE_TTL_MS < Date.now()) {
    youtubeSearchCache.delete(query);
    return null;
  }

  youtubeSearchCache.delete(query);
  youtubeSearchCache.set(query, cachedResult);
  return cachedResult.candidates;
}

function setCachedYoutubeCandidates(query: string, candidates: YoutubeVideoCandidate[]) {
  youtubeSearchCache.delete(query);
  youtubeSearchCache.set(query, {
    cachedAt: Date.now(),
    candidates,
  });

  while (youtubeSearchCache.size > YOUTUBE_SEARCH_CACHE_MAX_ENTRIES) {
    const oldestKey = youtubeSearchCache.keys().next().value;

    if (!oldestKey) {
      break;
    }

    youtubeSearchCache.delete(oldestKey);
  }
}

export async function POST(request: NextRequest) {
  let currentTokens: YoutubeTokens | null = null;
  let shouldPersistTokens = false;
  let quotaEstimateTotal: number | undefined;

  try {
    const {
      playlist: { name, description, tracks },
      youtubePlaylistId,
    } = parseCreatePlaylistRequest(await request.json());
    const tokens = parseYoutubeTokens(request.cookies.get(YOUTUBE_TOKEN_COOKIE_NAME)?.value);
    currentTokens = tokens;

    const { clientId, clientSecret, redirectUrl } = getGoogleOAuthConfig(request);
    const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUrl);
    oauth2Client.setCredentials(tokens);

    const quotaEstimate = estimateYoutubeQuotaUsage(tracks, {
      includePlaylistCreation: !youtubePlaylistId,
    });
    quotaEstimateTotal = quotaEstimate.totalUnits;

    if (quotaEstimate.exceedsDailyQuota) {
      logWarn("YouTube conversion may exceed daily quota", {
        estimatedQuotaUnits: quotaEstimate.totalUnits,
        trackCount: tracks.length,
      });
    }

    const ensureFreshYoutubeAccessToken = async () => {
      if (!currentTokens || !shouldRefreshYoutubeTokens(currentTokens)) {
        return;
      }

      const { credentials } = await oauth2Client.refreshAccessToken();
      currentTokens = mergeYoutubeTokens(currentTokens, credentials);
      oauth2Client.setCredentials(currentTokens);
      shouldPersistTokens = true;

      logInfo("Refreshed YouTube OAuth token", {
        hasAccessToken: Boolean(currentTokens.access_token),
        hasRefreshToken: Boolean(currentTokens.refresh_token),
      });
    };

    const youtube = google.youtube("v3");

    let targetPlaylistId = youtubePlaylistId;

    if (!targetPlaylistId) {
      logInfo("Creating YouTube playlist", {
        playlistName: name,
        trackCount: tracks.length,
        estimatedQuotaUnits: quotaEstimate.totalUnits,
      });

      await ensureFreshYoutubeAccessToken();
      const { data: playlistCreation } = await youtube.playlists.insert({
        auth: oauth2Client,
        part: ["snippet", "status"],
        requestBody: {
          snippet: {
            title: name,
            description,
          },
          status: { privacyStatus: "private" },
        },
      });

      targetPlaylistId = playlistCreation.id ?? undefined;

      if (!targetPlaylistId) {
        throw new Error("YouTube playlist creation did not return an id");
      }
    } else {
      logInfo("Retrying failed tracks in existing YouTube playlist", {
        youtubePlaylistId,
        trackCount: tracks.length,
        estimatedQuotaUnits: quotaEstimate.totalUnits,
      });
    }

    const failedTracks: FailedTrackResult[] = [];
    const matchedTracks: MatchedTrackResult[] = [];

    for (const track of tracks) {
      const attemptedQueries = buildYoutubeSearchQueries(track);

      try {
        const candidates = new Map<string, YoutubeVideoCandidate>();

        for (const query of attemptedQueries) {
          const cachedCandidates = getCachedYoutubeCandidates(query);
          const queryCandidates =
            cachedCandidates ??
            (await (async () => {
              await ensureFreshYoutubeAccessToken();
              const searchRes = await youtube.search.list({
                auth: oauth2Client,
                part: ["snippet"],
                q: query,
                maxResults: 5,
                type: ["video"],
              });

              const searchCandidates: YoutubeVideoCandidate[] = [];

              for (const item of searchRes.data.items || []) {
                const videoId = item.id?.videoId;

                if (!videoId) {
                  continue;
                }

                searchCandidates.push({
                  videoId,
                  title: item.snippet?.title || "",
                  description: item.snippet?.description,
                  channelTitle: item.snippet?.channelTitle,
                });
              }

              setCachedYoutubeCandidates(query, searchCandidates);
              return searchCandidates;
            })());

          for (const candidate of queryCandidates) {
            if (!candidates.has(candidate.videoId)) {
              candidates.set(candidate.videoId, candidate);
            }
          }
        }

        const bestCandidate = selectBestYoutubeCandidate(track, Array.from(candidates.values()));
        const videoId = bestCandidate?.videoId;

        if (!videoId) {
          logWarn("No YouTube match found for track", {
            trackName: track.trackName,
            artistName: track.artistName,
          });
          failedTracks.push({
            track,
            attemptedQueries,
            reason: "No suitable YouTube match found.",
          });
          continue;
        }

        await ensureFreshYoutubeAccessToken();
        await youtube.playlistItems.insert({
          auth: oauth2Client,
          part: ["snippet"],
          requestBody: {
            snippet: {
              playlistId: targetPlaylistId,
              resourceId: { kind: "youtube#video", videoId },
            },
          },
        });

        matchedTracks.push({
          track,
          videoId,
          youtubeTitle: bestCandidate?.title || "",
        });
      } catch (trackError) {
        if (isYoutubeQuotaError(trackError)) {
          throw trackError;
        }

        logWarn("Failed to add track to YouTube playlist", {
          trackName: track.trackName,
          artistName: track.artistName,
        });
        failedTracks.push({
          track,
          attemptedQueries,
          reason: "Failed to add this track to the YouTube playlist.",
        });
      }
    }

    logInfo("YouTube playlist created", {
      youtubePlaylistId: targetPlaylistId,
      totalTracks: tracks.length,
      failedTracks: failedTracks.length,
      estimatedQuotaUnits: quotaEstimate.totalUnits,
    });

    const response = NextResponse.json({
      success: true,
      youtubePlaylistId: targetPlaylistId,
      youtubePlaylistUrl: `https://www.youtube.com/playlist?list=${targetPlaylistId}`,
      totalTracks: tracks.length,
      matchedCount: matchedTracks.length,
      failedCount: failedTracks.length,
      matchedTracks,
      failedTracks,
    });

    if (currentTokens && shouldPersistTokens) {
      setYoutubeTokenCookie(response, currentTokens);
    }

    return response;
  } catch (error) {
    if (error instanceof RequestValidationError) {
      const status = error.message === "Not authenticated" ? 401 : 400;
      const response = NextResponse.json({ error: error.message }, { status });

      if (currentTokens && shouldPersistTokens) {
        setYoutubeTokenCookie(response, currentTokens);
      }

      return response;
    }

    if (isYoutubeQuotaError(error)) {
      logWarn("YouTube quota exhausted during playlist creation", {
        estimatedQuotaUnits: quotaEstimateTotal,
      });
      const response = NextResponse.json(
        { error: getYoutubeQuotaErrorMessage(quotaEstimateTotal) },
        { status: 429 }
      );

      if (currentTokens && shouldPersistTokens) {
        setYoutubeTokenCookie(response, currentTokens);
      }

      return response;
    }

    logError("Failed to create YouTube playlist", error);
    const response = NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });

    if (currentTokens && shouldPersistTokens) {
      setYoutubeTokenCookie(response, currentTokens);
    }

    return response;
  }
}
