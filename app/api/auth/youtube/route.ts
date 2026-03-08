import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";

import { getErrorMessage } from "@/app/lib/errors";
import { logError } from "@/app/lib/logger";
import { getGoogleOAuthConfig } from "@/app/lib/server-config";
import { setYoutubeTokenCookie } from "@/app/lib/youtube-auth";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const { clientId, clientSecret, redirectUrl, scopes, hostedUrl } = getGoogleOAuthConfig(request);

  const code = searchParams.get("code"),
    oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUrl);

  if (!code) {
    const url = oauth2Client.generateAuthUrl({
      access_type: "offline",
      scope: scopes,
      redirect_uri: redirectUrl,
      prompt: "consent",
    });

    return NextResponse.redirect(url);
  }

  try {
    const { tokens } = await oauth2Client.getToken({ code, redirect_uri: redirectUrl });
    oauth2Client.setCredentials(tokens);

    const response = NextResponse.redirect(hostedUrl);
    setYoutubeTokenCookie(response, tokens);

    return response;
  } catch (error) {
    logError("Failed to complete YouTube OAuth flow", error);
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
