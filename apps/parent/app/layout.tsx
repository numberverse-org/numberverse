import type { Metadata, Viewport } from "next";
import "./globals.css";
import PwaBoot from "./PwaBoot";

// basePath is /parent in the demo build (empty in local dev), and metadata
// URLs are NOT auto-prefixed by Next — so build every asset path from it.
const base = process.env.NEXT_PUBLIC_BASE_PATH || "";

export const metadata: Metadata = {
  title: "Numberverse — Parent Portal",
  description:
    "Control your child's Numberverse learning — subjects, difficulty, daily playtime, voice, and progress.",
  applicationName: "Numberverse Parent Portal",
  // Explicit manifest URL — Next does NOT basePath-prefix the auto-generated
  // app/manifest.ts route link, so point at the static copy in public/.
  manifest: `${base}/manifest.webmanifest`,
  // iOS PWA: full standalone experience + its own home-screen icon.
  appleWebApp: {
    capable: true,
    title: "Numberverse Parents",
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: `${base}/favicon.png`,
    apple: `${base}/apple-touch-icon.png`,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#6c4cf1",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <PwaBoot />
      </body>
    </html>
  );
}
