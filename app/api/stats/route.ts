import { getBlobUrlByPathname } from "../_blob";

export const runtime = "nodejs";

export async function GET() {
  const url = await getBlobUrlByPathname("index/meta.json");
  if (!url) {
    return Response.json({ ok: true, manifests: [], manifestCount: 0, totalLpn: 0, shards: 0 });
  }
  const res = await fetch(url, { cache: "no-store" });
  const meta = res.ok ? await res.json() : null;

  return Response.json({
    ok: true,
    manifests: meta?.manifests ?? [],
    manifestCount: (meta?.manifests ?? []).length,
    totalLpn: meta?.totalLpn ?? 0,
    shards: meta?.shards ?? 0,
    updatedAt: meta?.updatedAt ?? null,
  });
}
