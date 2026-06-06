import { NextRequest, NextResponse } from "next/server";
import { loadContent, findPostByDay, PostsError } from "@/lib/posts";
import { resolveDayImage } from "@/lib/images";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ day: string }> }
) {
  try {
    const { day: dayParam } = await context.params;
    const day = Number.parseInt(dayParam, 10);

    if (Number.isNaN(day) || day < 1) {
      return NextResponse.json({ error: "Invalid day" }, { status: 400 });
    }

    const { content } = await loadContent();
    const dayPost = findPostByDay(content, day);

    if (!dayPost) {
      return NextResponse.json({ error: "Day not found" }, { status: 404 });
    }

    const image = await resolveDayImage(day, dayPost.imagePath);

    if (!image) {
      return NextResponse.json({ error: "No image for this day" }, { status: 404 });
    }

    logger.apiRequest("GET", `/api/images/${day}`, 200);

    return new NextResponse(new Uint8Array(image.buffer), {
      status: 200,
      headers: {
        "Content-Type": image.mimeType,
        "Cache-Control": "public, max-age=60",
      },
    });
  } catch (error) {
    if (error instanceof PostsError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }

    return NextResponse.json({ error: "Failed to load image" }, { status: 500 });
  }
}
