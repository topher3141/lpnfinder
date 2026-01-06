export function toMoney(n: number) {
  return n.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

function sanitize(text: string) {
  return String(text ?? "")
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * QLn220 @ 203 dpi
 * 2.0" wide = 406 dots
 * 1.25" tall = 254 dots
 */
export function buildZplLabelTight({
  name,
  retail,
  sell,
}: {
  name: string;
  retail: number;
  sell: number;
}) {
  const title = sanitize(name).toUpperCase();
  const line2 = `${toMoney(retail)}  ->  ${toMoney(sell)}`;

  return `^XA
^CI27
^PW406
^LL254
^LH0,0
^MMT
^PR3
^MD15
^PON

^FO12,18
^A0N,34,30
^FB382,2,0,L,0
^FD${title}^FS

^FO12,112
^A0N,30,26
^FD${line2}^FS

^XZ`;
}
