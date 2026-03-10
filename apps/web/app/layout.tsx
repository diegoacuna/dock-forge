import "./globals.css";
import type { Metadata } from "next";
import { AppShell } from "../components/app-shell";
import { QueryProvider } from "../components/query-provider";

const siteUrl = process.env.SITE_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "DockForge",
    template: "%s | DockForge",
  },
  description: "Local Docker orchestration dashboard for dependency-aware groups, runtime visibility, and raw Docker inspect access.",
  applicationName: "DockForge",
  keywords: ["Docker", "orchestration", "containers", "local dashboard", "dependency graph"],
  alternates: {
    canonical: "/",
  },
  icons: {
    icon: [
      { url: "/icon", type: "image/png", sizes: "512x512" },
      { url: "/icon?size=192", type: "image/png", sizes: "192x192" },
    ],
    apple: [{ url: "/apple-icon", sizes: "180x180", type: "image/png" }],
    shortcut: ["/icon?size=32"],
  },
  manifest: "/manifest.webmanifest",
  openGraph: {
    type: "website",
    url: "/",
    siteName: "DockForge",
    title: "DockForge",
    description: "Organize local containers into app-managed groups, model dependency graphs, and inspect runtime state without losing raw Docker detail.",
    images: [
      {
        url: "/opengraph-image",
        width: 1200,
        height: 630,
        alt: "DockForge local Docker orchestration dashboard preview",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "DockForge",
    description: "Dependency-aware local Docker orchestration with group views, graph planning, and raw runtime visibility.",
    images: ["/twitter-image"],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <QueryProvider>
          <AppShell>{children}</AppShell>
        </QueryProvider>
      </body>
    </html>
  );
}
