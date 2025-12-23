import "./globals.css";

export const metadata = {
  title: "LPN Finder",
  description: "Search manifests by LPN (indexed at deploy time)",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
