type BuildLabelArgs = {
  name: string;
  retail: number;
  ourPrice: number; // rounded whole-dollar already in AppShell
};

/**
 * Utility: split title into maxLines, with maxCharsPerLine,
 * and HARD truncate so we never print more text than fits.
 */
function splitTitleHard(text: string, maxCharsPerLine: number, maxLines: number): string[] {
  const clean = String(text ?? "")
    .replace(/\s+/g, " ")
    .trim();

  if (!clean) return [""];

  const lines: string[] = [];
  let i = 0;

  // Hard-cut by character count (most predictable for ZPL, avoids overflow)
  while (i < clean.length && lines.length < maxLines) {
    lines.push(clean.slice(i, i + maxCharsPerLine));
    i += maxCharsPerLine;
  }

  return lines;
}

// Escape ZPL control-ish characters (basic safety)
function zplSafe(s: string) {
  return String(s ?? "").replace(/[\^~]/g, " ");
}

/**
 * QLn220 2" label (203 dpi) friendly layout.
 * If your label size differs, tell me printer DPI + label WxH and I’ll tune coordinates.
 */
export function buildZplLabelTight({ name, retail, ourPrice }: BuildLabelArgs) {
  const titleLines = splitTitleHard(name, 22, 3).map(zplSafe);

  // Coordinates tuned to avoid top clipping and give 3 lines
  // You can adjust X/Y if your label stock differs.
  const x = 18;

  // Title block
  const titleY = 20; // top margin to prevent clipping
  const titleLineHeight = 34;

  // Prices block below title
  const pricesY = titleY + titleLineHeight * 3 + 10; // after 3 lines

  const retailStr = `$${Math.round(retail).toString()}`; // retail shown rounded too (visual consistency)
  const ourStr = `$${Math.round(ourPrice).toString()}`;

  return `
^XA
^CI28
^PW406
^LH0,0
^FS

^CF0,28
^FO${x},${titleY}^FD${titleLines[0] ?? ""}^FS
^FO${x},${titleY + titleLineHeight}^FD${titleLines[1] ?? ""}^FS
^FO${x},${titleY + titleLineHeight * 2}^FD${titleLines[2] ?? ""}^FS

^FO${x},${pricesY}^GB370,2,2^FS

^CF0,28
^FO${x},${pricesY + 10}^FDOUR PRICE^FS
^CF0,70
^FO${x},${pricesY + 40}^FD${ourStr}^FS

^CF0,26
^FO${x},${pricesY + 125}^FDRETAIL^FS
^CF0,34
^FO${x},${pricesY + 155}^FD${retailStr}^FS

^XZ
`.trim();
}
