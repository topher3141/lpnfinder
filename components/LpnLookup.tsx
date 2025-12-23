"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";

type RecordRow = {
  sheet: string;
  rowNumber: number;
  LPN?: string;
  ASIN?: string;
  EAN?: string;
  UPC?: string;
  Brand?: string;
  Condition?: string;
  Category?: string;
  Subcategory?: string;
  "Item Description"?: string;
  Qty?: number | string;
  "Unit Retail"?: number | string;
  "Ext. Retail"?: number | string;
  "Product Class"?: string;
  "GL Description"?: string;
  "Seller Category"?: string;
  "Pallet ID"?: string;
  "Lot ID"?: string;
  Dispo?: string;
  [key: string]: any;
};

type Index = Map<string, RecordRow[]>;

function normalizeLpn(input: string) {
  return (input || "").trim().replace(/\s+/g, "").toUpperCase();
}

function isMostlyEmpty(row: any[]) {
  const nonEmpty = row.filter((v) => String(v ?? "").trim() !== "");
  return nonEmpty.length === 0;
}

function tryParseNumber(v: any) {
  if (typeof v === "number") return v;
  const s = String(v ?? "").trim();
  if (!s) return v;
  const cleaned = s.replace(/[$,]/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : v;
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
  // Robust: find the row that contains a column header named "LPN"
  const headerRowIndex = findHeaderRow(rows, "LPN");
  if (headerRowIndex < 0) return [];

  const headers = (rows[headerRowIndex] || []).map((h) => String(h ?? "").trim());
  const records: RecordRow[] = [];

  for (let r = headerRowIndex + 1; r < rows.length; r++) {
    const row = rows[r] || [];
    if (isMostlyEmpty(row)) continue;

    const obj: RecordRow = {
      sheet: sheetName,
      rowNumber: r + 1, // Excel row number (1-based)
    };

    for (let c = 0; c < headers.length; c++) {
      const key = headers[c];
      if (!key) continue;
      obj[key] = row[c];
    }

    // Normalize a few fields
    if (obj.LPN != null) obj.LPN = String(obj.LPN).trim();
    if (obj["Item Description"] != null) obj["Item Description"] = String(obj["Item Description"]).trim();

    // Try parse common numeric fields
    obj.Qty = tryParseNumber(obj.Qty);
    obj["Unit Retail"] = tryParseNumber(obj["Unit Retail"]);
    obj["Ext. Retail"] = tryParseNumber(obj["Ext. Retail"]);

    // Only keep rows that actually have an LPN value
    if (String(obj.LPN ?? "").trim() !== "") records.push(obj);
  }

  return records;
}

function buildIndex(records: RecordRow[]): Index {
  const idx: Index = new Map();
  for (const rec of records) {
    const key = normalizeLpn(String(rec.LPN ?? ""));
    if (!key) continue;
    const arr = idx.get(key) ?? [];
    arr.push(rec);
    idx.set(key, arr);
  }
  return idx;
}

export default function LpnLookup() {
  const [fileName, setFileName] = useState<string>("");
  const [allRecords, setAllRecords] = useState<RecordRow[]>([]);
  const [query, setQuery] = useState<string>("");
  const [status, setStatus] = useState<string>("Upload a manifest to begin.");
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Optional: load cached data on startup so you don't have to re-upload every refresh
  useEffect(() => {
    try {
      const cached = localStorage.getItem("lpn_records_v1");
      const cachedName = localStorage.getItem("lpn_filename_v1");
      if (cached) {
        const parsed = JSON.parse(cached) as RecordRow[];
        setAllRecords(parsed);
        setFileName(cachedName || "Cached manifest");
        setStatus(`Loaded ${parsed.length.toLocaleString()} rows from cache.`);
        setTimeout(() => inputRef.current?.focus(), 50);
      }
    } catch {
      // ignore cache errors
    }
  }, []);

  const index = useMemo(() => buildIndex(allRecords), [allRecords]);

  const results = useMemo(() => {
    const key = normalizeLpn(query);
    if (!key) return [];
    return index.get(key) ?? [];
  }, [index, query]);

  async function handleFile(file: File) {
    setStatus("Parsing workbook...");
    setFileName(file.name);

    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array" });

    let combined: RecordRow[] = [];
    for (const sheet of wb.SheetNames) {
      const ws = wb.Sheets[sheet];
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" }) as any[][];
      const recs = rowsToRecords(sheet, rows);
      combined = combined.concat(recs);
    }

    setAllRecords(combined);
    setStatus(`Loaded ${combined.length.toLocaleString()} rows. Ready to scan/search.`);

    // Cache locally so you don't have to re-upload each time
    try {
      localStorage.setItem("lpn_records_v1", JSON.stringify(combined));
      localStorage.setItem("lpn_filename_v1", file.name);
    } catch {
      // ignore cache quota issues
    }

    setTimeout(() => inputRef.current?.focus(), 50);
  }

  function clearCache() {
    localStorage.removeItem("lpn_records_v1");
    localStorage.removeItem("lpn_filename_v1");
    setAllRecords([]);
    setFileName("");
    setQuery("");
    setStatus("Cleared. Upload a manifest to begin.");
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  return (
    <div style={{ maxWidth: 960, margin: "0 auto", padding: 20, fontFamily: "system-ui, Arial" }}>
      <h1 style={{ marginBottom: 6 }}>LPN Finder</h1>
      <div style={{ opacity: 0.8, marginBottom: 16 }}>
        Upload your manifest (.xlsx), then scan or type an LPN to retrieve item details.
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr",
          gap: 12,
          padding: 14,
          border: "1px solid #ddd",
          borderRadius: 10,
        }}
      >
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          <input
            type="file"
            accept=".xlsx,.xls"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
              e.currentTarget.value = "";
            }}
          />
          <button onClick={clearCache} style={{ padding: "8px 10px" }}>
            Clear / New Manifest
          </button>
          <div style={{ opacity: 0.8 }}>
            <strong>Manifest:</strong> {fileName || "None"}
          </div>
        </div>

        <div>
          <label style={{ display: "block", fontWeight: 600, marginBottom: 6 }}>Scan / Type LPN</label>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              // Many scanners send Enter at the end; keep focus here
              if (e.key === "Enter") e.currentTarget.select();
            }}
            placeholder="Example: LPN123456..."
            style={{
              width: "100%",
              fontSize: 22,
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid #ccc",
            }}
          />
          <div style={{ marginTop: 8, opacity: 0.8 }}>{status}</div>
        </div>
      </div>

      <div style={{ marginTop: 18 }}>
        {normalizeLpn(query) && (
          <div style={{ marginBottom: 10, opacity: 0.8 }}>
            Matches: <strong>{results.length}</strong>
          </div>
        )}

        {results.map((r, i) => (
          <div
            key={`${r.sheet}-${r.rowNumber}-${i}`}
            style={{
              marginBottom: 12,
              padding: 14,
              border: "1px solid #e3e3e3",
              borderRadius: 10,
              background: "#fff",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <div style={{ fontSize: 18, fontWeight: 700 }}>
                {r["Item Description"] || "(No description)"}
              </div>
              <div style={{ opacity: 0.75 }}>
                Sheet: <strong>{r.sheet}</strong> • Row: <strong>{r.rowNumber}</strong>
              </div>
            </div>

            <div
              style={{
                marginTop: 10,
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
                gap: 10,
              }}
            >
              <Field label="LPN" value={r.LPN} />
              <Field label="Qty" value={r.Qty} />
              <Field label="Unit Retail" value={r["Unit Retail"]} money />
              <Field label="Ext. Retail" value={r["Ext. Retail"]} money />
              <Field label="Brand" value={r.Brand} />
              <Field label="Condition" value={r.Condition} />
              <Field label="ASIN" value={r.ASIN} />
              <Field label="UPC" value={r.UPC} />
              <Field label="EAN" value={r.EAN} />
              <Field label="Category" value={r.Category} />
              <Field label="Subcategory" value={r.Subcategory} />
              <Field label="Pallet ID" value={r["Pallet ID"]} />
              <Field label="Lot ID" value={r["Lot ID"]} />
            </div>
          </div>
        ))}

        {normalizeLpn(query) && results.length === 0 && (
          <div style={{ marginTop: 14, padding: 14, border: "1px dashed #bbb", borderRadius: 10 }}>
            No match found for <strong>{normalizeLpn(query)}</strong>.
          </div>
        )}
      </div>
    </div>
  );
}

function Field({ label, value, money }: { label: string; value: any; money?: boolean }) {
  let display = value;

  if (money && typeof value === "number") {
    display = value.toLocaleString(undefined, { style: "currency", currency: "USD" });
  }

  return (
    <div style={{ padding: 10, border: "1px solid #f0f0f0", borderRadius: 10 }}>
      <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 650 }}>{String(display ?? "").trim() || "—"}</div>
    </div>
  );
}
