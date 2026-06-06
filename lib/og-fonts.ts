import { readFile } from "fs/promises";
import path from "path";

let cachedFontData: ArrayBuffer | null = null;

const FONT_PATH = path.join(
  process.cwd(),
  "node_modules/next/dist/compiled/@vercel/og/noto-sans-v27-latin-regular.ttf"
);

async function loadFontData(): Promise<ArrayBuffer> {
  if (cachedFontData) return cachedFontData;

  const buffer = await readFile(FONT_PATH);
  cachedFontData = buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength
  );

  return cachedFontData;
}

export async function getOgFonts() {
  const data = await loadFontData();

  return [
    {
      name: "Noto Sans",
      data,
      style: "normal" as const,
      weight: 400 as const,
    },
    {
      name: "Noto Sans",
      data,
      style: "normal" as const,
      weight: 700 as const,
    },
    {
      name: "Noto Sans",
      data,
      style: "normal" as const,
      weight: 800 as const,
    },
  ];
}
