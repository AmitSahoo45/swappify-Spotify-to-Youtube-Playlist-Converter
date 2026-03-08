import { buildYoutubeSearchQueries } from "@/app/lib/youtube-matching";
import { Track } from "@/app/types/playlist";

export const YOUTUBE_DAILY_QUOTA_LIMIT = 10_000;
export const YOUTUBE_SEARCH_REQUEST_UNITS = 100;
export const YOUTUBE_PLAYLIST_INSERT_UNITS = 50;
export const YOUTUBE_PLAYLIST_CREATE_UNITS = 50;

const youtubeQuotaErrorReasons = new Set([
  "dailyLimitExceeded",
  "quotaExceeded",
  "rateLimitExceeded",
  "userRateLimitExceeded",
]);

type GoogleApiErrorShape = {
  code?: number;
  errors?: Array<{ reason?: string }>;
  response?: {
    status?: number;
    data?: {
      error?: {
        errors?: Array<{ reason?: string }>;
        message?: string;
      };
    };
  };
};

export function estimateYoutubeQuotaUsage(tracks: Track[], options?: { includePlaylistCreation?: boolean }) {
  const includePlaylistCreation = options?.includePlaylistCreation ?? true;
  const searchRequests = tracks.reduce((total, track) => total + buildYoutubeSearchQueries(track).length, 0);
  const searchUnits = searchRequests * YOUTUBE_SEARCH_REQUEST_UNITS;
  const insertUnits = tracks.length * YOUTUBE_PLAYLIST_INSERT_UNITS;
  const playlistCreationUnits = includePlaylistCreation ? YOUTUBE_PLAYLIST_CREATE_UNITS : 0;
  const totalUnits = searchUnits + insertUnits + playlistCreationUnits;

  return {
    searchRequests,
    searchUnits,
    insertUnits,
    playlistCreationUnits,
    totalUnits,
    exceedsDailyQuota: totalUnits > YOUTUBE_DAILY_QUOTA_LIMIT,
  };
}

export function isYoutubeQuotaError(error: unknown) {
  const candidate = error as GoogleApiErrorShape | undefined;
  const reasons = [
    ...(candidate?.errors ?? []).map((entry) => entry.reason),
    ...(candidate?.response?.data?.error?.errors ?? []).map((entry) => entry.reason),
  ].filter(Boolean);

  return (
    candidate?.code === 403 ||
    candidate?.response?.status === 403 ||
    reasons.some((reason) => youtubeQuotaErrorReasons.has(reason ?? ""))
  );
}

export function getYoutubeQuotaErrorMessage(totalUnits?: number) {
  if (typeof totalUnits === "number") {
    return `YouTube API quota is currently exhausted. This conversion is estimated to use about ${totalUnits.toLocaleString()} quota units. Please wait for quota to reset or retry with fewer tracks.`;
  }

  return "YouTube API quota is currently exhausted. Please wait for quota to reset or retry with fewer tracks.";
}
