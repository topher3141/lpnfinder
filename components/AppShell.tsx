"use client";

import React, { useEffect, useRef, useState } from "react";

type Stats = { manifestCount: number; totalLpn: number; manifests: string[]; shards: number; updatedAt?: string | null };

function normalizeLpn(input: string) {
  return (input || "").trim().replace(/\s+/g, "").toUpperCase();
}

function formatMoney(value: any) {
  const n = typeof value === "number" ? value : Number(String(value ?? "").replace(/[$,]/g, ""));
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

export default function AppShell() {
  const [tab, setTab] = useState<"search" | "upload">("search");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("Ready. Scan or type an LPN.");
  const [record, setRecord] = useState<any | null>(null);
  const [found, setFound] = useState<boolean | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);

  const inputRef = useRef<HTMLInputElement | null>(null);

  async function refreshStats() {
    try {
      const res = await fetch("/api/stats", { cache: "no-store" });
      const data = await res.json();
      if (data?.ok) setStats(data);
    } catch {}
  }

  useEffect(() => {
    inputRef.current?.focus();
    refreshStats();
  }, []);

  async function lookup(lpnRaw: string) {
    const lpn = normalizeLpn(lpnRaw);
    if (!lpn) return;

    setStatus("Searching...");
    setFound(null);
    setRecord(null);

    const res = await fetch(`/api/lookup?lpn=${encodeURIComponent(lpn)}`, { cache: "no-store" });
    const data = await res.json();

    if (!data?.ok) {
      setFound(false);
      setStatus(data?.error || "Lookup error.");
      return;
    }
    if (data.found === false) {
      setFound(false);
      setStatus(`No match for ${data.lpn}`);
      return;
    }
    setFound(true);
    setRecord(data.record);
    setStatus(`Match found for ${data.lpn}`);
  }

  return (
    <div className="container">
      <div className="header">
        <div className="brand">
          <h1>LPN Finder</h1>
          <p className="sub">Upload manifests once to Vercel Blob, then scan/type an LPN to pull details instantly.</p>
        </div>
        <div className="nav">
          <button className={`tab ${tab === "search" ? "active" : ""}`} onClick={() => setTab("search")}>Search</button>
          <button className={`tab ${tab === "upload" ? "active" : ""}`} onClick={() => setTab("upload")}>Upload</button>
        </div>
      </div>

      <div className="row" style={{ marginBottom: 12 }}>
        <span className="badge">Manifests: <strong style={{ color: "var(--text)" }}>{stats?.manifestCount ?? "—"}</strong></span>
        <span className="badge">Unique LPNs: <strong style={{ color: "var(--text)" }}>{stats?.totalLpn ?? "—"}</strong></span>
        <span className="badge">Shards: <strong style={{ color: "var(--text)" }}>{stats?.shards ?? "—"}</strong></span>
        <span className="badge">Scanner-ready</span>
      </div>

      {tab === "search" ? (
        <div className="card">
          <div className="row" style={{ alignItems: "flex-start" }}>
            <div style={{ flex: 1, minWidth: 260 }}>
              <input
                ref={inputRef}
                className="input"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Scan / type LPN…"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    lookup(query);
                    e.currentTarget.select();
                  }
                }}
              />
              <div className="small" style={{ marginTop: 8 }}>Tip: most scanners send Enter at the end.</div>
            </div>

            <button className="button" onClick={() => { lookup(query); inputRef.current?.focus(); inputRef.current?.select(); }}>
              Search
            </button>
            <button className="button" onClick={() => { setQuery(""); setRecord(null); setFound(null); setStatus("Ready. Scan or type an LPN."); inputRef.current?.focus(); }}>
              Clear
            </button>
          </div>

          <hr className="sep" />
          <div className="small">{status}</div>

          {found === false && (
            <div style={{ marginTop: 14 }} className="card">
              <div style={{ fontWeight: 950, fontSize: 16, color: "var(--bad)" }}>No match</div>
              <div className="small" style={{ marginTop: 6 }}>Try again, or upload the manifest.</div>
            </div>
          )}

          {found === true && record && (
            <div style={{ marginTop: 14 }} className="card">
              <div className="row" style={{ justifyContent: "space-between" }}>
                <div style={{ fontSize: 18, fontWeight: 950 }}>
                  {String(record["Item Description"] || record["Description"] || "Item")}
                </div>
                <div className="badge">Source: <strong style={{ color: "var(--text)" }}>{String(record.__sourceFile || "—")}</strong></div>
              </div>

              <div className="heroRetail">
                <div>
                  <div className="priceLabel">Retail</div>
                  <div className="price">{formatMoney(record["Unit Retail"] ?? record["Retail"] ?? record["Ext. Retail"])}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div className="priceLabel">LPN</div>
                  <div style={{ fontSize: 18, fontWeight: 950 }}>{String(record.LPN || "—")}</div>
                </div>
              </div>

              <div className="grid">
                <KV label="Qty" value={record.Qty} />
                <KV label="Ext. Retail" value={formatMoney(record["Ext. Retail"])} />
                <KV label="Brand" value={record.Brand} />
                <KV label="Condition" value={record.Condition} />
                <KV label="ASIN" value={record.ASIN} />
                <KV label="UPC" value={record.UPC} />
                <KV label="EAN" value={record.EAN} />
                <KV label="Category" value={record.Category} />
                <KV label="Subcategory" value={record.Subcategory} />
                <KV label="Pallet ID" value={record["Pallet ID"]} />
                <KV label="Lot ID" value={record["Lot ID"]} />
                <KV label="Sheet / Row" value={`${record.sheet ?? "—"} / ${record.rowNumber ?? "—"}`} />
              </div>
            </div>
          )}
        </div>
      ) : (
        <UploadPanel
          onUploaded={async (msg) => {
            setTab("search");
            setStatus(msg);
            await refreshStats();
            inputRef.current?.focus();
          }}
        />
      )}

      <div style={{ marginTop: 18 }} className="small">
        This version uses **Vercel Blob** (no KV). Uploads build sharded JSON indexes in Blob: <code>index/shards/AA.json</code>, etc.
      </div>
    </div>
  );
}

