// components/print/zpl.ts

type LabelArgs = {
  name: string;
  retail: number;
  sell: number;
};

// ASCII-only money formatter (safe for Zebra)
function money(n: number) {
  const x = Number.isFinite(n) ? n : 0;
  const s = x.toFixed(2);
  const [whole, frac] = s.split(".");
  const withCommas = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `$${withCommas}.${frac}`;
}

// Basic title limiter: keep within approx 3 lines worth of text.
// This is an approximation, but works great for keeping labels clean.
function limitTitleToThreeLines(input: string, lineChars = 30, lines = 3) {
  const maxChars = lineChars * lines;

  // normalize whitespace
  let s = (input || "").replace(/\s+/g, " ").trim();

  if (s.length <= maxChars) return s;

  // Cut and add ellipsis (ASCII-only)
  s = s.slice(0, maxChars - 1).trimEnd();
  return s + "…";
}

/**
 * Zebra QLn220 — 2.00" x 1.25" label @ 203dpi
 * ~406w x 254h dots
 */
export function buildZplLabelTight({ name, retail, sell }: LabelArgs) {
  const W = 406;
  const H = 254;

  const left = 16;
  const right = 16;

  const colGap = 14;
  const colW = Math.floor((W - left - right - colGap) / 2);
  const sellX = left + colW + colGap;

  // Sanitize text for ZPL (ASCII printable only)
  let safeName = String(name ?? "")
    .replace(/[\^~]/g, "")
    .replace(/[^\x20-\x7E]/g, " ")
    .trim();

  // ✅ Truncate so we never exceed what 3 lines can reasonably display
  // If you want “tighter” truncation, drop lineChars from 30 -> 28
  safeName = limitTitleToThreeLines(safeName, 30, 3);

  const titleY = 22;
  const dividerY = 122;

  const labelY = dividerY + 10;
  const priceY = dividerY + 34;

  const priceFontH = 46;
  const priceFontW = 46;

  const retailStr = money(retail);
  const sellStr = money(sell);

  return [
    "^XA",
    `^PW${W}`,
    `^LL${H}`,

    // ---- Title (up to 3 lines) ----
    `^FO${left},${titleY}^A0N,22,22^FB${W - left - right},3,3,L,0^FD${safeName}^FS`,

    // Divider
    `^FO${left},${dividerY}^GB${W - left - right},2,2^FS`,

    // ---- Retail (left) ----
    `^FO${left},${labelY}^A0N,22,22^FDRETAIL^FS`,
    `^FO${left},${priceY}^A0N,${priceFontH},${priceFontW}^FD${retailStr}^FS`,

    // ---- Sell (right) ----
    `^FO${sellX},${labelY}^A0N,22,22^FDSELL^FS`,
    `^FO${sellX},${priceY}^A0N,${priceFontH},${priceFontW}^FD${sellStr}^FS`,

    "^XZ",
  ].join("\n");
}

