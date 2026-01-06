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
 * Zebra QLn220 — 2.00" x 1.25" label at 203dpi
 * Approx dots: 406w x 254h
 *
 * Layout:
 * - Title: max 2 lines (no overlap)
 * - Retail + Sell: larger & easy to read
 */
export function buildZplLabelTight({ name, retail, sell }: LabelArgs) {
  const W = 406;
  const left = 18;

  // Remove characters that can break ZPL
  const safeName = String(name ?? "")
    .replace(/[\^~]/g, "")
    .trim();

  return [
    "^XA",
    `^PW${W}`,
    "^LL254",
    "^CI28",

    // ----- TITLE (2 lines max) -----
    // y=12, font 24x24, field block width ~370, maxLines=2, lineSpacing=4
    `^FO${left},12^A0N,24,24^FB${W - left * 2},2,4,L,0^FD${safeName}^FS`,

    // Divider
    "^FO18,78^GB370,2,2^FS",

    // ----- RETAIL (bigger) -----
    "^FO18,88^A0N,26,26^FDRETAIL^FS",
    `^FO18,116^A0N,56,56^FD${money(retail)}^FS`,

    // ----- SELL (still highlighted but smaller than retail) -----
    "^FO18,176^A0N,22,22^FDSELL^FS",
    `^FO18,200^A0N,46,46^FD${money(sell)}^FS`,

    "^XZ",
  ].join("\n");
}
