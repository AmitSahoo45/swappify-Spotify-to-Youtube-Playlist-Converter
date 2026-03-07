import "server-only";

import type { NextRequest } from "next/server";

function readEnv(name: string, legacyName?: string) {
  return process.env[name] || (legacyName ? process.env[legacyName] : undefined);
}

function getRequiredEnv(name: string, legacyName?: string) {
  const value = readEnv(name, legacyName);

  if (!value) {
    const legacyHint = legacyName ? ` or ${legacyName}` : "";
    throw new Error(`Missing required environment variable: ${name}${legacyHint}`);
  }

  return value;
}

function getBaseUrl(request?: NextRequest) {
  return readEnv("APP_URL", "NEXT_PUBLIC_URL") || request?.nextUrl.origin || "http://localhost:3000";
}

export function getSpotifyConfig() {
  return {
    clientId: getRequiredEnv("SPOTIFY_CLIENT_ID"),
    clientSecret: getRequiredEnv("SPOTIFY_CLIENT_SECRET"),
  };
}

export function getGoogleOAuthConfig(request: NextRequest) {
  const hostedUrl = getBaseUrl(request);

  return {
    clientId: getRequiredEnv("GOOGLE_CLIENT_ID"),
    clientSecret: getRequiredEnv("GOOGLE_CLIENT_SECRET"),
    redirectUrl: readEnv("GOOGLE_REDIRECT_URL") || `${hostedUrl}/api/auth/youtube`,
    scopes: getRequiredEnv("GOOGLE_YOUTUBE_SCOPES")
      .split(/[,\s]+/)
      .map((scope) => scope.trim())
      .filter(Boolean),
    hostedUrl,
  };
}
