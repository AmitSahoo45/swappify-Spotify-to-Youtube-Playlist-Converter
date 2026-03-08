import { NextResponse } from "next/server";

export interface YoutubeTokens {
  access_token?: string;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
  expiry_date?: number;
}

type YoutubeTokensLike = {
  access_token?: string | null;
  refresh_token?: string | null;
  scope?: string | null;
  token_type?: string | null;
  expiry_date?: number | null;
};

export const YOUTUBE_TOKEN_COOKIE_NAME = "youtube_token";
export const YOUTUBE_TOKEN_REFRESH_WINDOW_MS = 10 * 60 * 1000;

export function normalizeYoutubeTokens(tokens: YoutubeTokensLike): YoutubeTokens {
  const normalizedTokens: YoutubeTokens = {};

  if (tokens.access_token) {
    normalizedTokens.access_token = tokens.access_token;
  }

  if (tokens.refresh_token) {
    normalizedTokens.refresh_token = tokens.refresh_token;
  }

  if (tokens.scope) {
    normalizedTokens.scope = tokens.scope;
  }

  if (tokens.token_type) {
    normalizedTokens.token_type = tokens.token_type;
  }

  if (typeof tokens.expiry_date === "number") {
    normalizedTokens.expiry_date = tokens.expiry_date;
  }

  return normalizedTokens;
}

export function isYoutubeTokenExpiring(tokens: YoutubeTokensLike, now = Date.now()) {
  const normalizedTokens = normalizeYoutubeTokens(tokens);

  if (!normalizedTokens.expiry_date) {
    return false;
  }

  return normalizedTokens.expiry_date <= now + YOUTUBE_TOKEN_REFRESH_WINDOW_MS;
}

export function shouldRefreshYoutubeTokens(tokens: YoutubeTokensLike, now = Date.now()) {
  const normalizedTokens = normalizeYoutubeTokens(tokens);

  return Boolean(normalizedTokens.refresh_token) && (!normalizedTokens.access_token || isYoutubeTokenExpiring(normalizedTokens, now));
}

export function mergeYoutubeTokens(currentTokens: YoutubeTokensLike, nextTokens: YoutubeTokensLike): YoutubeTokens {
  const normalizedCurrentTokens = normalizeYoutubeTokens(currentTokens);
  const normalizedNextTokens = normalizeYoutubeTokens(nextTokens);

  return {
    ...normalizedCurrentTokens,
    ...normalizedNextTokens,
    refresh_token: normalizedNextTokens.refresh_token ?? normalizedCurrentTokens.refresh_token,
  };
}

export function setYoutubeTokenCookie(response: NextResponse, tokens: YoutubeTokensLike) {
  response.cookies.set(YOUTUBE_TOKEN_COOKIE_NAME, JSON.stringify(normalizeYoutubeTokens(tokens)), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    sameSite: "lax",
  });
}

export function clearYoutubeTokenCookie(response: NextResponse) {
  response.cookies.set(YOUTUBE_TOKEN_COOKIE_NAME, "", {
    httpOnly: true,
    maxAge: 0,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
}
