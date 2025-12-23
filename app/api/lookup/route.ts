import { getBlobUrlByPathname } from "../_blob";

export const runtime = "nodejs";

function normalizeLpn(input: string) {
  return (input || "").trim().replace(/\s+/g, "").toUpperCase();
}

function shardFor(lpn: string) {
  const s = normalizeLpn(lpn);
  return (s.slice(0,2) || "00").padEnd(2, "0");
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const lpnRaw = searchParams.get("lpn") || "";
  const lpn = normalizeLpn(lpnRaw);

  if (!lpn) return Response.json({ ok: false, error: "Missing lpn parameter" }, { status: 400 });

  const shard = shardFor(lpn);
  const pathname = `index/shards/${shard}.json`;
  const url = await getBlobUrlByPathname(pathname);

  if (!url) return Response.json({ ok: true, found: false, lpn });

  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) return Response.json({ ok: false, error: `Failed to read shard ${shard}` }, { status: 500 });
  const data = await res.json();
  const record = data?.index?.[lpn];

  if (!record) return Response.json({ ok: true, found: false, lpn });
  return Response.json({ ok: true, found: true, lpn, record });
}
