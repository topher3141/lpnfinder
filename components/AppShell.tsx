"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

type Meta = {
  updatedAt?: string;
  manifests?: string[];
  manifestCount?: number;
  shards?: number;
  shardsList?: string[];
  uniqueLpns?: number;
};

function normalizeLpn(input: string) {
  return (input || "").trim().replace(/\s+/g, "").toUpperCase();
}

function shardFor(lpn: string) {
  const s = normalizeLpn(lpn);
  const head = (s.slice(0, 2) || "ZZ").padEnd(2, "Z");
  return head;
}

function formatMoney(value: any) {
  const n =
    typeof value === "number"
      ? value
      : Number(String(value ?? "").replace(/[$,]/g, ""));
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

export default function AppShell() {
  const [meta, setMeta] = useState<Meta | null>(null);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("Ready. Scan or type an LPN.");
  const [record, setRecord] = useState<any | null>(null);
  const [found, setFound] = useState<boolean | null>(null);

  // NEW: scanner modal
  const [scannerOpen, setScannerOpen] = useState(false);

  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
    (async () => {
      try {
        const res = await fetch("/index/meta.json", { cache: "no-store" });
        if (res.ok) setMeta(await res.json());
      } catch {}
    })();
  }, []);

  async function lookup(lpnOverride?: string) {
    const lpn = normalizeLpn(lpnOverride ?? query);
    if (!lpn) return;

    setStatus("Searching…");
    setFound(null);
    setRecord(null);

    const shard = shardFor(lpn);
    try {
      const res = await fetch(`/index/shards/${shard}.json`, {
        cache: "no-store",
      });

      if (!res.ok) {
        setFound(false);
        setStatus(`No index shard for ${shard}. (Did the deploy index run?)`);
        return;
      }

      const data = await res.json();
      const rec = data?.index?.[lpn] ?? null;

      if (!rec) {
        setFound(false);
        setStatus(`No match for ${lpn}`);
        return;
      }

      setFound(true);
      setRecord(rec);
      setStatus(`Match found for ${lpn}`);
    } catch (e: any) {
      setFound(false);
      setStatus(`Lookup failed: ${e?.message || e}`);
    } finally {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }

  const retailValue = useMemo(() => {
    if (!record) return "—";
    return formatMoney(
      record["Unit Retail"] ?? record["Retail"] ?? record["Ext. Retail"]
    );
  }, [record]);

  return (
    <div className="container">
      <div className="header">
        <div className="brand">
          <h1>LPN Finder</h1>
          <p>
            Manifests are stored <strong>internally in GitHub</strong> under{" "}
            <code>/manifests</code>. Vercel indexes them automatically on deploy.
            Then just scan/type an LPN.
          </p>
        </div>

        <div className="row" style={{ justifyContent: "flex-end" }}>
          <span className="badge">
            Manifests:{" "}
            <strong style={{ color: "var(--text)" }}>
              {meta?.manifestCount ?? "—"}
            </strong>
          </span>
          <span className="badge">
            Unique LPNs:{" "}
            <strong style={{ color: "var(--text)" }}>
              {meta?.uniqueLpns ?? "—"}
            </strong>
          </span>
          <span className="badge">
            Updated:{" "}
            <strong style={{ color: "var(--text)" }}>
              {meta?.updatedAt
                ? new Date(meta.updatedAt).toLocaleString()
                : "—"}
            </strong>
          </span>
        </div>
      </div>

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
                  lookup();
                  (e.currentTarget as HTMLInputElement).select();
                }
              }}
            />
            <div className="small" style={{ marginTop: 8 }}>
              Tip: Most barcode scanners “type” the value and send Enter. Keep
              this field focused.
            </div>
          </div>

          {/* NEW: camera scan button */}
          <button
            className="button iconButton"
            onClick={() => setScannerOpen(true)}
            title="Scan with camera"
            aria-label="Scan with camera"
          >
            📷
          </button>

          <button className="button" onClick={() => lookup()}>
            Search
          </button>

          <button
            className="button"
            onClick={() => {
              setQuery("");
              setRecord(null);
              setFound(null);
              setStatus("Ready. Scan or type an LPN.");
              inputRef.current?.focus();
            }}
          >
            Clear
          </button>
        </div>

        <hr className="sep" />
        <div className="small">{status}</div>

        {found === false && (
          <div style={{ marginTop: 14 }} className="card">
            <div style={{ fontWeight: 950, fontSize: 16, color: "var(--bad)" }}>
              No match
            </div>
            <div className="small" style={{ marginTop: 6 }}>
              If you just added a new file, make sure it’s in{" "}
              <code>/manifests</code> and Vercel redeployed.
            </div>
          </div>
        )}

        {found === true && record && (
          <div style={{ marginTop: 14 }} className="card">
            <div
              className="row"
              style={{ justifyContent: "space-between", alignItems: "flex-start" }}
            >
              <div style={{ fontSize: 18, fontWeight: 950 }}>
                {String(record["Item Description"] || record["Description"] || "Item")}
              </div>
              <span className="badge">
                Source:{" "}
                <strong style={{ color: "var(--text)" }}>
                  {String(record.__sourceFile || "—")}
                </strong>
              </span>
            </div>

            <div className="heroRetail">
              <div>
                <div className="priceLabel">Retail</div>
                <div className="price">{retailValue}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div className="priceLabel">LPN</div>
                <div style={{ fontSize: 18, fontWeight: 950 }}>
                  {String(record.LPN || "—")}
                </div>
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

      <div style={{ marginTop: 18 }} className="small">
        Want to add more manifests? Drop them in <code>/manifests</code>, commit,
        and Vercel will rebuild the index on deploy.
      </div>

      {/* NEW: scanner modal */}
      {scannerOpen && (
        <ScannerModal
          onClose={() => setScannerOpen(false)}
          onScanned={(value) => {
            const v = normalizeLpn(value);
            setQuery(v);
            setScannerOpen(false);
            lookup(v);
          }}
        />
      )}
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

/**
 * Camera scanner modal using html5-qrcode.
 * Works on HTTPS (Vercel). Mobile Safari/Chrome will prompt for camera permission.
 */
function ScannerModal({
  onClose,
  onScanned,
}: {
  onClose: () => void;
  onScanned: (value: string) => void;
}) {
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let scanner: any = null;
    let cancelled = false;

    (async () => {
      try {
        const mod = await import("html5-qrcode");
        const { Html5Qrcode } = mod as any;

        scanner = new Html5Qrcode("qr-reader");

        await scanner.start(
          { facingMode: "environment" },
          {
            fps: 10,
            // a little wider box helps with 1D barcodes
            qrbox: { width: 280, height: 200 },
            // NOTE: html5-qrcode supports many formats; we leave defaults.
          },
          (decodedText: string) => {
            if (cancelled) return;
            onScanned(decodedText);
          },
          () => {}
        );
      } catch (e: any) {
        setErr(e?.message || String(e));
      }
    })();

    return () => {
      cancelled = true;
      (async () => {
        try {
          if (scanner) {
            await scanner.stop();
            await scanner.clear();
          }
        } catch {}
      })();
    };
  }, [onScanned]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.65)",
        display: "grid",
        placeItems: "center",
        padding: 16,
        zIndex: 50,
      }}
      onClick={onClose}
    >
      <div
        className="card"
        style={{ width: "min(560px, 100%)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="row" style={{ justifyContent: "space-between" }}>
          <div style={{ fontWeight: 950, fontSize: 16 }}>Scan barcode</div>
          <button className="button" onClick={onClose} style={{ width: "auto" }}>
            Close
          </button>
        </div>

        <hr className="sep" />

        {err ? (
          <div className="small" style={{ color: "var(--bad)" }}>
            Camera error: {err}
            <div className="small" style={{ marginTop: 6 }}>
              Tip: On iPhone, allow camera permissions for the site (Safari →
              aA → Website Settings → Camera).
            </div>
          </div>
        ) : (
          <>
            <div
              id="qr-reader"
              style={{ width: "100%", borderRadius: 16, overflow: "hidden" }}
            />
            <div className="small" style={{ marginTop: 10 }}>
              Point your camera at the barcode. It will auto-fill and search.
            </div>
          </>
        )}
      </div>
    </div>
  );
}
