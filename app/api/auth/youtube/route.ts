import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";

import { getErrorMessage } from "@/app/lib/errors";
import { getGoogleOAuthConfig } from "@/app/lib/server-config";

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
    response.cookies.set("youtube_token", JSON.stringify(tokens), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      path: "/",
      sameSite: "lax",
    });

    return response;
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
