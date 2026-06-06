import { ImageResponse } from "next/og";
import {
  buildPostImageData,
  LINKEDIN_IMAGE_HEIGHT,
  LINKEDIN_IMAGE_WIDTH,
} from "@/lib/image-generator";
import { getOgFonts } from "@/lib/og-fonts";
import { PostImageTemplate } from "@/lib/post-image-template";
import { findPostByDay, loadContent, PostsError } from "@/lib/posts";

export async function renderDayImageBuffer(dayNumber: number): Promise<Buffer> {
  const { content } = await loadContent();
  const dayPost = findPostByDay(content, dayNumber);

  if (!dayPost) {
    throw new PostsError(`Day ${dayNumber} not found`, 404);
  }

  const imageData = buildPostImageData(
    dayPost,
    content.meta,
    content.summaryStats
  );

  const fonts = await getOgFonts();

  const imageResponse = new ImageResponse(
    PostImageTemplate({ data: imageData }),
    {
      width: LINKEDIN_IMAGE_WIDTH,
      height: LINKEDIN_IMAGE_HEIGHT,
      fonts,
    }
  );

  return Buffer.from(await imageResponse.arrayBuffer());
}
