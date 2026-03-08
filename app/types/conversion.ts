import { Track } from "@/app/types/playlist";

export interface MatchedTrackResult {
  track: Track;
  videoId: string;
  youtubeTitle: string;
}

export interface FailedTrackResult {
  track: Track;
  attemptedQueries: string[];
  reason: string;
}

export interface PlaylistConversionResult {
  youtubePlaylistId: string;
  youtubePlaylistUrl: string;
  totalTracks: number;
  matchedCount: number;
  failedCount: number;
  matchedTracks: MatchedTrackResult[];
  failedTracks: FailedTrackResult[];
}
