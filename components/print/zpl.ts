// components/print/zpl.ts

type LabelArgs = {
  name: string;
  retail: number;
  sell: number;
};

function money(n: number) {
  return n.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

/**
 * Zebra QLn220 — 2.00" x 1.25" label @ 203dpi
 * Approx dots: 406w x 254h
 *
 * Layout:
 * - Title: up to 3 lines (no overlap)
 * - Bottom: Retail + Sell side-by-side, same size (easy to read)
 */
export function buildZplLabelTight({ name, retail, sell }: LabelArgs) {
  const W = 406;
  const H = 254;

  const left = 16;
  const right = 16;

  // Two columns in bottom area
  const colGap = 14;
  const colW = Math.floor((W - left - right - colGap) / 2);
  const sellX = left + colW + colGap;

  // Clean any chars that can break ZPL
  const safeName = String(name ?? "")
    .replace(/[\^~]/g, "")
    .trim();

  // Title block area height:
  // 3 lines of ~22-24 dot font + spacing => ~80-90 dots
  // We'll allocate up to y ~ 104 for title, then divider, then price row.
  const titleY = 10;
  const titleFontH = 22;
  const titleFontW = 22;

  const dividerY = 108;

  // Bottom pricing starts after divider
  const labelY = dividerY + 10;   // label line
  const priceY = dividerY + 34;   // price line

  // Price font: match your "sell good size"
  const priceFontH = 46;
  const priceFontW = 46;

  const retailStr = money(retail);
  const sellStr = money(sell);

  return [
    "^XA",
    `^PW${W}`,
    `^LL${H}`,
    "^CI28",

    // ---- Title (3 lines max) ----
    // ^FB width,maxLines,lineSpacing,alignment,hang
    `^FO${left},${titleY}^A0N,${titleFontH},${titleFontW}^FB${W - left - right},3,3,L,0^FD${safeName}^FS`,

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
