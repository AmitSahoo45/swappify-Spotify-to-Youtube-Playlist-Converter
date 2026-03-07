import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";
import { Playlist, Track } from "@/app/types/playlist";
import { getErrorMessage } from "@/app/lib/errors";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
    try {
        const { playlist: { name, description, tracks } } = (await request.json()) as { playlist: Playlist };
        const tokenCookie = request.cookies.get("youtube_token")?.value;

        if (!tokenCookie)
            return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

        if (!tracks || !Array.isArray(tracks) || tracks.length === 0)
            return NextResponse.json({ error: "Invalid Playlist" }, { status: 400 });

        const tokens = JSON.parse(tokenCookie);

        const oauth2Client = new google.auth.OAuth2();
        oauth2Client.setCredentials(tokens);

        const youtube = google.youtube("v3");

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
        const failedTracks: Track[] = [];

        for (const track of tracks) {
            try {
                const query = `${track.trackName} ${track.artistName}`;
                const searchRes = await youtube.search.list({
                    auth: oauth2Client,
                    part: ["snippet"],
                    q: query,
                    maxResults: 1,
                    type: ["video"],
                });

                const videoId = searchRes.data.items?.[0]?.id?.videoId;
                if (!videoId) {
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
                failedTracks.push(track);
            }
        }

        return NextResponse.json({
            success: true,
            youtubePlaylistId: newPlaylistId,
            totalTracks: tracks.length,
            failedTracks,
        });
    } catch (error) {
        console.error(error);
        return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
    }
}
