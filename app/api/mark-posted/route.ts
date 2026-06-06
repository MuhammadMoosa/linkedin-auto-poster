import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { markPostAsPosted, PostsError } from "@/lib/posts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { day?: number };

    if (!body.day || body.day < 1) {
      return NextResponse.json(
        { success: false, error: "Valid day number is required" },
        { status: 400 }
      );
    }

    const result = await markPostAsPosted(body.day);

    logger.apiRequest("POST", "/api/mark-posted", 200);

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    if (error instanceof PostsError) {
      logger.apiRequest("POST", "/api/mark-posted", error.statusCode);
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode }
      );
    }

    const message =
      error instanceof Error ? error.message : "Unknown error occurred";

    logger.apiRequest("POST", "/api/mark-posted", 500);

    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
