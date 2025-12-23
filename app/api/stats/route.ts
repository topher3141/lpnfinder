import { getBlobUrlByPathname } from "../_blob";

export const runtime = "nodejs";

export async function GET() {
  const url = await getBlobUrlByPathname("index/meta.json");
  if (!url) {
    return Response.json({ ok: true, manifests: [], manifestCount: 0, totalLpn: 0, shards: 0, updatedAt: null });
  }
  const res = await fetch(url, { cache: "no-store" });
  const meta = res.ok ? await res.json() : null;

  const manifests = meta?.manifests ?? [];
  const totalLpn = meta?.totalLpn ?? 0;
  const shards = (meta?.shardsList?.length ?? meta?.shards ?? 0);

  return Response.json({
    ok: true,
    manifests,
    manifestCount: manifests.length,
    totalLpn,
    shards,
    updatedAt: meta?.updatedAt ?? null,
  });
}
