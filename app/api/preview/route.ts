import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { getPreview, PostsError } from "@/lib/posts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const preview = await getPreview();

    if (!preview) {
      logger.apiRequest("GET", "/api/preview", 200);
      return NextResponse.json(
        {
          success: true,
          message: "All posts have been published",
          preview: null,
        },
        { status: 200 }
      );
    }

    logger.apiRequest("GET", "/api/preview", 200);

    return NextResponse.json(
      {
        success: true,
        preview,
      },
      { status: 200 }
    );
  } catch (error) {
    if (error instanceof PostsError) {
      logger.apiRequest("GET", "/api/preview", error.statusCode);
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode }
      );
    }

    const message =
      error instanceof Error ? error.message : "Unknown error occurred";

    logger.error("Preview API error", { error: message });
    logger.apiRequest("GET", "/api/preview", 500);

    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
