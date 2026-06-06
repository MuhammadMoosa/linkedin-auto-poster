import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { renderDayImageBuffer } from "@/lib/render-day-image";
import { loadContent, PostsError, uploadDayImage } from "@/lib/posts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface DayImageResult {
  day: number;
  success: boolean;
  imagePath?: string;
  error?: string;
}

export async function POST() {
  try {
    const { content } = await loadContent();
    const sortedDays = [...content.days].sort((a, b) => a.day - b.day);
    const results: DayImageResult[] = [];

    for (const dayPost of sortedDays) {
      try {
        const buffer = await renderDayImageBuffer(dayPost.day);
        const imagePath = await uploadDayImage(dayPost.day, buffer, "image/png");
        results.push({ day: dayPost.day, success: true, imagePath });
        logger.info("Batch image generated", { day: dayPost.day, imagePath });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Image generation failed";
        results.push({ day: dayPost.day, success: false, error: message });
        logger.error("Batch image generation failed", {
          day: dayPost.day,
          error: message,
        });
      }
    }

    const generated = results.filter((entry) => entry.success).length;
    const total = sortedDays.length;
    const allSucceeded = generated === total;

    logger.apiRequest("POST", "/api/generate-all-images", allSucceeded ? 200 : 207);

    return NextResponse.json(
      {
        success: allSucceeded,
        generated,
        total,
        results,
        message: allSucceeded
          ? `Generated ${generated} images for all days`
          : `Generated ${generated} of ${total} images — check results for failures`,
      },
      { status: allSucceeded ? 200 : 207 }
    );
  } catch (error) {
    if (error instanceof PostsError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode }
      );
    }

    const message =
      error instanceof Error ? error.message : "Batch image generation failed";

    logger.error("Generate all images failed", { error: message });

    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
