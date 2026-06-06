import { mkdir, readFile, readdir, writeFile } from "fs/promises";
import path from "path";
import {
  readBinaryFromGitHub,
  writeBinaryToGitHub,
} from "./github";
import {
  assertPersistableStorage,
  shouldUseLocalStorage,
} from "./storage";

const IMAGES_DIR = path.join(process.cwd(), "data", "images");
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

export interface ResolvedImage {
  buffer: Buffer;
  mimeType: string;
  filename: string;
  relativePath: string;
}

const MIME_BY_EXT: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
};

function extensionFromMime(mimeType: string): string {
  switch (mimeType) {
    case "image/jpeg":
      return ".jpg";
    case "image/png":
      return ".png";
    case "image/gif":
      return ".gif";
    case "image/webp":
      return ".webp";
    default:
      return ".jpg";
  }
}

export function validateImageFile(buffer: Buffer, mimeType: string): void {
  if (buffer.length === 0) {
    throw new Error("Image file is empty");
  }

  if (buffer.length > MAX_IMAGE_BYTES) {
    throw new Error(
      `Image exceeds maximum size of ${MAX_IMAGE_BYTES / 1024 / 1024}MB`
    );
  }

  const allowed = Object.values(MIME_BY_EXT);
  if (!allowed.includes(mimeType)) {
    throw new Error(
      `Unsupported image type: ${mimeType}. Use JPEG, PNG, GIF, or WebP.`
    );
  }
}

export async function ensureImagesDir(): Promise<void> {
  await mkdir(IMAGES_DIR, { recursive: true });
}

export async function saveDayImage(
  day: number,
  buffer: Buffer,
  mimeType: string
): Promise<string> {
  validateImageFile(buffer, mimeType);
  assertPersistableStorage("Saving post images");

  const ext = extensionFromMime(mimeType);
  const filename = `day-${day}${ext}`;
  const relativePath = `data/images/${filename}`;

  if (shouldUseLocalStorage()) {
    await ensureImagesDir();
    await writeFile(path.join(IMAGES_DIR, filename), buffer);
  } else {
    await writeBinaryToGitHub(
      relativePath,
      buffer,
      `chore: upload image for day ${day}`
    );
  }

  return relativePath;
}

async function readImageAtPath(
  relativePath: string
): Promise<ResolvedImage | null> {
  const filename = path.basename(relativePath);
  const ext = path.extname(filename).toLowerCase();
  const mimeType = MIME_BY_EXT[ext] ?? "image/jpeg";

  if (shouldUseLocalStorage()) {
    const absolutePath = path.join(process.cwd(), relativePath);
    try {
      const buffer = await readFile(absolutePath);
      return { buffer, mimeType, filename, relativePath };
    } catch {
      return null;
    }
  }

  const buffer = await readBinaryFromGitHub(relativePath);
  if (!buffer) return null;

  return { buffer, mimeType, filename, relativePath };
}

export async function findDayImageFile(
  day: number
): Promise<ResolvedImage | null> {
  if (shouldUseLocalStorage()) {
    await ensureImagesDir();
    try {
      const files = await readdir(IMAGES_DIR);
      const match = files.find((file) => {
        const base = path.basename(file, path.extname(file));
        return base === `day-${day}`;
      });
      if (!match) return null;
      return readImageAtPath(path.join("data", "images", match));
    } catch {
      return null;
    }
  }

  for (const ext of Object.keys(MIME_BY_EXT)) {
    const relativePath = `data/images/day-${day}${ext}`;
    const image = await readImageAtPath(relativePath);
    if (image) return image;
  }

  return null;
}

export async function resolveDayImage(
  day: number,
  imagePath?: string | null
): Promise<ResolvedImage | null> {
  if (imagePath) {
    const fromPath = await readImageAtPath(imagePath);
    if (fromPath) return fromPath;
  }

  return findDayImageFile(day);
}

export async function dayHasImage(
  day: number,
  imagePath?: string | null
): Promise<boolean> {
  const image = await resolveDayImage(day, imagePath);
  return image !== null;
}
