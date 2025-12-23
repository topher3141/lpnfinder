import { list } from "@vercel/blob";

/**
 * Vercel Blob keeps old versions even when you "overwrite" the same pathname.
 * So we must pick the MOST RECENT blob that matches the exact pathname.
 */
export async function getBlobUrlByPathname(pathname: string): Promise<string | null> {
  const { blobs } = await list({ prefix: pathname, limit: 1000 });
  const matches = blobs.filter((b) => b.pathname === pathname);
  if (matches.length === 0) return null;

  matches.sort((a, b) => {
    const ta = new Date((a as any).uploadedAt ?? 0).getTime();
    const tb = new Date((b as any).uploadedAt ?? 0).getTime();
    return tb - ta;
  });

  return matches[0]?.url ?? null;
}
