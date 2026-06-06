import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { publishNextPost, PostsError } from "@/lib/posts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function verifyPublishSecret(request: NextRequest): boolean {
  const secret = process.env.PUBLISH_SECRET;
  if (!secret) {
    return true;
  }

  const authHeader = request.headers.get("authorization");
  const querySecret = request.nextUrl.searchParams.get("secret");

  return authHeader === `Bearer ${secret}` || querySecret === secret;
}

export async function GET(request: NextRequest) {
  if (!verifyPublishSecret(request)) {
    logger.warn("Unauthorized publish attempt");
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  try {
    const result = await publishNextPost();

    logger.apiRequest("GET", "/api/publish", 200);

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    if (error instanceof PostsError) {
      logger.publishFailure(null, null, error.message, error.statusCode);
      logger.apiRequest("GET", "/api/publish", error.statusCode);

      return NextResponse.json(
        {
          success: false,
          error: error.message,
          details: error.details ?? null,
        },
        { status: error.statusCode }
      );
    }

    const message =
      error instanceof Error ? error.message : "Unknown error occurred";

    logger.publishFailure(null, null, message);
    logger.apiRequest("GET", "/api/publish", 500);

    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
