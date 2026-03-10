import type { ImageResponse } from "next/og";
import { createMetadataImage } from "./metadata-image";

export const size = {
  width: 1200,
  height: 630,
};

export const contentType = "image/png";

export default function OpenGraphImage(): ImageResponse {
  return createMetadataImage({
    width: 1200,
    height: 630,
    title: "DockForge",
    subtitle: "Organize local containers into app-managed groups, model dependencies, and keep raw Docker runtime detail in reach.",
  });
}

