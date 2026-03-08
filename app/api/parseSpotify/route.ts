import { Playlist } from "@/app/types/playlist";
import { getErrorMessage, RequestValidationError } from "@/app/lib/errors";
import { logError, logInfo } from "@/app/lib/logger";
import { getSpotifyConfig } from "@/app/lib/server-config";
import {
  extractSpotifyPlaylistId,
  parseSpotifyPlaylistResponse,
  parseSpotifyPlaylistTracksPage,
} from "@/app/lib/spotify";
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
      return NextResponse.json({ error: "Invalid Spotify playlist URL" }, { status: 400 });
    }

    logInfo("Parsing Spotify playlist", { playlistId });

    const { clientId, clientSecret } = getSpotifyConfig();

    const tokenData = querystring.stringify({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
    });

    const { data } = await axios.post("https://accounts.spotify.com/api/token", tokenData, {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
    const accessToken = data.access_token;
    const authorizationHeaders = { Authorization: `Bearer ${accessToken}` };
    const { data: playlistData } = await axios.get(`https://api.spotify.com/v1/playlists/${playlistId}`, {
      headers: authorizationHeaders,
    });
    const playlist: Playlist = parseSpotifyPlaylistResponse(playlistData);

    let nextTracksUrl = playlistData?.tracks?.next ?? null;

    while (nextTracksUrl) {
      const { data: tracksPageData } = await axios.get(nextTracksUrl, {
        headers: authorizationHeaders,
      });
      const parsedTracksPage = parseSpotifyPlaylistTracksPage(tracksPageData);

      playlist.tracks.push(...parsedTracksPage.tracks);
      nextTracksUrl = parsedTracksPage.next;
    }

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
