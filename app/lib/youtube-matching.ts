import { Track } from "@/app/types/playlist";

export interface YoutubeVideoCandidate {
  videoId: string;
  title: string;
  description?: string | null;
  channelTitle?: string | null;
}

const removableNoisePattern =
  /\b(?:feat\.?|ft\.?|featuring|official(?:\s+music)?\s+video|official\s+audio|lyrics?|lyric\s+video|visualizer|audio|video|hq|hd|remaster(?:ed)?(?:\s+\d{4})?)\b/gi;
const signalWords = ["live", "remix", "acoustic", "karaoke", "instrumental"] as const;

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

export function normalizeTrackText(value: string) {
  return normalizeWhitespace(
    value
      .toLowerCase()
      .replace(/\([^)]*\)|\[[^\]]*\]/g, " ")
      .replace(removableNoisePattern, " ")
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
  );
}

export function buildYoutubeSearchQueries(track: Track) {
  const originalQuery = normalizeWhitespace(`${track.trackName} ${track.artistName}`);
  const normalizedTrackName = normalizeTrackText(track.trackName);
  const normalizedArtistName = normalizeTrackText(track.artistName);
  const normalizedQuery = normalizeWhitespace(`${normalizedTrackName} ${normalizedArtistName}`);

  return Array.from(new Set([originalQuery, normalizedQuery])).filter(Boolean);
}

function getSignalScore(track: Track, candidateTitle: string) {
  return signalWords.reduce((score, signalWord) => {
    const trackHasSignal = new RegExp(`\\b${escapeRegExp(signalWord)}\\b`, "i").test(track.trackName);
    const candidateHasSignal = new RegExp(`\\b${escapeRegExp(signalWord)}\\b`, "i").test(candidateTitle);

    if (trackHasSignal && candidateHasSignal) {
      return score + 12;
    }

    if (!trackHasSignal && candidateHasSignal) {
      return score - 15;
    }

    return score;
  }, 0);
}

export function scoreYoutubeCandidate(track: Track, candidate: YoutubeVideoCandidate) {
  const normalizedTitle = normalizeTrackText(candidate.title);
  const normalizedTrackName = normalizeTrackText(track.trackName);
  const normalizedArtistName = normalizeTrackText(track.artistName);

  let score = 0;

  if (normalizedTrackName && normalizedTitle.includes(normalizedTrackName)) {
    score += 45;
  }

  if (normalizedArtistName && normalizedTitle.includes(normalizedArtistName)) {
    score += 25;
  }

  const sharedTrackTokens = normalizedTrackName
    .split(" ")
    .filter(Boolean)
    .filter((token) => normalizedTitle.includes(token));
  score += sharedTrackTokens.length * 4;

  if (/official/i.test(candidate.title)) {
    score += 3;
  }

  score += getSignalScore(track, candidate.title);

  return score;
}

export function selectBestYoutubeCandidate(track: Track, candidates: YoutubeVideoCandidate[]) {
  return candidates.reduce<{ candidate?: YoutubeVideoCandidate; score: number }>(
    (bestMatch, candidate) => {
      const score = scoreYoutubeCandidate(track, candidate);

      if (score > bestMatch.score) {
        return { candidate, score };
      }

      return bestMatch;
    },
    { score: Number.NEGATIVE_INFINITY }
  ).candidate;
}
