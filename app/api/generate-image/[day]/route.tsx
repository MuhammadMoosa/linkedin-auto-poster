import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { renderDayImageBuffer } from "@/lib/render-day-image";
import { PostsError, uploadDayImage } from "@/lib/posts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ day: string }> }
) {
  try {
    const { day: dayParam } = await context.params;
    const dayNumber = Number.parseInt(dayParam, 10);

    if (Number.isNaN(dayNumber) || dayNumber < 1) {
      return NextResponse.json({ error: "Invalid day" }, { status: 400 });
    }

    const save = request.nextUrl.searchParams.get("save") === "true";
    const buffer = await renderDayImageBuffer(dayNumber);

    if (save) {
      const imagePath = await uploadDayImage(dayNumber, buffer, "image/png");
      logger.apiRequest("GET", `/api/generate-image/${dayNumber}?save=true`, 200);

      return NextResponse.json({
        success: true,
        day: dayNumber,
        imagePath,
        previewUrl: `/api/images/${dayNumber}?v=${Date.now()}`,
        message: `Generated image for day ${dayNumber}`,
      });
    }

    logger.apiRequest("GET", `/api/generate-image/${dayNumber}`, 200);

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    if (error instanceof PostsError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode }
      );
    }

    const message =
      error instanceof Error ? error.message : "Image generation failed";

    logger.error("Generate image failed", { error: message });

    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}

export async function POST(
  _request: NextRequest,
  context: { params: Promise<{ day: string }> }
) {
  const { day: dayParam } = await context.params;
  const url = new URL(_request.url);
  url.searchParams.set("save", "true");

  const getRequest = new NextRequest(url, { method: "GET" });
  return GET(getRequest, { params: Promise.resolve({ day: dayParam }) });
}
