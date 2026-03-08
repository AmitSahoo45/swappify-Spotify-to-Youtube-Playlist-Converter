import "server-only";

import type { NextRequest } from "next/server";
import { z } from "zod";

function readEnv(name: string, legacyName?: string) {
  return process.env[name] || (legacyName ? process.env[legacyName] : undefined);
}

function getRequiredEnv(name: string, legacyName?: string) {
  const value = readEnv(name, legacyName);

  const result = z.string().trim().min(1).safeParse(value);

  if (!result.success) {
    const legacyHint = legacyName ? ` or ${legacyName}` : "";
    throw new Error(`Missing required environment variable: ${name}${legacyHint}`);
  }

  return result.data;
}

function getOptionalUrlEnv(name: string, legacyName?: string) {
  const value = readEnv(name, legacyName);

  if (!value) {
    return undefined;
  }

  const result = z.string().url().safeParse(value);

  if (!result.success) {
    const legacyHint = legacyName ? ` or ${legacyName}` : "";
    throw new Error(`Invalid URL environment variable: ${name}${legacyHint}`);
  }

  return result.data;
}

function getBaseUrl(request?: NextRequest) {
  return getOptionalUrlEnv("APP_URL", "NEXT_PUBLIC_URL") || request?.nextUrl.origin || "http://localhost:3000";
}

export function getSpotifyConfig() {
  return {
    clientId: getRequiredEnv("SPOTIFY_CLIENT_ID"),
    clientSecret: getRequiredEnv("SPOTIFY_CLIENT_SECRET"),
  };
}

export function getGoogleOAuthConfig(request: NextRequest) {
  const hostedUrl = getBaseUrl(request);
  const scopes = getRequiredEnv("GOOGLE_YOUTUBE_SCOPES")
    .split(/[,\s]+/)
    .map((scope) => scope.trim())
    .filter(Boolean);

  if (scopes.length === 0) {
    throw new Error("Missing required environment variable: GOOGLE_YOUTUBE_SCOPES");
  }

  return {
    clientId: getRequiredEnv("GOOGLE_CLIENT_ID"),
    clientSecret: getRequiredEnv("GOOGLE_CLIENT_SECRET"),
    redirectUrl: getOptionalUrlEnv("GOOGLE_REDIRECT_URL") || `${hostedUrl}/api/auth/youtube`,
    scopes,
    hostedUrl,
  };
}
