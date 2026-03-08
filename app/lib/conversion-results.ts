import { PlaylistConversionResult } from "@/app/types/conversion";

export function mergeRetryConversionResult(
  currentResult: PlaylistConversionResult,
  retryResult: PlaylistConversionResult
) {
  const matchedTracks = [...currentResult.matchedTracks, ...retryResult.matchedTracks];

  return {
    ...currentResult,
    youtubePlaylistId: retryResult.youtubePlaylistId,
    youtubePlaylistUrl: retryResult.youtubePlaylistUrl,
    totalTracks: currentResult.totalTracks,
    matchedCount: matchedTracks.length,
    failedCount: retryResult.failedTracks.length,
    matchedTracks,
    failedTracks: retryResult.failedTracks,
  };
}
