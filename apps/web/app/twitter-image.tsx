import type { ImageResponse } from "next/og";
import { createMetadataImage } from "./metadata-image";

export const size = {
  width: 1200,
  height: 630,
};

export const contentType = "image/png";

export default function TwitterImage(): ImageResponse {
  return createMetadataImage({
    width: 1200,
    height: 630,
    title: "DockForge",
    subtitle: "Dependency-aware local Docker orchestration with useful group views, graph planning, and inspect-first debugging.",
  });
}

