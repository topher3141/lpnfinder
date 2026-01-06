// app/layout.tsx
import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";

export const metadata: Metadata = {
  title: "LPN Finder",
  description: "Scan or type an LPN to retrieve item details and print Zebra labels.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        {/* Load bridge.js early so native Capacitor plugin gets exposed as window.ZebraBridge */}
        <Script src="/bridge.js" strategy="beforeInteractive" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
      </head>
      <body>{children}</body>
    </html>
  );
}
