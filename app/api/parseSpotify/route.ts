import { Playlist } from "@/app/types/playlist";
import { getErrorMessage } from "@/app/lib/errors";
import { getSpotifyConfig } from "@/app/lib/server-config";
import axios from "axios";
import { NextRequest, NextResponse } from "next/server";
import querystring from "node:querystring";

interface SpotifyPlaylistItem {
    track?: {
        name?: string;
        artists?: Array<{ name?: string }>;
    };
}

interface SpotifyPlaylistResponse {
    name: string;
    description: string;
    owner: {
        display_name: string;
    };
    tracks: {
        items: SpotifyPlaylistItem[];
    };
}

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
    try {
        const { spotifyUrl } = await request.json();

        let playlistId = "",
            accessToken = "";

        const match = spotifyUrl.match(/playlist\/([A-Za-z0-9]+)/);
        if (match) {
            playlistId = match[1];
        } else {
            return NextResponse.json(
                { error: "Invalid Spotify playlist URL" },
                { status: 400 }
            );
        }


        const { clientId, clientSecret } = getSpotifyConfig();

        const tokenData = querystring.stringify({
            grant_type: "client_credentials",
            client_id: clientId,
            client_secret: clientSecret,
        });

        const { data } = await axios.post("https://accounts.spotify.com/api/token", tokenData, { headers: { "Content-Type": "application/x-www-form-urlencoded" } });

        accessToken = data.access_token;

        const { data: playlistData } = await axios.get<SpotifyPlaylistResponse>(`https://api.spotify.com/v1/playlists/${playlistId}`, { headers: { Authorization: `Bearer ${accessToken}` } });
        const tracks = (playlistData.tracks.items || []).map((item: SpotifyPlaylistItem) => {
            const trackName = item.track?.name || "";
            const artistName = item.track?.artists?.[0]?.name || "Unknown Artist";
            return { trackName, artistName };
        });

        const playlist: Playlist = {
            name: playlistData.name,
            description: playlistData.description,
            ownerName: playlistData.owner.display_name,
            tracks
        }

        return NextResponse.json({ success: true, playlist });
    } catch (error) {
        console.error(error);
        return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
    }
}
