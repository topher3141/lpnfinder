"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { buildZplLabelTight } from "@/components/print/zpl";

type Meta = {
  updatedAt?: string;
  manifests?: string[];
  manifestCount?: number;
  shards?: number;
  shardsList?: string[];
  uniqueLpns?: number;
};

type ZebraDevice = { name: string; address: string };

declare global {
  interface Window {
    ZebraBridge?: {
      listPaired: () => Promise<{ devices: ZebraDevice[] }>;
      printZpl: (args: { address: string; zpl: string }) => Promise<void>;
    };
    ScanBridge?: {
      configure: (opts: { action?: string; extraKey?: string }) => Promise<any>;
      addListener: (eventName: "scan", cb: (ev: { value?: string }) => void) => { remove: () => void };
    };
  }
}

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

function getSavedPrinterAddress(): string {
  try {
    return localStorage.getItem("zebra_printer_address") || "";
  } catch {
    return "";
  }
}

function setSavedPrinterAddress(address: string) {
  try {
    localStorage.setItem("zebra_printer_address", address);
  } catch {}
}

function getSavedPrintMode(): boolean {
  try {
    return localStorage.getItem("zebra_print_mode") === "1";
  } catch {
    return false;
  }
}

function setSavedPrintMode(v: boolean) {
  try {
    localStorage.setItem("zebra_print_mode", v ? "1" : "0");
  } catch {}
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

  // Print Mode (auto-print after lookup) — OFF by default
  const [printMode, setPrintMode] = useState(false);

  const [scannerOpen, setScannerOpen] = useState(false);

  const inputRef = useRef<HTMLInputElement | null>(null);
  const lastTriggeredRef = useRef<string>("");

  const [lastLpn, setLastLpn] = useState<string>("");

  // Native printing state
  const [isNative, setIsNative] = useState(false);
  const [printerModalOpen, setPrinterModalOpen] = useState(false);
  const [pairedDevices, setPairedDevices] = useState<ZebraDevice[]>([]);
  const [printerAddress, setPrinterAddress] = useState<string>("");

  // Prevent double auto-prints for same LPN
  const lastAutoPrintedRef = useRef<string>("");

  // Keep ScanBridge listener remover
  const scanBridgeRemover = useRef<{ remove: () => void } | null>(null);

  function refocusSoon() {
    setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 30);
  }

  // Unified entry for ANY scan source (keyboard wedge, intent broadcast, camera)
  async function handleIncomingScan(raw: string) {
    const v = normalizeLpn(raw);
    if (!v) return;

    // Avoid repeated triggers from some scanners that fire twice
    if (lastTriggeredRef.current === v) return;
    lastTriggeredRef.current = v;

    setLastLpn(v);
    setQuery(v);

    // If scanMode+autoSearch, lookup will happen automatically in the effect below.
    // But for intent broadcasts we want to fire immediately to feel instant.
    // We'll do both safely by calling lookup() and letting the effect ignore duplicates.
    await lookup(v);
  }

  useEffect(() => {
    inputRef.current?.focus();

    // detect native bridge + restore saved printer
    setIsNative(Boolean(window?.ZebraBridge?.printZpl && window?.ZebraBridge?.listPaired));
    setPrinterAddress(getSavedPrinterAddress());

    // restore print mode (OFF by default if never set)
    setPrintMode(getSavedPrintMode());

    // load meta
    (async () => {
      try {
        const res = await fetch("/index/meta.json", { cache: "no-store" });
        if (res.ok) setMeta(await res.json());
      } catch {}
    })();

    // ---- Intent Broadcast scanning (native app only) ----
    try {
      // Clean up any old listener (hot reload)
      if (scanBridgeRemover.current?.remove) {
        scanBridgeRemover.current.remove();
        scanBridgeRemover.current = null;
      }

      // Preferred: Capacitor plugin listener
      if (window.ScanBridge?.addListener) {
        // Optional: If you later set PM85 to a single custom action/key once,
        // you can lock it here:
        // window.ScanBridge.configure({ action: "com.lcliquidations.lpnfinder.SCAN", extraKey: "data" });

        scanBridgeRemover.current = window.ScanBridge.addListener("scan", (ev) => {
          const raw = String(ev?.value ?? "").trim();
          if (!raw) return;
          handleIncomingScan(raw);
        });
      }

      // Fallback: window event dispatched by native code
      const onPmScan = (e: any) => {
        const raw = String(e?.detail?.value ?? "").trim();
        if (!raw) return;
        handleIncomingScan(raw);
      };
      window.addEventListener("pm-scan", onPmScan as any);

      // cleanup for window event
      return () => {
        try {
          window.removeEventListener("pm-scan", onPmScan as any);
        } catch {}
        try {
          if (scanBridgeRemover.current?.remove) scanBridgeRemover.current.remove();
        } catch {}
      };
    } catch {
      // ignore
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setSavedPrintMode(printMode);
  }, [printMode]);

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
        // do NOT clear lastTriggeredRef here; it prevents double triggers
      }
      if (scanMode) refocusSoon();
    }
  }

  // auto-search when a full LPN is present (keyboard wedge path)
  useEffect(() => {
    if (!scanMode || !autoSearch) return;

    const s = normalizeLpn(query);
    if (!looksLikeFullLpn(s)) return;

    // Avoid double lookup if intent listener already fired
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

  async function openPrinterModal() {
    if (!window.ZebraBridge?.listPaired) {
      setStatus("Printer setup is available only in the Android app build.");
      return;
    }
    setStatus("Loading paired printers…");
    try {
      const res = await window.ZebraBridge.listPaired();
      setPairedDevices(res?.devices || []);
      setPrinterModalOpen(true);
      setStatus("Select your Zebra printer.");
    } catch (e: any) {
      setStatus(`Failed to list paired devices: ${e?.message || e}`);
    }
  }

  async function printLabelSeamless() {
    if (!record) return;

    if (!isNative || !window.ZebraBridge?.printZpl) {
      setStatus("Seamless print is only available in the Android app build.");
      return;
    }

    const addr = printerAddress || getSavedPrinterAddress();
    if (!addr) {
      setStatus("No printer selected. Choose a printer first.");
      await openPrinterModal();
      return;
    }

    const retail = retailNumber;
    if (retail == null || !Number.isFinite(retail) || retail <= 0) {
      setStatus("Cannot print: missing retail.");
      return;
    }

    const sell = Math.round(retail * 0.5 * 100) / 100;
    const zpl = buildZplLabelTight({ name: itemTitle, retail, sell });

    setStatus("Printing…");
    try {
      await window.ZebraBridge.printZpl({ address: addr, zpl });
      setStatus("Printed ✅");
    } catch (e: any) {
      setStatus(`Print failed: ${e?.message || e}`);
    } finally {
      if (scanMode) refocusSoon();
    }
  }

  // Auto-print when Print Mode is ON and a record is found
  useEffect(() => {
    if (!printMode) return;
    if (!isNative) return;
    if (!record) return;
    if (!found) return;

    const currentLpn = normalizeLpn(String(lastLpn || record?.LPN || ""));
    if (!currentLpn) return;

    if (lastAutoPrintedRef.current === currentLpn) return;
    lastAutoPrintedRef.current = currentLpn;

    (async () => {
      await printLabelSeamless();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [printMode, isNative, record, found, lastLpn]);

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

          <span className="badge">
            <label style={{ display: "inline-flex", gap: 8, alignItems: "center", cursor: "pointer" }}>
              <input type="checkbox" checked={printMode} onChange={(e) => setPrintMode(e.target.checked)} disabled={!isNative} />
              Print Mode
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

        <div className="row" style={{ justifyContent: "flex-end", alignItems: "center" }}>
          {isNative && (
            <button className="button" onClick={openPrinterModal} style={{ width: "auto" }}>
              Printer
            </button>
          )}
          <span className="badge">
            Manifests: <strong style={{ color: "var(--text)" }}>{meta?.manifestCount ?? "—"}</strong>
          </span>
          <span className="badge">
            Unique LPNs: <strong style={{ color: "var(--text)" }}>{meta?.uniqueLpns ?? "—"}</strong>
          </span>
          <span className="badge">
            Updated: <strong style={{ color: "var(--text)" }}>{meta?.updatedAt ? new Date(meta.updatedAt).toLocaleString() : "—"}</strong>
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
          {isNative && (
            <div style={{ marginTop: 10, display: "flex", gap: 10, alignItems: "center" }}>
              <button className="button" onClick={openPrinterModal} style={{ width: "auto" }}>
                Printer
              </button>
              <span className="badge">
                <label style={{ display: "inline-flex", gap: 8, alignItems: "center", cursor: "pointer" }}>
                  <input type="checkbox" checked={printMode} onChange={(e) => setPrintMode(e.target.checked)} />
                  Print Mode
                </label>
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="card">
        <Controls className="desktopOnly" />
        <div className="desktopOnly">
          <hr className="sep" />
        </div>

        {/* Input row */}
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
              setRecord(null);
              setStatus("Ready. Scan or type an LPN.");
              lastTriggeredRef.current = "";
              lastAutoPrintedRef.current = "";
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

                <div className="small" style={{ marginTop: 8 }}>
                  Last LPN: <strong style={{ color: "var(--text)" }}>{lastLpn || record.LPN || "—"}</strong>
                </div>

                {isNative && (
                  <div style={{ marginTop: 10 }}>
                    <button className="button" onClick={printLabelSeamless} style={{ width: "auto" }}>
                      Print Label
                    </button>
                    <div className="small" style={{ marginTop: 6 }}>
                      Printer: <strong style={{ color: "var(--text)" }}>{printerAddress ? printerAddress : "Not selected"}</strong>
                    </div>
                  </div>
                )}
              </div>

              <span className="badge desktopOnly">
                Source: <strong style={{ color: "var(--text)" }}>{String(record.__sourceFile || "—")}</strong>
              </span>
            </div>

            <div style={{ marginTop: 10, fontSize: 18, fontWeight: 950 }}>{itemTitle}</div>

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
            <div style={{ fontWeight: 950, fontSize: 16, color: "var(--bad)" }}>No match {lastLpn ? `(${lastLpn})` : ""}</div>
          </div>
        )}

        <div className="mobileOnly" style={{ marginTop: 14 }}>
          <hr className="sep" />
          <Controls />
        </div>
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

      {printerModalOpen && (
        <PrinterModal
          devices={pairedDevices}
          selectedAddress={printerAddress}
          onClose={() => setPrinterModalOpen(false)}
          onSelect={(addr) => {
            setPrinterAddress(addr);
            setSavedPrinterAddress(addr);
            setPrinterModalOpen(false);
            setStatus("Printer saved.");
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

function PrinterModal({
  devices,
  selectedAddress,
  onClose,
  onSelect,
}: {
  devices: ZebraDevice[];
  selectedAddress: string;
  onClose: () => void;
  onSelect: (address: string) => void;
}) {
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
        zIndex: 60,
      }}
      onClick={onClose}
    >
      <div className="card" style={{ width: "min(720px, 100%)" }} onClick={(e) => e.stopPropagation()}>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <div style={{ fontWeight: 950, fontSize: 16 }}>Select Zebra printer</div>
          <button className="button" onClick={onClose} style={{ width: "auto" }}>
            Close
          </button>
        </div>

        <hr className="sep" />

        {devices.length === 0 ? (
          <div className="small">No paired Bluetooth devices found. Pair the QLn220 in Android Bluetooth settings first.</div>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {devices.map((d) => {
              const active = d.address === selectedAddress;
              return (
                <button
                  key={d.address}
                  className="button"
                  onClick={() => onSelect(d.address)}
                  style={{
                    width: "100%",
                    textAlign: "left",
                    border: active ? "1px solid rgba(99,102,241,0.7)" : undefined,
                  }}
                >
                  <div style={{ fontWeight: 950 }}>{d.name || "Unnamed device"}</div>
                  <div className="small">{d.address}</div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
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
