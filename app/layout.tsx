import "./globals.css";

import SwRegister from "@/components/SwRegister";

export const metadata = {
  title: "LPN Finder",
  description: "Scan or type an LPN to retrieve item details.",
  manifest: "/manifest.webmanifest",
  themeColor: "#0b1220",
};


export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
<body>
  <SwRegister />
  {children}
</body>
    </html>
  );
}
