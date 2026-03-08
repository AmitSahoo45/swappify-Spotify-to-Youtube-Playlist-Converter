import { Playlist } from "@/app/types/playlist";
import { getErrorMessage, RequestValidationError } from "@/app/lib/errors";
import { logError, logInfo } from "@/app/lib/logger";
import { getSpotifyConfig } from "@/app/lib/server-config";
import { extractSpotifyPlaylistId, parseSpotifyPlaylistResponse } from "@/app/lib/spotify";
import { parseSpotifyRequest } from "@/app/lib/validation";
import axios from "axios";
import { NextRequest, NextResponse } from "next/server";
import querystring from "node:querystring";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
    try {
        const { spotifyUrl } = parseSpotifyRequest(await request.json());

        const playlistId = extractSpotifyPlaylistId(spotifyUrl);

        if (!playlistId) {
            return NextResponse.json(
                { error: "Invalid Spotify playlist URL" },
                { status: 400 }
            );
        }

        logInfo("Parsing Spotify playlist", { playlistId });

        const { clientId, clientSecret } = getSpotifyConfig();

        const tokenData = querystring.stringify({
            grant_type: "client_credentials",
            client_id: clientId,
            client_secret: clientSecret,
        });

        const { data } = await axios.post("https://accounts.spotify.com/api/token", tokenData, { headers: { "Content-Type": "application/x-www-form-urlencoded" } });
        const accessToken = data.access_token;
        const { data: playlistData } = await axios.get(
            `https://api.spotify.com/v1/playlists/${playlistId}`,
            { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        const playlist: Playlist = parseSpotifyPlaylistResponse(playlistData);

        logInfo("Spotify playlist parsed", {
            playlistId,
            trackCount: playlist.tracks.length,
        });

        return NextResponse.json({ success: true, playlist });
    } catch (error) {
        if (error instanceof RequestValidationError) {
            return NextResponse.json({ error: error.message }, { status: 400 });
        }

        logError("Failed to parse Spotify playlist", error);
        return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
    }
}
