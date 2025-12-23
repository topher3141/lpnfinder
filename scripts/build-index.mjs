import fs from "fs";
import path from "path";
import * as XLSX from "xlsx";

const root = process.cwd();
const manifestsDir = path.join(root, "manifests");
const outDir = path.join(root, "public/index");
const shardsDir = path.join(outDir, "shards");

fs.mkdirSync(shardsDir, { recursive: true });

function normalize(v){ return String(v||"").trim().toUpperCase(); }
function shard(lpn){ return normalize(lpn).slice(0,2)||"ZZ"; }

let index = {};
let manifests = [];

for (const file of fs.readdirSync(manifestsDir)) {
  if (!file.endsWith(".xlsx")) continue;
  manifests.push(file);
  const wb = XLSX.read(fs.readFileSync(path.join(manifestsDir,file)));
  wb.SheetNames.forEach(sheet=>{
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheet], {header:1, defval:""});
    const headerRow = rows.findIndex(r=>r.some(c=>String(c).toLowerCase()==="lpn"));
    if (headerRow<0) return;
    const headers = rows[headerRow];
    rows.slice(headerRow+1).forEach((row,i)=>{
      const rec = {};
      headers.forEach((h,idx)=>rec[h]=row[idx]);
      const lpn = normalize(rec.LPN);
      if (!lpn) return;
      index[lpn]={...rec,sheet,rowNumber:headerRow+2+i,__sourceFile:file};
    });
  });
}

const shards = {};
Object.entries(index).forEach(([lpn,rec])=>{
  const s=shard(lpn);
  shards[s]=shards[s]||{};
  shards[s][lpn]=rec;
});

Object.entries(shards).forEach(([s,data])=>{
  fs.writeFileSync(path.join(shardsDir,`${s}.json`), JSON.stringify({index:data}));
});

fs.writeFileSync(path.join(outDir,"meta.json"), JSON.stringify({
  manifests,
  totalLpn:Object.keys(index).length,
  shards:Object.keys(shards)
}));

console.log("Indexed", Object.keys(index).length, "LPNs");
