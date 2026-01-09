// components/print/zpl.ts

type LabelArgs = {
  name: string;
  retail: number;
  sell: number; // (we keep the param name for compatibility, but it represents "Our Price")
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
  const ourX = left; // left column
  const retailX = left + colW + colGap; // right column

  // Sanitize text for ZPL (ASCII printable only)
  let safeName = String(name ?? "")
    .replace(/[\^~]/g, "")
    .replace(/[^\x20-\x7E]/g, " ")
    .trim();

  // Enforce 3-line limit
  safeName = limitTitleToThreeLines(safeName, 30, 3);

  // Give the title more top margin so it doesn't get clipped
  const titleY = 32;

  // Move divider slightly down to keep room for 3 lines comfortably
  const dividerY = 132;

  const labelY = dividerY + 10;
  const priceY = dividerY + 36;

  // Bigger prices for easier reading
  const priceFontH = 54;
  const priceFontW = 54;

  const retailStr = money(retail);
  const ourStr = money(sell); // "sell" value is actually Our Price

  return [
    "^XA",
    `^PW${W}`,
    `^LL${H}`,

    // ---- Title (up to 3 lines) ----
    `^FO${left},${titleY}^A0N,22,22^FB${W - left - right},3,3,L,0^FD${safeName}^FS`,

    // Divider
    `^FO${left},${dividerY}^GB${W - left - right},2,2^FS`,

    // ---- OUR PRICE (left) ----
    `^FO${ourX},${labelY}^A0N,22,22^FDOUR PRICE^FS`,
    `^FO${ourX},${priceY}^A0N,${priceFontH},${priceFontW}^FD${ourStr}^FS`,

    // ---- RETAIL (right) ----
    `^FO${retailX},${labelY}^A0N,22,22^FDRETAIL^FS`,
    `^FO${retailX},${priceY}^A0N,${priceFontH},${priceFontW}^FD${retailStr}^FS`,

    "^XZ",
  ].join("\n");
}
