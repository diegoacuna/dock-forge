import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "DockForge",
    short_name: "DockForge",
    description: "Local Docker orchestration dashboard for dependency-aware groups, runtime visibility, and raw Docker inspect access.",
    start_url: "/",
    display: "standalone",
    background_color: "#111827",
    theme_color: "#f97316",
    icons: [
      {
        src: "/icon?size=192",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icon?size=512",
        sizes: "512x512",
        type: "image/png",
      },
      {
        src: "/apple-icon",
        sizes: "180x180",
        type: "image/png",
      },
    ],
  };
}

