import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";
import { FailedTrackResult, MatchedTrackResult } from "@/app/types/conversion";
import { getErrorMessage, RequestValidationError } from "@/app/lib/errors";
import { logError, logInfo, logWarn } from "@/app/lib/logger";
import { parseCreatePlaylistRequest, parseYoutubeTokens } from "@/app/lib/validation";
import {
    buildYoutubeSearchQueries,
    selectBestYoutubeCandidate,
    YoutubeVideoCandidate,
} from "@/app/lib/youtube-matching";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
    try {
        const {
            playlist: { name, description, tracks },
            youtubePlaylistId,
        } = parseCreatePlaylistRequest(await request.json());
        const tokens = parseYoutubeTokens(request.cookies.get("youtube_token")?.value);

        const oauth2Client = new google.auth.OAuth2();
        oauth2Client.setCredentials(tokens);

        const youtube = google.youtube("v3");

        let targetPlaylistId = youtubePlaylistId;

        if (!targetPlaylistId) {
            logInfo("Creating YouTube playlist", {
                playlistName: name,
                trackCount: tracks.length,
            });

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
            });
        }

        const failedTracks: FailedTrackResult[] = [];
        const matchedTracks: MatchedTrackResult[] = [];

        for (const track of tracks) {
            const attemptedQueries = buildYoutubeSearchQueries(track);

            try {
                const candidates = new Map<string, YoutubeVideoCandidate>();

                for (const query of attemptedQueries) {
                    const searchRes = await youtube.search.list({
                        auth: oauth2Client,
                        part: ["snippet"],
                        q: query,
                        maxResults: 5,
                        type: ["video"],
                    });

                    for (const item of searchRes.data.items || []) {
                        const videoId = item.id?.videoId;

                        if (!videoId || candidates.has(videoId)) {
                            continue;
                        }

                        candidates.set(videoId, {
                            videoId,
                            title: item.snippet?.title || "",
                            description: item.snippet?.description,
                            channelTitle: item.snippet?.channelTitle,
                        });
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
            } catch {
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
        });

        return NextResponse.json({
            success: true,
            youtubePlaylistId: targetPlaylistId,
            youtubePlaylistUrl: `https://www.youtube.com/playlist?list=${targetPlaylistId}`,
            totalTracks: tracks.length,
            matchedCount: matchedTracks.length,
            failedCount: failedTracks.length,
            matchedTracks,
            failedTracks,
        });
    } catch (error) {
        if (error instanceof RequestValidationError) {
            const status = error.message === "Not authenticated" ? 401 : 400;
            return NextResponse.json({ error: error.message }, { status });
        }

        logError("Failed to create YouTube playlist", error);
        return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
    }
}
