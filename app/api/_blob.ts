import { list } from "@vercel/blob";

export async function getBlobUrlByPathname(pathname: string): Promise<string | null> {
  // list() uses prefix matching; we filter for exact pathname
  const { blobs } = await list({ prefix: pathname, limit: 100 });
  const match = blobs.find(b => b.pathname === pathname);
  return match?.url ?? null;
}
