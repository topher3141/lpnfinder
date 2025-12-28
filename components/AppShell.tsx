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

function toNumberMoney(value: any): number | null {
  if (value == null) return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const n = Number(String(value).replace(/[$,]/g, ""));
  return Number.isFinite(n) ? n : null;
}

function formatMoney(value: any) {
  const n = toNumberMoney(value);
  if (n == null) return "—";
  return n.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

// LPN + 10 characters
function looksLikeFullLpn(v: string) {
  const s = normalizeLpn(v);
  return /^LPN[A-Z0-9]{10}$/.test(s);
}

function normalizeAsin(v: any) {
  const s = String(v ?? "").trim().toUpperCase();
  return /^[A-Z0-9]{10}$/.test(s) ? s : "";
}

function amazonDpUrl(asin: string) {
  return `https://www.amazon.com/dp/${asin}`;
}

/**
 * Best-effort Amazon image URLs.
 * Not guaranteed (Amazon changes these / blocks some), but often works.
 */
function amazonImageCandidates(asin: string) {
  return [
    `https://images-na.ssl-images-amazon.com/images/P/${asin}.01._SX480_.jpg`,
    `https://images-na.ssl-images-amazon.com/images/P/${asin}.01._SX300_.jpg`,
    `https://images-na.ssl-images-amazon.com/images/P/${asin}.01._SX160_.jpg`,
    `https://m.media-amazon.com/images/P/${asin}.01._SX480_.jpg`,
    `https://m.media-amazon.com/images/P/${asin}.01._SX300_.jpg`,
    `https://m.media-amazon.com/images/P/${asin}.01._SX160_.jpg`,
  ];
}

/**
 * Heuristic: guess size from an item title/description.
 * Goal: "good enough" for fast processing, not perfect.
 */
function extractSizeGuess(title: string): string {
  const t = String(title || "").toLowerCase();
  if (!t) return "—";

  // Normalize separators to spaces
  const s = t.replace(/[_\-()/,.;:]+/g, " ").replace(/\s+/g, " ").trim();

  // 1) Explicit "size ..." patterns (only letter sizes, not numbers)
  // Examples: "Size: Large", "size xl", "sz medium", "SIZE - 2XL"
  const m1 = s.match(/\b(?:size|sz)\s*[:\-]?\s*(xxs|xs|small|medium|m|large|l|xl|xxl|xxxl|2xl|3xl|4xl|5xl)\b/i);
  if (m1?.[1]) return normalizeSizeToken(m1[1]);

  // 2) Standalone tokens (word sizes + letter sizes)
  // Only accept if they appear as separate words/tokens.
  const m2 = s.match(/\b(xxS|xxs|xs|small|medium|m|large|l|xl|xxl|xxxl|2xl|3xl|4xl|5xl)\b/i);
  if (m2?.[1]) return normalizeSizeToken(m2[1]);

  // 3) Common combined patterns like "x-large", "xx-large"
  // Convert "x large" -> XL, "xx large" -> XXL
  if (/\bxx\s+large\b/i.test(s)) return "XXL";
  if (/\bx\s+large\b/i.test(s)) return "XL";

  // If we don't see a clear size token, return dash (unknown)
  return "—";
}

function normalizeSizeToken(raw: string): string {
  const r = String(raw || "").toLowerCase().replace(/\s+/g, "");

  // Word sizes
  if (r === "small") return "S";
  if (r === "medium") return "M";
  if (r === "large") return "L";

  // Letter sizes / extended
  if (r === "xxs") return "XXS";
  if (r === "xs") return "XS";
  if (r === "s") return "S";
  if (r === "m") return "M";
  if (r === "l") return "L";
  if (r === "xl") return "XL";
  if (r === "xxl") return "XXL";
  if (r === "xxxl") return "XXXL";
  if (r === "2xl") return "2XL";
  if (r === "3xl") return "3XL";
  if (r === "4xl") return "4XL";
  if (r === "5xl") return "5XL";

  return "—";
}


export default function AppShell() {
  const [meta, setMeta] = useState<Meta | null>(null);

  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("Ready. Scan or type an LPN.");
  const [record, setRecord] = useState<any | null>(null);
  const [found, setFound] = useState<boolean | null>(null);

  const [scanMode, setScanMode] = useState(true);
  const [autoClear, setAutoClear] = useState(true);
  const [autoSearch, setAutoSearch] = useState(true);

  const [scannerOpen, setScannerOpen] = useState(false);

  const inputRef = useRef<HTMLInputElement | null>(null);

  const [lastLpn, setLastLpn] = useState<string>("");
  const lastTriggeredRef = useRef<string>("");

  useEffect(() => {
    inputRef.current?.focus();
    (async () => {
      try {
        const res = await fetch("/index/meta.json", { cache: "no-store" });
        if (res.ok) setMeta(await res.json());
      } catch {}
    })();
  }, []);

  function refocusSoon() {
    setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 30);
  }

  async function lookup(lpnOverride?: string) {
    const lpn = normalizeLpn(lpnOverride ?? query);
    if (!lpn) return;

    setLastLpn(lpn);
    setStatus("Searching…");
    setFound(null);

    const shard = shardFor(lpn);

    try {
      const res = await fetch(`/index/shards/${shard}.json`, { cache: "no-store" });

      if (!res.ok) {
        setFound(false);
        setRecord(null);
        setStatus(`No index shard for ${shard}. (Did the deploy index run?)`);
        return;
      }

      const data = await res.json();
      const rec = data?.index?.[lpn] ?? null;

      if (!rec) {
        setFound(false);
        setRecord(null);
        setStatus(`No match for ${lpn}`);
        return;
      }

      setFound(true);
      setRecord(rec);
      setStatus(`Match found for ${lpn}`);
    } catch (e: any) {
      setFound(false);
      setRecord(null);
      setStatus(`Lookup failed: ${e?.message || e}`);
    } finally {
      if (scanMode && autoClear) {
        setQuery("");
        lastTriggeredRef.current = "";
      }
      if (scanMode) refocusSoon();
    }
  }

  useEffect(() => {
    if (!scanMode || !autoSearch) return;

    const s = normalizeLpn(query);
    if (!looksLikeFullLpn(s)) return;
    if (lastTriggeredRef.current === s) return;

    lastTriggeredRef.current = s;
    lookup(s);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, scanMode, autoSearch]);

  const retailNumber = useMemo(() => {
    if (!record) return null;
    return toNumberMoney(record["Unit Retail"] ?? record["Retail"] ?? record["Ext. Retail"]);
  }, [record]);

  const retailValue = useMemo(() => (retailNumber == null ? "—" : formatMoney(retailNumber)), [retailNumber]);

  const targetSellNumber = useMemo(() => {
    if (retailNumber == null) return null;
    return Math.round(retailNumber * 0.5 * 100) / 100;
  }, [retailNumber]);

  const targetSellValue = useMemo(() => (targetSellNumber == null ? "—" : formatMoney(targetSellNumber)), [targetSellNumber]);

  const itemTitle = useMemo(() => {
    if (!record) return "";
    return String(record["Item Description"] || record["Description"] || "Item");
  }, [record]);


  const asin = useMemo(() => (record ? normalizeAsin(record.ASIN) : ""), [record]);
  const amazonUrl = useMemo(() => (asin ? amazonDpUrl(asin) : ""), [asin]);

  function Controls({ className }: { className?: string }) {
    return (
      <div className={className ?? ""}>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <span className="badge">
            <label style={{ display: "inline-flex", gap: 8, alignItems: "center", cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={scanMode}
                onChange={(e) => {
                  setScanMode(e.target.checked);
                  setTimeout(() => inputRef.current?.focus(), 50);
                }}
              />
              Scan Mode
            </label>
          </span>

          <span className="badge">
            <label style={{ display: "inline-flex", gap: 8, alignItems: "center", cursor: "pointer" }}>
              <input type="checkbox" checked={autoSearch} onChange={(e) => setAutoSearch(e.target.checked)} disabled={!scanMode} />
              Auto-search
            </label>
          </span>

          <span className="badge">
            <label style={{ display: "inline-flex", gap: 8, alignItems: "center", cursor: "pointer" }}>
              <input type="checkbox" checked={autoClear} onChange={(e) => setAutoClear(e.target.checked)} disabled={!scanMode} />
              Auto-clear
            </label>
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      {/* Desktop header */}
      <div className="header desktopOnly">
        <div className="brand">
          <h1>LPN Finder</h1>
          <p>
            Manifests are stored <strong>internally in GitHub</strong> under <code>/manifests</code>. Vercel indexes them automatically on
            deploy. Then just scan/type an LPN.
          </p>
        </div>

        <div className="row" style={{ justifyContent: "flex-end" }}>
          <span className="badge">
            Manifests: <strong style={{ color: "var(--text)" }}>{meta?.manifestCount ?? "—"}</strong>
          </span>
          <span className="badge">
            Unique LPNs: <strong style={{ color: "var(--text)" }}>{meta?.uniqueLpns ?? "—"}</strong>
          </span>
          <span className="badge">
            Updated:{" "}
            <strong style={{ color: "var(--text)" }}>{meta?.updatedAt ? new Date(meta.updatedAt).toLocaleString() : "—"}</strong>
          </span>
        </div>
      </div>

      {/* Mobile header (compact) */}
      <div className="header mobileOnly" style={{ marginBottom: 10 }}>
        <div className="brand">
          <h1 style={{ marginBottom: 0 }}>LPN Finder</h1>
          <div className="small" style={{ marginTop: 6 }}>
            {meta?.manifestCount ? `${meta.manifestCount} manifests • ${meta.uniqueLpns ?? "—"} LPNs` : "Ready to scan"}
          </div>
        </div>
      </div>

      <div className="card">
        <Controls className="desktopOnly" />
        <div className="desktopOnly">
          <hr className="sep" />
        </div>

        {/* Input */}
        <div className="row" style={{ alignItems: "flex-start" }}>
          <div style={{ flex: 1, minWidth: 260 }}>
            <input
              ref={inputRef}
              className="input"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Scan LPN…"
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              inputMode={scanMode ? "none" : "text"}
              onFocus={(e) => e.currentTarget.select()}
              onBlur={() => {
                if (scanMode) refocusSoon();
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  lookup();
                  (e.currentTarget as HTMLInputElement).select();
                }
              }}
            />
            <div className="small" style={{ marginTop: 8 }}>
              {scanMode ? "Auto-search triggers at LPN + 10 chars. Clears for next scan." : "Type an LPN and hit Search."}
            </div>
          </div>

          <button className="button iconButton" onClick={() => setScannerOpen(true)} title="Scan with camera" aria-label="Scan with camera">
            📷
          </button>

          <button className="button" onClick={() => lookup()}>
            Search
          </button>

          <button
            className="button"
            onClick={() => {
              setQuery("");
              setFound(null);
              setStatus("Ready. Scan or type an LPN.");
              lastTriggeredRef.current = "";
              if (scanMode) refocusSoon();
            }}
          >
            Clear
          </button>
        </div>

        <hr className="sep" />
        <div className="small">{status}</div>

        {/* Results */}
        {record && (
          <div style={{ marginTop: 12 }} className="card">
            <div className="heroRetail" style={{ marginTop: 0 }}>
              <div>
                <div className="priceLabel">Retail</div>
                <div className="price">{retailValue}</div>

                {/* Target sell */}
                <div
                  style={{
                    marginTop: 10,
                    display: "inline-block",
                    padding: "10px 12px",
                    borderRadius: 14,
                    border: "1px solid rgba(52,211,153,0.35)",
                    background: "rgba(52,211,153,0.10)",
                  }}
                >
                  <div className="priceLabel">Target Sell (50% off)</div>
                  <div style={{ fontSize: 24, fontWeight: 950, color: "var(--good)", lineHeight: 1.1 }}>{targetSellValue}</div>
                </div>

                {/* ✅ Size guess box */}
                {sizeGuess ? (
                  <div
                    style={{
                      marginTop: 10,
                      display: "inline-block",
                      padding: "10px 12px",
                      borderRadius: 14,
                      border: "1px solid rgba(251,191,36,0.35)",
                      background: "rgba(251,191,36,0.10)",
                      marginLeft: 10,
                    }}
                    title="Best guess from item description. Verify physical size—returns can be wrong."
                  >
                    <div className="priceLabel">
                      Size (best guess) <span aria-hidden="true">⚠️</span>
                    </div>
                    <div style={{ fontSize: 22, fontWeight: 950, color: "rgba(255,255,255,0.92)", lineHeight: 1.1 }}>
                      {sizeGuess}
                    </div>
                  </div>
                ) : null}

                <div className="small" style={{ marginTop: 8 }}>
                  Last LPN: <strong style={{ color: "var(--text)" }}>{lastLpn || record.LPN || "—"}</strong>
                </div>
              </div>

              <span className="badge desktopOnly">
                Source: <strong style={{ color: "var(--text)" }}>{String(record.__sourceFile || "—")}</strong>
              </span>
            </div>

            <div style={{ marginTop: 10, fontSize: 18, fontWeight: 950 }}>{itemTitle}</div>

            {/* Amazon link + image */}
            {asin ? (
              <div
                style={{
                  marginTop: 12,
                  display: "flex",
                  gap: 12,
                  alignItems: "center",
                  padding: 12,
                  borderRadius: 16,
                  border: "1px solid rgba(255,255,255,0.12)",
                  background: "rgba(0,0,0,0.14)",
                }}
              >
                <AmazonImage asin={asin} href={amazonUrl} />
                <div style={{ minWidth: 0 }}>
                  <div className="priceLabel">Amazon</div>
                  <div style={{ fontWeight: 950, fontSize: 14 }}>
                    ASIN: <span style={{ color: "var(--text)" }}>{asin}</span>
                  </div>
                  <a
                    href={amazonUrl}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      display: "inline-block",
                      marginTop: 6,
                      color: "var(--accent)",
                      fontWeight: 900,
                      textDecoration: "none",
                      wordBreak: "break-all",
                    }}
                  >
                    Open listing ↗
                  </a>
                </div>
              </div>
            ) : (
              <div className="small" style={{ marginTop: 10 }}>
                No ASIN found for this item.
              </div>
            )}

            <div className="grid" style={{ marginTop: 12 }}>
              <KV label="Qty" value={record.Qty} />
              <KV label="Ext. Retail" value={formatMoney(record["Ext. Retail"])} />
              <KV label="Brand" value={record.Brand} />
              <KV label="Condition" value={record.Condition} />
              <KV label="Pallet ID" value={record["Pallet ID"]} />
              <KV label="Lot ID" value={record["Lot ID"]} />

              <div className="desktopOnly">
                <div className="grid">
                  <KV label="ASIN" value={record.ASIN} />
                  <KV label="UPC" value={record.UPC} />
                  <KV label="EAN" value={record.EAN} />
                  <KV label="Category" value={record.Category} />
                  <KV label="Subcategory" value={record.Subcategory} />
                  <KV label="Sheet / Row" value={`${record.sheet ?? "—"} / ${record.rowNumber ?? "—"}`} />
                </div>
              </div>
            </div>
          </div>
        )}

        {found === false && (
          <div style={{ marginTop: 12 }} className="card">
            <div style={{ fontWeight: 950, fontSize: 16, color: "var(--bad)" }}>
              No match {lastLpn ? `(${lastLpn})` : ""}
            </div>
          </div>
        )}

        <div className="mobileOnly" style={{ marginTop: 14 }}>
          <hr className="sep" />
          <Controls />
        </div>
      </div>

      <div style={{ marginTop: 18 }} className="small desktopOnly">
        Want to add more manifests? Drop them in <code>/manifests</code>, commit, and Vercel will rebuild the index on deploy.
      </div>

      {scannerOpen && (
        <ZxingScannerModal
          onClose={() => setScannerOpen(false)}
          onScanned={(value) => {
            const v = normalizeLpn(value);
            setLastLpn(v);
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

function AmazonImage({ asin, href }: { asin: string; href: string }) {
  const candidates = useMemo(() => amazonImageCandidates(asin), [asin]);
  const [idx, setIdx] = useState(0);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setIdx(0);
    setFailed(false);
  }, [asin]);

  const src = candidates[idx];

  if (failed || !src) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        style={{
          width: 72,
          height: 72,
          borderRadius: 14,
          border: "1px solid rgba(255,255,255,0.14)",
          background: "rgba(255,255,255,0.06)",
          display: "grid",
          placeItems: "center",
          textDecoration: "none",
          color: "var(--muted)",
          fontWeight: 950,
          flex: "0 0 auto",
        }}
        title="Open Amazon listing"
      >
        🛒
      </a>
    );
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      style={{
        width: 72,
        height: 72,
        borderRadius: 14,
        border: "1px solid rgba(255,255,255,0.14)",
        background: "rgba(255,255,255,0.06)",
        overflow: "hidden",
        display: "block",
        flex: "0 0 auto",
      }}
      title="Open Amazon listing"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={`Amazon image ${asin}`}
        style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
        onError={() => {
          if (idx < candidates.length - 1) setIdx((v) => v + 1);
          else setFailed(true);
        }}
      />
    </a>
  );
}

/** ZXing camera scanner modal */
function ZxingScannerModal({
  onClose,
  onScanned,
}: {
  onClose: () => void;
  onScanned: (value: string) => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const controlsRef = useRef<any>(null);

  const [err, setErr] = useState<string | null>(null);
  const [torchAvailable, setTorchAvailable] = useState(false);
  const [torchOn, setTorchOn] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let codeReader: any = null;

    (async () => {
      try {
        const mod = await import("@zxing/browser");
        const { BrowserMultiFormatReader } = mod as any;

        codeReader = new BrowserMultiFormatReader(undefined, {
          delayBetweenScanAttempts: 25,
        });

        const video = videoRef.current;
        if (!video) return;

        let preferredDeviceId: string | undefined = undefined;
        try {
          const devices = await BrowserMultiFormatReader.listVideoInputDevices();
          const back = devices.find((d: any) => String(d.label || "").toLowerCase().includes("back"));
          preferredDeviceId = back?.deviceId || devices[devices.length - 1]?.deviceId;
        } catch {}

        const controls = await codeReader.decodeFromVideoDevice(preferredDeviceId, video, (result: any) => {
          if (cancelled) return;
          if (result) {
            const text = typeof result.getText === "function" ? result.getText() : String(result?.text ?? "");
            if (text) onScanned(text);
          }
        });

        controlsRef.current = controls;
        setTorchAvailable(Boolean(controls?.switchTorch));
      } catch (e: any) {
        setErr(e?.message || String(e));
      }
    })();

    return () => {
      cancelled = true;
      (async () => {
        try {
          if (controlsRef.current?.stop) controlsRef.current.stop();
        } catch {}
        try {
          if (codeReader?.reset) codeReader.reset();
        } catch {}
      })();
    };
  }, [onScanned]);

  async function toggleTorch() {
    try {
      const controls = controlsRef.current;
      if (!controls?.switchTorch) return;
      await controls.switchTorch(!torchOn);
      setTorchOn((v) => !v);
    } catch (e: any) {
      setErr(e?.message || String(e));
    }
  }

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
      <div className="card" style={{ width: "min(720px, 100%)" }} onClick={(e) => e.stopPropagation()}>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <div style={{ fontWeight: 950, fontSize: 16 }}>Scan barcode</div>
          <div className="row" style={{ justifyContent: "flex-end" }}>
            {torchAvailable && (
              <button className="button" onClick={toggleTorch} style={{ width: "auto" }}>
                {torchOn ? "Torch: On" : "Torch: Off"}
              </button>
            )}
            <button className="button" onClick={onClose} style={{ width: "auto" }}>
              Close
            </button>
          </div>
        </div>

        <hr className="sep" />

        {err ? (
          <div className="small" style={{ color: "var(--bad)" }}>
            Camera/scanner error: {err}
          </div>
        ) : (
          <>
            <div
              style={{
                borderRadius: 16,
                overflow: "hidden",
                border: "1px solid rgba(255,255,255,0.14)",
                background: "rgba(0,0,0,0.25)",
              }}
            >
              <video ref={videoRef} style={{ width: "100%", display: "block" }} muted playsInline />
            </div>

            <div className="small" style={{ marginTop: 10 }}>
              Aim at the barcode. Bright light + fill the frame improves results.
            </div>
          </>
        )}
      </div>
    </div>
  );
}

