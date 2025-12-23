import { put } from "@vercel/blob";
import { getBlobUrlByPathname } from "../_blob";
import * as XLSX from "xlsx";

export const runtime = "nodejs";

type RecordRow = Record<string, any> & {
  sheet: string;
  rowNumber: number;
  LPN?: string;
};

function normalizeLpn(input: string) {
  return (input || "").trim().replace(/\s+/g, "").toUpperCase();
}

function shardFor(lpn: string) {
  const s = normalizeLpn(lpn);
  return (s.slice(0,2) || "00").padEnd(2, "0");
}

function isMostlyEmpty(row: any[]) {
  const nonEmpty = row.filter((v) => String(v ?? "").trim() !== "");
  return nonEmpty.length === 0;
}

function findHeaderRow(rows: any[][], headerName: string) {
  const target = headerName.trim().toLowerCase();
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r] || [];
    for (let c = 0; c < row.length; c++) {
      const v = String(row[c] ?? "").trim().toLowerCase();
      if (v === target) return r;
    }
  }
  return -1;
}

function rowsToRecords(sheetName: string, rows: any[][]): RecordRow[] {
  const headerRowIndex = findHeaderRow(rows, "LPN");
  if (headerRowIndex < 0) return [];

  const headers = (rows[headerRowIndex] || []).map((h) => String(h ?? "").trim());
  const records: RecordRow[] = [];

  for (let r = headerRowIndex + 1; r < rows.length; r++) {
    const row = rows[r] || [];
    if (isMostlyEmpty(row)) continue;

    const obj: RecordRow = { sheet: sheetName, rowNumber: r + 1 };
    for (let c = 0; c < headers.length; c++) {
      const key = headers[c];
      if (!key) continue;
      obj[key] = row[c];
    }

    if (obj.LPN != null) obj.LPN = String(obj.LPN).trim();
    if (String(obj.LPN ?? "").trim() !== "") records.push(obj);
  }
  return records;
}

async function readJsonFromBlob(pathname: string): Promise<any | null> {
  const url = await getBlobUrlByPathname(pathname);
  if (!url) return null;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) return null;
  return await res.json();
}

export async function POST(req: Request) {
  const form = await req.formData();
  const files = form.getAll("files") as File[];

  if (!files || files.length === 0) {
    return Response.json({ ok: false, error: "No files uploaded. Use form field name 'files'." }, { status: 400 });
  }

  // Load meta
  const metaPath = "index/meta.json";
  const metaExisting = (await readJsonFromBlob(metaPath)) ?? { manifests: [], totalLpn: 0, shards: 0, updatedAt: null };
  const manifests = new Set<string>(metaExisting.manifests ?? []);

  // In-memory shard buffers: shard -> { index: {lpn: record}}
  const shardBuffers: Record<string, Record<string, any>> = {};
  const shardTouched = new Set<string>();

  // Parse each workbook and build shardBuffers
  let parsed = 0;
  for (const file of files) {
    const name = file.name || "uploaded.xlsx";
    manifests.add(name);

    const buf = Buffer.from(await file.arrayBuffer());
    const wb = XLSX.read(buf, { type: "buffer" });

    let combined: RecordRow[] = [];
    for (const sheet of wb.SheetNames) {
      const ws = wb.Sheets[sheet];
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" }) as any[][];
      combined = combined.concat(rowsToRecords(sheet, rows));
    }

    for (const rec of combined) {
      const lpn = normalizeLpn(String(rec.LPN ?? ""));
      if (!lpn) continue;
      const shard = shardFor(lpn);

      shardTouched.add(shard);
      shardBuffers[shard] = shardBuffers[shard] || {};
      shardBuffers[shard][lpn] = { ...rec, __sourceFile: name };
      parsed += 1;
    }

    // Also store the raw file itself in blob (optional convenience)
    await put(`manifests/${Date.now()}-${name}`, buf, { access: "private", contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  }

  // For each touched shard: load existing, merge, write back
  let totalUniqueNew = 0;
  for (const shard of Array.from(shardTouched)) {
    const shardPath = `index/shards/${shard}.json`;
    const existing = (await readJsonFromBlob(shardPath)) ?? { index: {} };
    const merged = { ...(existing.index ?? {}), ...(shardBuffers[shard] ?? {}) };

    // Estimate unique new by counting keys newly added vs existed
    const existingKeys = new Set(Object.keys(existing.index ?? {}));
    for (const k of Object.keys(shardBuffers[shard] ?? {})) {
      if (!existingKeys.has(k)) totalUniqueNew += 1;
    }

    const payload = {
      shard,
      updatedAt: new Date().toISOString(),
      count: Object.keys(merged).length,
      index: merged,
    };

    await put(shardPath, JSON.stringify(payload), { access: "public", contentType: "application/json" });
  }

  const newTotal = (metaExisting.totalLpn ?? 0) + totalUniqueNew;
  const newMeta = {
    manifests: Array.from(manifests).sort(),
    totalLpn: newTotal,
    shards: new Set([...(metaExisting.shardsList ?? []), ...Array.from(shardTouched)]).size || undefined,
    shardsList: Array.from(new Set([...(metaExisting.shardsList ?? []), ...Array.from(shardTouched)])).sort(),
    updatedAt: new Date().toISOString(),
  };

  await put(metaPath, JSON.stringify(newMeta), { access: "public", contentType: "application/json" });

  return Response.json({
    ok: true,
    files: files.map((f) => f.name),
    parsedRows: parsed,
    uniqueNewLpns: totalUniqueNew,
    shardsUpdated: Array.from(shardTouched).sort(),
    note: "Upload saved in Blob. Lookups read from sharded JSON indexes in Blob (no re-upload needed).",
  });
}
