import assert from "node:assert/strict";
import test from "node:test";

import {
  extractSpotifyPlaylistId,
  parseSpotifyPlaylistResponse,
  parseSpotifyPlaylistTracksPage,
} from "@/app/lib/spotify";

test("extractSpotifyPlaylistId reads playlist ids from Spotify URLs with query params", () => {
  assert.equal(
    extractSpotifyPlaylistId("https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M?si=123"),
    "37i9dQZF1DXcBWIGoYBM5M"
  );
});

test("parseSpotifyPlaylistResponse keeps playlist metadata and filters unavailable tracks", () => {
  const playlist = parseSpotifyPlaylistResponse({
    name: "Today's Top Hits",
    description: "Popular tracks",
    owner: { display_name: "Spotify" },
    tracks: {
      items: [
        {
          track: {
            name: "Blinding Lights",
            artists: [{ name: "The Weeknd" }],
          },
        },
        {
          track: null,
        },
      ],
    },
  });

  assert.deepEqual(playlist, {
    name: "Today's Top Hits",
    description: "Popular tracks",
    ownerName: "Spotify",
    tracks: [{ trackName: "Blinding Lights", artistName: "The Weeknd" }],
  });
});

test("parseSpotifyPlaylistTracksPage returns the next page url for paginated playlists", () => {
  const tracksPage = parseSpotifyPlaylistTracksPage({
    items: [
      {
        track: {
          name: "Yellow",
          artists: [{ name: "Coldplay" }],
        },
      },
    ],
    next: "https://api.spotify.com/v1/playlists/playlist-id/tracks?offset=100&limit=100",
  });

  assert.deepEqual(tracksPage, {
    tracks: [{ trackName: "Yellow", artistName: "Coldplay" }],
    next: "https://api.spotify.com/v1/playlists/playlist-id/tracks?offset=100&limit=100",
  });
});
