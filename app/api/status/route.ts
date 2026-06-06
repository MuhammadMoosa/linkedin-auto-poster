import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { getStatus, PostsError } from "@/lib/posts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const status = await getStatus();

    logger.apiRequest("GET", "/api/status", 200);

    return NextResponse.json(
      {
        success: true,
        status,
      },
      { status: 200 }
    );
  } catch (error) {
    if (error instanceof PostsError) {
      logger.apiRequest("GET", "/api/status", error.statusCode);
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode }
      );
    }

    const message =
      error instanceof Error ? error.message : "Unknown error occurred";

    logger.error("Status API error", { error: message });
    logger.apiRequest("GET", "/api/status", 500);

    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
