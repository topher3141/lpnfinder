import fs from "node:fs";
import path from "node:path";
import * as XLSX from "xlsx";

const ROOT = process.cwd();
const manifestsDir = path.join(ROOT, "manifests");
const outDir = path.join(ROOT, "public", "index");
const shardsDir = path.join(outDir, "shards");

fs.mkdirSync(shardsDir, { recursive: true });

function normalizeLpn(v){
  return String(v ?? "").trim().replace(/\s+/g, "").toUpperCase();
}
function shardFor(lpn){
  const s = normalizeLpn(lpn);
  return (s.slice(0,2) || "ZZ").padEnd(2,"Z");
}
function isMostlyEmpty(row){
  return (row || []).filter(v => String(v ?? "").trim() !== "").length === 0;
}
function findHeaderRow(rows){
  for (let r=0; r<rows.length; r++){
    const row = rows[r] || [];
    for (let c=0; c<row.length; c++){
      if (String(row[c] ?? "").trim().toLowerCase() === "lpn") return r;
    }
  }
  return -1;
}

const manifests = fs.existsSync(manifestsDir)
  ? fs.readdirSync(manifestsDir).filter(f => f.toLowerCase().endsWith(".xlsx"))
  : [];

if (manifests.length === 0){
  console.warn("No manifests found in /manifests. Build will still succeed.");
}

const indexByShard = new Map(); // shard -> { lpn: record }
let total = 0;

for (const file of manifests){
  const full = path.join(manifestsDir, file);
  const buf = fs.readFileSync(full);
  const wb = XLSX.read(buf, { type: "buffer" });

  for (const sheet of wb.SheetNames){
    const ws = wb.Sheets[sheet];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });

    const headerRow = findHeaderRow(rows);
    if (headerRow < 0) continue;

    const headers = (rows[headerRow] || []).map(h => String(h ?? "").trim());

    for (let r = headerRow + 1; r < rows.length; r++){
      const row = rows[r] || [];
      if (isMostlyEmpty(row)) continue;

      const rec = {};
      for (let c=0; c<headers.length; c++){
        const key = headers[c];
        if (!key) continue;
        rec[key] = row[c];
      }

      const lpn = normalizeLpn(rec.LPN);
      if (!lpn) continue;

      const shard = shardFor(lpn);
      if (!indexByShard.has(shard)) indexByShard.set(shard, {});
      // last-one-wins (you said LPNs are unique globally)
      indexByShard.get(shard)[lpn] = {
        ...rec,
        LPN: lpn,
        sheet,
        rowNumber: r + 1,
        __sourceFile: file
      };
      total += 1;
    }
  }
}

// write shards
const shardNames = Array.from(indexByShard.keys()).sort();
for (const s of shardNames){
  const payload = { shard: s, count: Object.keys(indexByShard.get(s)).length, index: indexByShard.get(s) };
  fs.writeFileSync(path.join(shardsDir, `${s}.json`), JSON.stringify(payload));
}

// meta
const uniqueLpns = shardNames.reduce((acc, s) => acc + Object.keys(indexByShard.get(s)).length, 0);
const meta = {
  updatedAt: new Date().toISOString(),
  manifests,
  manifestCount: manifests.length,
  shards: shardNames.length,
  shardsList: shardNames,
  uniqueLpns,
};

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "meta.json"), JSON.stringify(meta));

console.log(`Indexed ${uniqueLpns} unique LPNs across ${manifests.length} manifest(s) into ${shardNames.length} shard(s).`);
