import assert from "node:assert/strict";
import test from "node:test";

import { mergeYoutubeTokens, shouldRefreshYoutubeTokens } from "@/app/lib/youtube-auth";

test("shouldRefreshYoutubeTokens refreshes access when the token is about to expire", () => {
  const now = Date.now();

  assert.equal(
    shouldRefreshYoutubeTokens(
      {
        access_token: "access-token",
        refresh_token: "refresh-token",
        expiry_date: now + 5 * 60 * 1000,
      },
      now
    ),
    true
  );
});

test("mergeYoutubeTokens preserves the previous refresh token when Google omits it", () => {
  const mergedTokens = mergeYoutubeTokens(
    {
      access_token: "old-access-token",
      refresh_token: "refresh-token",
      expiry_date: 100,
    },
    {
      access_token: "new-access-token",
      expiry_date: 200,
    }
  );

  assert.deepEqual(mergedTokens, {
    access_token: "new-access-token",
    refresh_token: "refresh-token",
    expiry_date: 200,
  });
});
