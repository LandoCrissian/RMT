import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "RMT — Your ecosystem. All together.",
  description: "Discover projects, games, and creative tools. Save your favorites and launch them from one personal library.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "RMT", statusBarStyle: "black-translucent" },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
    apple: "/icons/rmt-192.png",
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
