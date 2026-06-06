import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { getAllDayPreviews, getStatus, PostsError } from "@/lib/posts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [status, days] = await Promise.all([getStatus(), getAllDayPreviews()]);

    logger.apiRequest("GET", "/api/days", 200);

    return NextResponse.json(
      {
        success: true,
        status,
        days,
      },
      { status: 200 }
    );
  } catch (error) {
    if (error instanceof PostsError) {
      logger.apiRequest("GET", "/api/days", error.statusCode);
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode }
      );
    }

    const message =
      error instanceof Error ? error.message : "Unknown error occurred";

    logger.apiRequest("GET", "/api/days", 500);

    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
