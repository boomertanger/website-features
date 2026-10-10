// shared/ui/reveal.js — .bt-reveal, the page version of the footer's Show / Copy (docs/design-system.md §5 ".bt-reveal", §8u;
// docs/specs/hotline-boom.md §10). A labelled row per address: the address is masked ("••••••••@domain"), Show types it in, then the
// button becomes Copy, then "Copied" for a moment. The full address is never in the HTML: the row carries the user part and the domain
// parts separately and the script joins them on Show (a scraper reading the markup finds no address).
//
//   revealRowHtml({ key, label, user, domain })   one row. key picks the dot colour (business | fanmail | support | privacy → the
//                                                 --bt-contact-* tokens); user is the part before the @; domain is "boomertanger.com".
//   revealHtml({ rows, lead })                    the card: an optional lead paragraph and the rows.
//   initReveals(root = document)                  wires every .bt-reveal under root (once). Reduced motion (or data-instant on the
//                                                 .bt-reveal, used by the UI kit page): the address appears at once, no typing.
//
// States on the row (data-state): hidden (default) · typing · shown · copied. The address span is aria-live, so the typed address is read.
import { escapeHtml as esc } from "./dom.js";

const KEYS = ["business", "fanmail", "support", "privacy"];

export function revealRowHtml({ key = "", label = "", user = "", domain = "" } = {}) {
  const k = KEYS.includes(key) ? key : "";
  const parts = String(domain).split(".").filter(Boolean);
  return `<div class="bt-reveal-row" data-state="hidden"${k ? ` data-k="${k}"` : ""} data-u="${esc(user)}" data-d="${esc(parts.slice().reverse().join(" "))}">`
    + `<b class="bt-reveal-label">${esc(label)}</b>`
    + `<span class="bt-reveal-addr" aria-live="polite">••••••••@${esc(parts.join("."))}</span>`
    + `<button type="button" class="bt-btn bt-btn--secondary bt-btn--sm" data-reveal>Show</button></div>`;
}

export function revealHtml({ rows = [], lead = "" } = {}) {
  return `<div class="bt-reveal">${lead ? `<p class="bt-reveal-lead">${esc(lead)}</p>` : ""}<div class="bt-reveal-rows">${rows.map(revealRowHtml).join("")}</div></div>`;
}

const reduced = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
const addressOf = (row) => `${row.dataset.u}@${String(row.dataset.d || "").split(" ").reverse().join(".")}`;

async function copy(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
}

export function initReveals(root = document) {
  root.querySelectorAll(".bt-reveal:not([data-reveal-ready])").forEach((box) => {
    box.dataset.revealReady = "";
    box.addEventListener("click", async (e) => {
      const b = e.target.closest("[data-reveal]");
      if (!b || !box.contains(b)) return;
      const row = b.closest(".bt-reveal-row"), out = row.querySelector(".bt-reveal-addr");
      const addr = addressOf(row), st = row.dataset.state;
      if (st === "typing") return;
      if (st === "shown" || st === "copied") {
        const ok = await copy(addr);
        if (!ok) {   // no clipboard: select the address so Ctrl+C works
          const r = document.createRange(); r.selectNodeContents(out);
          const sel = getSelection(); sel?.removeAllRanges(); sel?.addRange(r);
          return;
        }
        row.dataset.state = "copied"; b.textContent = "Copied";
        clearTimeout(row._t); row._t = setTimeout(() => { row.dataset.state = "shown"; b.textContent = "Copy"; }, 1600);
        return;
      }
      if (reduced() || box.hasAttribute("data-instant")) { out.textContent = addr; row.dataset.state = "shown"; b.textContent = "Copy"; return; }
      row.dataset.state = "typing";
      let n = 0;
      const t = setInterval(() => {
        n++; out.textContent = addr.slice(0, n);
        if (n >= addr.length) { clearInterval(t); row.dataset.state = "shown"; b.textContent = "Copy"; }
      }, 28);
    });
  });
}
