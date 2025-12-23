import "./globals.css";

export const metadata = {
  title: "LPN Finder",
  description: "Upload a manifest and look up items by LPN",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
