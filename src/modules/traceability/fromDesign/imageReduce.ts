// Reduces an image in the browser before it is sent (IA-18, ADR-0037): long edge
// at most MAX_EDGE, WebP (JPEG where the webview has no WebP encoder) on a white
// background. Drawing on a canvas also drops EXIF and every other metadata
// (location, camera, author) of the original file.

import type { AiImageType } from "@modules/ai";
import { IMAGE_QUALITY, MAX_EDGE, fitWithin } from "./limits";

export interface ReducedImage {
  mediaType: AiImageType;
  data: string;
  width: number;
  height: number;
}

async function decode(blob: Blob): Promise<CanvasImageSource & { width: number; height: number }> {
  // SVG has no bitmap decoder: it is drawn through an <img>.
  if (blob.type === "image/svg+xml" || typeof createImageBitmap !== "function") {
    const url = URL.createObjectURL(blob);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      return Object.assign(img, { width: img.naturalWidth || 1024, height: img.naturalHeight || 768 });
    } finally {
      URL.revokeObjectURL(url);
    }
  }
  return createImageBitmap(blob);
}

export async function reduceImage(blob: Blob): Promise<ReducedImage> {
  const source = await decode(blob);
  const { width, height } = fitWithin(source.width, source.height, MAX_EDGE);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no-canvas");
  // The image background, not a UI colour: transparent areas would turn black in JPEG.
  ctx.fillStyle = "white";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(source, 0, 0, width, height);
  if ("close" in source && typeof source.close === "function") source.close();
  let url = canvas.toDataURL("image/webp", IMAGE_QUALITY);
  let mediaType: AiImageType = "image/webp";
  if (!url.startsWith("data:image/webp")) {
    url = canvas.toDataURL("image/jpeg", IMAGE_QUALITY);
    mediaType = "image/jpeg";
  }
  return { mediaType, data: url.slice(url.indexOf(",") + 1), width, height };
}
