import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://rmtlaunch.fun"),
  title: "RMT — Your ecosystem. All together.",
  description: "Discover projects, games, and creative tools. Save your favorites and launch them from one personal library.",
  alternates: { canonical: "https://rmtlaunch.fun/" },
  openGraph: {
    type: "website",
    siteName: "RMT",
    title: "RMT — Your ecosystem. All together.",
    description: "Discover projects, games, and creative tools. Save your favorites and launch them from one personal library.",
    url: "https://rmtlaunch.fun/",
    images: [{ url: "/social/rmt-v1.jpg", width: 1200, height: 630, type: "image/jpeg", alt: "RMT — Your ecosystem. All together. Projects, games, and creative tools." }],
  },
  twitter: {
    card: "summary_large_image",
    title: "RMT — Your ecosystem. All together.",
    description: "Discover projects, games, and creative tools. Save your favorites and launch them from one personal library.",
    images: [{ url: "https://rmtlaunch.fun/social/rmt-v1.jpg", alt: "RMT — Your ecosystem. All together. Projects, games, and creative tools." }],
  },
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "RMT", statusBarStyle: "black-translucent" },
  icons: {
    icon: [
      { url: "/icons/rmt-32-v5.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/rmt-mark-v5.png", sizes: "192x192", type: "image/png" },
    ],
    shortcut: "/icons/rmt-32-v5.png",
    apple: { url: "/icons/rmt-180-v5.png", sizes: "180x180", type: "image/png" },
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
