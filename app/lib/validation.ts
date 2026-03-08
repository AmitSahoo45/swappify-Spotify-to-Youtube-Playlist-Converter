import { RequestValidationError } from "@/app/lib/errors";
import { Playlist } from "@/app/types/playlist";
import { z } from "zod";

const trackSchema = z.object({
  trackName: z.string().trim().min(1, "Track name is required"),
  artistName: z.string().trim().min(1, "Artist name is required"),
});

const playlistSchema = z.object({
  name: z.string().trim().min(1, "Playlist name is required"),
  description: z.string().default(""),
  ownerName: z.string().trim().min(1, "Playlist owner is required"),
  tracks: z.array(trackSchema).min(1, "Playlist must contain at least one track"),
});

const parseSpotifyRequestSchema = z.object({
  spotifyUrl: z.string().trim().min(1, "Spotify playlist URL is required"),
});

const createPlaylistRequestSchema = z.object({
  playlist: playlistSchema,
});

const youtubeTokenSchema = z
  .object({
    access_token: z.string().trim().min(1).optional(),
    refresh_token: z.string().trim().min(1).optional(),
    scope: z.string().optional(),
    token_type: z.string().optional(),
    expiry_date: z.number().optional(),
  })
  .refine((token) => Boolean(token.access_token || token.refresh_token), {
    message: "Missing YouTube OAuth credentials",
  });

function toValidationError(prefix: string, error: z.ZodError) {
  const issueMessage = error.issues.map((issue) => issue.message).join(", ");
  return new RequestValidationError(`${prefix}: ${issueMessage}`);
}

export function parseSpotifyRequest(payload: unknown) {
  const result = parseSpotifyRequestSchema.safeParse(payload);

  if (!result.success) {
    throw toValidationError("Invalid Spotify request", result.error);
  }

  return result.data;
}

export function parseCreatePlaylistRequest(payload: unknown): { playlist: Playlist } {
  const result = createPlaylistRequestSchema.safeParse(payload);

  if (!result.success) {
    throw toValidationError("Invalid playlist request", result.error);
  }

  return result.data;
}

export function parseYoutubeTokens(tokenCookie?: string) {
  if (!tokenCookie) {
    throw new RequestValidationError("Not authenticated");
  }

  let parsedToken: unknown;

  try {
    parsedToken = JSON.parse(tokenCookie);
  } catch {
    throw new RequestValidationError("Invalid YouTube authentication token");
  }

  const result = youtubeTokenSchema.safeParse(parsedToken);

  if (!result.success) {
    throw toValidationError("Invalid YouTube authentication token", result.error);
  }

  return result.data;
}
