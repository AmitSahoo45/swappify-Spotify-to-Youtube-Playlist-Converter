import { NextRequest, NextResponse } from "next/server";
import { parseYoutubeTokens } from "@/app/lib/validation";
import { isYoutubeTokenExpiring, YOUTUBE_TOKEN_COOKIE_NAME } from "@/app/lib/youtube-auth";

export async function GET(request: NextRequest) {
  const tokenCookie = request.cookies.get(YOUTUBE_TOKEN_COOKIE_NAME)?.value;

  if (!tokenCookie) {
    return NextResponse.json({ isAuthenticated: false, expiresSoon: false });
  }

  try {
    const tokens = parseYoutubeTokens(tokenCookie);
    return NextResponse.json({
      isAuthenticated: true,
      expiresSoon: isYoutubeTokenExpiring(tokens),
    });
  } catch {
    return NextResponse.json({ isAuthenticated: false, expiresSoon: false });
  }
}
