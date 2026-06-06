import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { uploadDayImage, PostsError } from "@/lib/posts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const dayRaw = formData.get("day");
    const file = formData.get("image");

    if (!dayRaw || !file || !(file instanceof Blob)) {
      return NextResponse.json(
        { success: false, error: "day and image file are required" },
        { status: 400 }
      );
    }

    const day = Number.parseInt(String(dayRaw), 10);
    if (Number.isNaN(day) || day < 1) {
      return NextResponse.json(
        { success: false, error: "Invalid day number" },
        { status: 400 }
      );
    }

    const mimeType = file.type || "image/jpeg";
    const buffer = Buffer.from(await file.arrayBuffer());
    const imagePath = await uploadDayImage(day, buffer, mimeType);

    logger.apiRequest("POST", "/api/upload-image", 200);

    return NextResponse.json(
      {
        success: true,
        day,
        imagePath,
        previewUrl: `/api/images/${day}`,
        message: `Image saved for day ${day}`,
      },
      { status: 200 }
    );
  } catch (error) {
    if (error instanceof PostsError) {
      logger.apiRequest("POST", "/api/upload-image", error.statusCode);
      return NextResponse.json(
        { success: false, error: error.message, details: error.details ?? null },
        { status: error.statusCode }
      );
    }

    const message =
      error instanceof Error ? error.message : "Image upload failed";

    logger.apiRequest("POST", "/api/upload-image", 500);

    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
