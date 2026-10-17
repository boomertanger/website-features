// site/src/lib/boomertang/qr.js — the cover code's real QR code (docs/specs/boomertang.md §4f), made at build time as an SVG, so no QR
// code runs in the browser. It always points at production, even on staging builds: the cover is the printed object, and the ref tag
// (tang-cover) is counted by Traffic Pulse. Encoder: qrcode-generator (MIT, a site devDependency, used at build only).
//   qrSvg(url?, { label }) -> '<svg class="tg-qr" ...>' (dark modules in currentColor; the box behind it is the light paper)
import qrcode from "qrcode-generator";

export const COVER_URL = "https://boomertanger.com/boomertang?ref=tang-cover";

export function qrSvg(url = COVER_URL, { label = "QR code to boomertanger.com/boomertang" } = {}) {
  const qr = qrcode(0, "M");   // type 0: the smallest version that fits; M: about 15% error correction
  qr.addData(url, "Byte");
  qr.make();
  const n = qr.getModuleCount(), q = 2;   // a two-module quiet zone (the white box around it adds the rest)
  let d = "";
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${c + q} ${r + q}h1v1h-1z`;
  const s = n + 2 * q;
  return `<svg class="tg-qr" viewBox="0 0 ${s} ${s}" shape-rendering="crispEdges" role="img" aria-label="${label}"><path d="${d}" fill="currentColor"/></svg>`;
}
