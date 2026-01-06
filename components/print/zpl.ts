// components/print/zpl.ts

type LabelArgs = {
  name: string;
  retail: number;
  sell: number;
};

// ASCII-only money formatter (no locale surprises)
function money(n: number) {
  const x = Number.isFinite(n) ? n : 0;
  const s = x.toFixed(2); // "1234.50"
  const [whole, frac] = s.split(".");
  const withCommas = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `$${withCommas}.${frac}`;
}

/**
 * Zebra QLn220 — 2.00" x 1.25" label @ 203dpi
 * Approx dots: 406w x 254h
 *
 * Layout:
 * - Title: up to 3 lines
 * - Retail + Sell on same row/level, same size
 */
export function buildZplLabelTight({ name, retail, sell }: LabelArgs) {
  const W = 406;
  const H = 254;

  const left = 16;
  const right = 16;

  const colGap = 14;
  const colW = Math.floor((W - left - right - colGap) / 2);
  const sellX = left + colW + colGap;

  // Remove characters that can break ZPL
  const safeName = String(name ?? "")
    .replace(/[\^~]/g, "")
    .replace(/[^\x20-\x7E]/g, " ") // force ASCII printable only
    .trim();

  const titleY = 10;
  const dividerY = 110;

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

    // ---- Title (3 lines max) ----
    `^FO${left},${titleY}^A0N,22,22^FB${W - left - right},3,3,L,0^FD${safeName}^FS`,

    // Divider
    `^FO${left},${dividerY}^GB${W - left - right},2,2^FS`,

    // ---- Retail (left column) ----
    `^FO${left},${labelY}^A0N,22,22^FDRETAIL^FS`,
    `^FO${left},${priceY}^A0N,${priceFontH},${priceFontW}^FD${retailStr}^FS`,

    // ---- Sell (right column) ----
    `^FO${sellX},${labelY}^A0N,22,22^FDSELL^FS`,
    `^FO${sellX},${priceY}^A0N,${priceFontH},${priceFontW}^FD${sellStr}^FS`,

    "^XZ",
  ].join("\n");
}
