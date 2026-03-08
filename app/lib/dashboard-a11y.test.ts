import assert from "node:assert/strict";
import test from "node:test";

import { getDashboardAnnouncement, getDashboardStepTargetId } from "@/app/lib/dashboard-a11y";

test("getDashboardStepTargetId returns stable section ids for the step flow", () => {
  assert.equal(getDashboardStepTargetId(0), "dashboard-overview");
  assert.equal(getDashboardStepTargetId(1), "step-import-spotify");
  assert.equal(getDashboardStepTargetId(2), "step-convert-tracks");
  assert.equal(getDashboardStepTargetId(3), "step-review-retry");
  assert.equal(getDashboardStepTargetId(99), "dashboard-overview");
});

test("getDashboardAnnouncement prioritizes errors and loading states for live updates", () => {
  assert.equal(
    getDashboardAnnouncement({
      error: "Spotify URL is invalid.",
      loadingState: "parsing",
      playlistName: "",
      trackCount: 0,
      conversionResult: null,
      isSessionExpiringSoon: false,
    }),
    "Error: Spotify URL is invalid."
  );

  assert.equal(
    getDashboardAnnouncement({
      error: "",
      loadingState: "converting",
      playlistName: "Workout Mix",
      trackCount: 24,
      conversionResult: null,
      isSessionExpiringSoon: false,
    }),
    "Creating a YouTube playlist for 24 tracks from Workout Mix."
  );
});

test("getDashboardAnnouncement summarizes finished conversions and loaded playlists", () => {
  assert.equal(
    getDashboardAnnouncement({
      error: "",
      loadingState: null,
      playlistName: "",
      trackCount: 12,
      conversionResult: null,
      isSessionExpiringSoon: false,
    }),
    "12 Spotify tracks loaded and ready to convert."
  );

  assert.equal(
    getDashboardAnnouncement({
      error: "",
      loadingState: null,
      playlistName: "",
      trackCount: 0,
      conversionResult: {
        youtubePlaylistId: "playlist-id",
        youtubePlaylistUrl: "https://youtube.com/playlist?list=playlist-id",
        totalTracks: 12,
        matchedCount: 10,
        failedCount: 2,
        matchedTracks: [],
        failedTracks: [
          {
            track: { trackName: "Track", artistName: "Artist" },
            attemptedQueries: ["Track Artist"],
            reason: "No close match found.",
          },
        ],
      },
      isSessionExpiringSoon: false,
    }),
    "Conversion finished. 10 tracks matched and 2 still need review."
  );
});