function KV({ label, value }: { label: string; value: any }) {
  const v = String(value ?? "").trim() || "—";
  return (
    <div className="kv">
      <div className="k">{label}</div>
      <div className="v">{v}</div>
    </div>
  );
}

function UploadPanel({ onUploaded }: { onUploaded: (msg: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("Upload one or more .xlsx manifests. LPNs should be unique globally.");
  const fileRef = useRef<HTMLInputElement | null>(null);

  async function upload() {
    const files = fileRef.current?.files;
    if (!files || files.length === 0) {
      setMsg("Choose one or more files first.");
      return;
    }
    setBusy(true);
    setMsg("Uploading and indexing...");

    const fd = new FormData();
    for (const f of Array.from(files)) fd.append("files", f);

    const res = await fetch("/api/upload", { method: "POST", body: fd });
    const data = await res.json();

    if (!data?.ok) {
      setMsg(data?.error || "Upload failed.");
      setBusy(false);
      return;
    }

    setMsg(`Done. Parsed rows: ${data.parsedRows}. Unique new LPNs: ${data.uniqueNewLpns}. Shards updated: ${data.shardsUpdated?.length || 0}.`);
    setBusy(false);
    onUploaded("Upload complete — ready to scan/search.");
  }

  return (
    <div className="card">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 950 }}>Upload Manifests</div>
          <div className="small" style={{ marginTop: 6 }}>
            Files are saved in Blob, and the app writes sharded search indexes so you never re-upload.
          </div>
        </div>
        <div className="badge">Key: <strong style={{ color: "var(--text)" }}>LPN</strong></div>
      </div>

      <hr className="sep" />

      <div className="row">
        <input ref={fileRef} type="file" accept=".xlsx,.xls" multiple />
        <button className="button" onClick={upload} disabled={busy}>
          {busy ? "Working..." : "Upload & Index"}
        </button>
      </div>

      <div style={{ marginTop: 12 }} className="small">{msg}</div>
    </div>
  );
}
