import assert from "node:assert/strict";
import test from "node:test";

import { estimateYoutubeQuotaUsage } from "@/app/lib/youtube-quota";

test("estimateYoutubeQuotaUsage counts search, insert, and playlist creation units", () => {
  const quotaEstimate = estimateYoutubeQuotaUsage([
    { trackName: "Blinding Lights (Official Video)", artistName: "The Weeknd" },
    { trackName: "Yellow", artistName: "Coldplay" },
  ]);

  assert.deepEqual(quotaEstimate, {
    searchRequests: 4,
    searchUnits: 400,
    insertUnits: 100,
    playlistCreationUnits: 50,
    totalUnits: 550,
    exceedsDailyQuota: false,
  });
});
