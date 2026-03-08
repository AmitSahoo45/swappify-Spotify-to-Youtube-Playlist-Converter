import test from "node:test";
import assert from "node:assert/strict";

import {
  buildYoutubeSearchQueries,
  normalizeTrackText,
  scoreYoutubeCandidate,
  selectBestYoutubeCandidate,
  YoutubeVideoCandidate,
} from "@/app/lib/youtube-matching";
import { Track } from "@/app/types/playlist";

function createCandidate(title: string, videoId: string): YoutubeVideoCandidate {
  return { title, videoId };
}

test("normalizeTrackText removes noisy descriptors", () => {
  assert.equal(
    normalizeTrackText("Blinding Lights (Official Video) [Remastered 2020] feat. Artist"),
    "blinding lights artist"
  );
});

test("buildYoutubeSearchQueries keeps original query and adds normalized fallback without duplicates", () => {
  const track: Track = {
    trackName: "Blinding Lights (Official Video)",
    artistName: "The Weeknd",
  };

  assert.deepEqual(buildYoutubeSearchQueries(track), [
    "Blinding Lights (Official Video) The Weeknd",
    "blinding lights the weeknd",
  ]);
});

test("scoreYoutubeCandidate penalizes remix results when the source track is not a remix", () => {
  const track: Track = {
    trackName: "Levitating",
    artistName: "Dua Lipa",
  };

  const originalScore = scoreYoutubeCandidate(track, createCandidate("Dua Lipa - Levitating (Official Video)", "a"));
  const remixScore = scoreYoutubeCandidate(track, createCandidate("Dua Lipa - Levitating Remix", "b"));

  assert.ok(originalScore > remixScore);
});

test("selectBestYoutubeCandidate prefers the closest title match", () => {
  const track: Track = {
    trackName: "Yellow",
    artistName: "Coldplay",
  };

  const candidates: YoutubeVideoCandidate[] = [
    createCandidate("Coldplay - Yellow (Live in Buenos Aires)", "live"),
    createCandidate("Coldplay - Yellow (Official Video)", "official"),
    createCandidate("Coldplay Greatest Hits", "other"),
  ];

  assert.equal(selectBestYoutubeCandidate(track, candidates)?.videoId, "official");
});

test("selectBestYoutubeCandidate keeps live versions when the source track asks for them", () => {
  const track: Track = {
    trackName: "Yellow (Live)",
    artistName: "Coldplay",
  };

  const candidates: YoutubeVideoCandidate[] = [
    createCandidate("Coldplay - Yellow (Official Video)", "official"),
    createCandidate("Coldplay - Yellow (Live in Buenos Aires)", "live"),
  ];

  assert.equal(selectBestYoutubeCandidate(track, candidates)?.videoId, "live");
});
