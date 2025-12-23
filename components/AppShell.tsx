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

  // scanning/search
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("Ready. Scan or type an LPN.");
  const [record, setRecord] = useState<any | null>(null);
  const [found, setFound] = useState<boolean | null>(null);

  // ✅ Scan mode options
  const [scanMode, setScanMode] = useState(true);
  const [autoClear, setAutoClear] = useState(true);

  // camera modal
  const [scannerOpen, setScannerOpen] = useState(false);

  const inputRef = useRef<HTMLInputElement | null>(null);

  // Keep last scanned LPN visible even if we auto-clear the input
  const [lastLpn, setLastLpn] = useState<string>("");

  useEffect(() => {
    // initial focus
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

      // ✅ Auto-clear after a successful scan/search for rapid scanning
      if (autoClear) {
        setQuery("");
        refocusSoon();
      }
    } catch (e: any) {
      setFound(false);
      setStatus(`Lookup failed: ${e?.message || e}`);
    } finally {
      if (scanMode) refocusSoon();
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
        {/* ✅ Scan mode controls */}
        <div className="row" style={{ justifyContent: "space-between", marginBottom: 10 }}>
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
              <input
                type="checkbox"
                checked={autoClear}
                onChange={(e) => setAutoClear(e.target.checked)}
              />
              Auto-clear
            </label>
          </span>
        </div>

        <div className="row" style={{ alignItems: "flex-start" }}>
          <div style={{ flex: 1, minWidth: 260 }}>
            <input
              ref={inputRef}
              className="input"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Scan / type LPN…"
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              // ✅ Hint to mobile: don’t show keyboard if possible
              inputMode={scanMode ? "none" : "text"}
              // ✅ keep focus for scan guns; select text if user taps in
              onFocus={(e) => e.currentTarget.select()}
              // ✅ in scan mode, if focus is lost, pull it back
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
              {scanMode
                ? "Scan Mode: input stays focused; scans search instantly; field clears after a match."
                : "Tip: Most barcode scanners “type” the value and send Enter."}
            </div>
          </div>

          {/* Camera scan button */}
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
              setFound(null);
              setStatus("Ready. Scan or type an LPN.");
              if (scanMode) refocusSoon();
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
              No match {lastLpn ? `(${lastLpn})` : ""}
            </div>
            <div className="small" style={{ marginTop: 6 }}>
              If you just added a new file, make sure it’s in{" "}
              <code>/manifests</code> and Vercel redeployed.
            </div>
          </div>
        )}

        {record && (
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
                  {String(lastLpn || record.LPN || "—")}
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
              <KV
                label="Sheet / Row"
                value={`${record.sheet ?? "—"} / ${record.rowNumber ?? "—"}`}
              />
            </div>
          </div>
        )}
      </div>

      <div style={{ marginTop: 18 }} className="small">
        Want to add more manifests? Drop them in <code>/manifests</code>, commit,
        and Vercel will rebuild the index on deploy.
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

/** ZXing camera scanner modal (unchanged from your ZXing version) */
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
          const back = devices.find((d: any) =>
            String(d.label || "").toLowerCase().includes("back")
          );
          preferredDeviceId =
            back?.deviceId || devices[devices.length - 1]?.deviceId;
        } catch {}

        const controls = await codeReader.decodeFromVideoDevice(
          preferredDeviceId,
          video,
          (result: any) => {
            if (cancelled) return;
            if (result) {
              const text =
                typeof result.getText === "function"
                  ? result.getText()
                  : String(result?.text ?? "");
              if (text) onScanned(text);
            }
          }
        );

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
      <div
        className="card"
        style={{ width: "min(720px, 100%)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="row" style={{ justifyContent: "space-between" }}>
          <div style={{ fontWeight: 950, fontSize: 16 }}>Scan barcode</div>
          <div className="row" style={{ justifyContent: "flex-end" }}>
            {torchAvailable && (
              <button
                className="button"
                onClick={toggleTorch}
                style={{ width: "auto" }}
              >
                {torchOn ? "Torch: On" : "Torch: Off"}
              </button>
            )}
            <button
              className="button"
              onClick={onClose}
              style={{ width: "auto" }}
            >
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
              <video
                ref={videoRef}
                style={{ width: "100%", display: "block" }}
                muted
                playsInline
              />
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
