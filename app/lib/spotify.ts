import { Playlist, Track } from "@/app/types/playlist";
import { z } from "zod";

const spotifyTrackItemSchema = z.object({
  track: z
    .object({
      name: z.string().nullable().optional(),
      artists: z
        .array(
          z.object({
            name: z.string().nullable().optional(),
          })
        )
        .optional(),
    })
    .nullable()
    .optional(),
});

const spotifyPlaylistTracksSchema = z.object({
  items: z.array(spotifyTrackItemSchema),
  next: z.string().url().nullable().optional(),
});

const spotifyPlaylistResponseSchema = z.object({
  name: z.string(),
  description: z.string().nullable().optional(),
  owner: z.object({
    display_name: z.string().nullable().optional(),
  }),
  tracks: spotifyPlaylistTracksSchema,
});

export function extractSpotifyPlaylistId(spotifyUrl: string) {
  const match = spotifyUrl.match(/playlist\/([A-Za-z0-9]+)/i);
  return match?.[1] ?? null;
}

function parseSpotifyTracks(items: z.infer<typeof spotifyTrackItemSchema>[]): Track[] {
  return items
    .map((item) => ({
      trackName: item.track?.name?.trim() || "",
      artistName: item.track?.artists?.[0]?.name?.trim() || "Unknown Artist",
    }))
    .filter((track) => track.trackName.length > 0);
}

export function parseSpotifyPlaylistResponse(payload: unknown): Playlist {
  const playlistData = spotifyPlaylistResponseSchema.parse(payload);

  return {
    name: playlistData.name,
    description: playlistData.description ?? "",
    ownerName: playlistData.owner.display_name || "Unknown Owner",
    tracks: parseSpotifyTracks(playlistData.tracks.items),
  };
}

export function parseSpotifyPlaylistTracksPage(payload: unknown) {
  const playlistTracks = spotifyPlaylistTracksSchema.parse(payload);

  return {
    tracks: parseSpotifyTracks(playlistTracks.items),
    next: playlistTracks.next ?? null,
  };
}
