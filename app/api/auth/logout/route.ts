import { NextRequest, NextResponse } from "next/server";
import { clearYoutubeTokenCookie } from "@/app/lib/youtube-auth";

export async function GET(request: NextRequest) {
  const response = NextResponse.redirect(request.nextUrl.origin);
  clearYoutubeTokenCookie(response);
  return response;
}
