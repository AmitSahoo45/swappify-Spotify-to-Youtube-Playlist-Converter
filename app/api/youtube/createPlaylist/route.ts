import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";
import { Track } from "@/app/types/playlist";
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
        } = parseCreatePlaylistRequest(await request.json());
        const tokens = parseYoutubeTokens(request.cookies.get("youtube_token")?.value);

        const oauth2Client = new google.auth.OAuth2();
        oauth2Client.setCredentials(tokens);

        const youtube = google.youtube("v3");

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

        const newPlaylistId = playlistCreation.id;

        if (!newPlaylistId) {
            throw new Error("YouTube playlist creation did not return an id");
        }

        const failedTracks: Track[] = [];

        for (const track of tracks) {
            try {
                const candidates = new Map<string, YoutubeVideoCandidate>();

                for (const query of buildYoutubeSearchQueries(track)) {
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

                const videoId = selectBestYoutubeCandidate(track, Array.from(candidates.values()))?.videoId;

                if (!videoId) {
                    logWarn("No YouTube match found for track", {
                        trackName: track.trackName,
                        artistName: track.artistName,
                    });
                    failedTracks.push(track);
                    continue;
                }

                await youtube.playlistItems.insert({
                    auth: oauth2Client,
                    part: ["snippet"],
                    requestBody: {
                        snippet: {
                            playlistId: newPlaylistId,
                            resourceId: { kind: "youtube#video", videoId },
                        },
                    },
                });
            } catch {
                logWarn("Failed to add track to YouTube playlist", {
                    trackName: track.trackName,
                    artistName: track.artistName,
                });
                failedTracks.push(track);
            }
        }

        logInfo("YouTube playlist created", {
            youtubePlaylistId: newPlaylistId,
            totalTracks: tracks.length,
            failedTracks: failedTracks.length,
        });

        return NextResponse.json({
            success: true,
            youtubePlaylistId: newPlaylistId,
            totalTracks: tracks.length,
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
