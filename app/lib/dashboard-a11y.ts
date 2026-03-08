import { PlaylistConversionResult } from "@/app/types/conversion";

export type DashboardLoadingState = "parsing" | "converting" | "retrying" | null;

const dashboardStepTargetIds = [
  "dashboard-overview",
  "step-import-spotify",
  "step-convert-tracks",
  "step-review-retry",
] as const;

export function getDashboardStepTargetId(index: number) {
  return dashboardStepTargetIds[index] ?? dashboardStepTargetIds[0];
}

export function getDashboardAnnouncement({
  error,
  loadingState,
  playlistName,
  trackCount,
  conversionResult,
  isSessionExpiringSoon,
}: {
  error: string;
  loadingState: DashboardLoadingState;
  playlistName: string;
  trackCount: number;
  conversionResult: PlaylistConversionResult | null;
  isSessionExpiringSoon: boolean;
}) {
  if (error) {
    return `Error: ${error}`;
  }

  if (loadingState === "parsing") {
    return "Parsing your Spotify playlist.";
  }

  if (loadingState === "converting") {
    return `Creating a YouTube playlist for ${trackCount} tracks${playlistName ? ` from ${playlistName}` : ""}.`;
  }

  if (loadingState === "retrying") {
    return `Retrying ${conversionResult?.failedTracks.length ?? 0} failed tracks.`;
  }

  if (conversionResult) {
    if (conversionResult.failedCount > 0) {
      return `Conversion finished. ${conversionResult.matchedCount} tracks matched and ${conversionResult.failedCount} still need review.`;
    }

    return `Conversion finished. All ${conversionResult.matchedCount} tracks matched successfully.`;
  }

  if (trackCount > 0) {
    return `${trackCount} Spotify tracks loaded and ready to convert.`;
  }

  if (isSessionExpiringSoon) {
    return "Your YouTube session is expiring soon and will be refreshed automatically during conversion.";
  }

  return "Connect YouTube, import a Spotify playlist, and convert tracks when ready.";
}
