import type { ImageResponse } from "next/og";
import { createMetadataImage } from "./metadata-image";

export const size = {
  width: 180,
  height: 180,
};

export const contentType = "image/png";

export default function AppleIcon(): ImageResponse {
  return createMetadataImage({
    width: 180,
    height: 180,
    title: "DockForge",
    subtitle: "Local Docker control center.",
    compact: true,
  });
}

