import type { ImageResponse } from "next/og";
import { createMetadataImage } from "./metadata-image";

export const size = {
  width: 512,
  height: 512,
};

export const contentType = "image/png";

export default function Icon(): ImageResponse {
  return createMetadataImage({
    width: 512,
    height: 512,
    title: "DockForge",
    subtitle: "Docker groups and dependency-aware local orchestration.",
    compact: true,
  });
}

