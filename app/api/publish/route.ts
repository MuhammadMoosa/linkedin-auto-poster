import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { publishPostByDay, uploadDayImage, PostsError } from "@/lib/posts";

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

function parseDayParam(value: string | null): number | undefined {
  if (!value) return undefined;
  const day = Number.parseInt(value, 10);
  if (Number.isNaN(day) || day < 1) {
    throw new PostsError("Invalid day parameter", 400);
  }
  return day;
}

async function handlePublish(request: NextRequest) {
  if (!verifyPublishSecret(request)) {
    logger.warn("Unauthorized publish attempt");
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  const contentType = request.headers.get("content-type") ?? "";

  try {
    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const dayRaw = formData.get("day");
      const day = parseDayParam(dayRaw ? String(dayRaw) : null);
      const requireImage = formData.get("requireImage") === "true";
      const file = formData.get("image");

      let imageBuffer: Buffer | undefined;
      let mimeType: string | undefined;

      if (file instanceof Blob && file.size > 0) {
        mimeType = file.type || "image/jpeg";
        imageBuffer = Buffer.from(await file.arrayBuffer());
        if (day) {
          await uploadDayImage(day, imageBuffer, mimeType);
        }
      }

      const result = await publishPostByDay(day, {
        imageBuffer,
        mimeType,
        requireImage,
      });

      logger.apiRequest(request.method, "/api/publish", 200);
      return NextResponse.json(result, { status: 200 });
    }

    const day = parseDayParam(request.nextUrl.searchParams.get("day"));
    let bodyDay: number | undefined;
    let requireImage = false;

    if (request.method === "POST") {
      try {
        const body = (await request.json()) as {
          day?: number;
          requireImage?: boolean;
        };
        bodyDay = body.day;
        requireImage = body.requireImage ?? false;
      } catch {
        // JSON body optional for GET-style POST
      }
    }

    const result = await publishPostByDay(day ?? bodyDay, { requireImage });

    logger.apiRequest(request.method, "/api/publish", 200);
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    if (error instanceof PostsError) {
      logger.publishFailure(null, null, error.message, error.statusCode);
      logger.apiRequest(request.method, "/api/publish", error.statusCode);

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
    logger.apiRequest(request.method, "/api/publish", 500);

    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  return handlePublish(request);
}

export async function POST(request: NextRequest) {
  return handlePublish(request);
}
