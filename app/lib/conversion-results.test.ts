import test from "node:test";
import assert from "node:assert/strict";

import { mergeRetryConversionResult } from "@/app/lib/conversion-results";
import { PlaylistConversionResult } from "@/app/types/conversion";

test("mergeRetryConversionResult keeps the original total while replacing failed tracks with retry results", () => {
  const currentResult: PlaylistConversionResult = {
    youtubePlaylistId: "playlist-123",
    youtubePlaylistUrl: "https://www.youtube.com/playlist?list=playlist-123",
    totalTracks: 4,
    matchedCount: 2,
    failedCount: 2,
    matchedTracks: [
      {
        track: { trackName: "Yellow", artistName: "Coldplay" },
        videoId: "yellow",
        youtubeTitle: "Coldplay - Yellow (Official Video)",
      },
      {
        track: { trackName: "Levitating", artistName: "Dua Lipa" },
        videoId: "levitating",
        youtubeTitle: "Dua Lipa - Levitating (Official Video)",
      },
    ],
    failedTracks: [
      {
        track: { trackName: "Track A", artistName: "Artist A" },
        attemptedQueries: ["Track A Artist A"],
        reason: "No suitable YouTube match found.",
      },
      {
        track: { trackName: "Track B", artistName: "Artist B" },
        attemptedQueries: ["Track B Artist B"],
        reason: "No suitable YouTube match found.",
      },
    ],
  };

  const retryResult: PlaylistConversionResult = {
    youtubePlaylistId: "playlist-123",
    youtubePlaylistUrl: "https://www.youtube.com/playlist?list=playlist-123",
    totalTracks: 2,
    matchedCount: 1,
    failedCount: 1,
    matchedTracks: [
      {
        track: { trackName: "Track A (Edited)", artistName: "Artist A" },
        videoId: "track-a",
        youtubeTitle: "Artist A - Track A",
      },
    ],
    failedTracks: [
      {
        track: { trackName: "Track B (Edited)", artistName: "Artist B" },
        attemptedQueries: ["Track B Edited Artist B"],
        reason: "No suitable YouTube match found.",
      },
    ],
  };

  const mergedResult = mergeRetryConversionResult(currentResult, retryResult);

  assert.equal(mergedResult.totalTracks, 4);
  assert.equal(mergedResult.matchedCount, 3);
  assert.equal(mergedResult.failedCount, 1);
  assert.deepEqual(mergedResult.failedTracks, retryResult.failedTracks);
  assert.deepEqual(
    mergedResult.matchedTracks.map((track) => track.videoId),
    ["yellow", "levitating", "track-a"]
  );
});
