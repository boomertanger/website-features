// shared/ui-kit/kit-boomertang.js — the "Boomertang pieces" section of the UI Kit page (/dev/ui-kit): the paper surface in Paper and
// Ink, the four trust tags (span, button, link; on the dark site, paper and ink), the issue bar (current page, locked pages, Paper or
// Ink pressed), Turn the page (both, first page, last page; dark and paper) and the redact (covered, revealed). docs/specs/boomertang.md
// §8; design-system.md §8ak. Sample text only. The magazine fonts load only on Boomertang pages, so here the pieces use the fallback
// stacks (--tang-serif, --tang-condensed, --tang-text). ui-kit.js appends boomertangKitHtml() and calls initBoomertangKit(mount).
import { factagHtml, issueBarHtml, initIssueBar, turnPageHtml, initRedact, TRUST } from "../ui/magazine.js";

const PAGES = [["Cover", "#kit-tang"], ["Contents", "#kit-tang"], ["Cover story", "#kit-tang"], ["The Family", "#kit-tang"], ["The Map", "#kit-tang"], ["Survive", "#kit-tang"], ["Speed", "#kit-tang"]];
const pages = (current, locked = []) => PAGES.map(([label, href], i) => ({ label, href, current: i === current, locked: locked.includes(i) }));
const tags = () => Object.keys(TRUST).map((t) => factagHtml({ trust: t, version: t === "ver" ? "PC 1.3.4" : "" })).join(" ");

function paperSample(mode) {
  return `<div class="bt-surface--paper kit-tang-sheet" data-mode="${mode}">
    <p class="kit-tang-kick">Sample text · ${mode === "ink" ? "Ink" : "Paper"}</p>
    <h4 class="kit-tang-hed">The Woman <em>in the</em> House</h4>
    <p class="kit-tang-body">Reading text sits on the paper in printed ink, with <a href="#kit-tang">a link in purple</a> and a fact tag after a sourced line. ${factagHtml({ trust: "off" })}</p>
    <p class="kit-tang-body">${tags()}</p>
    <p class="kit-tang-body kit-tang-rule">Editorial red marks the hairline above and the drop cap; never a button.</p>
  </div>`;
}
function redactSample(id, open, onPaper) {
  const body = `<div class="bt-redact${open ? " is-revealed" : ""}" id="${id}"><p class="kit-tang-body">Spoiler-free line: there's a way out nobody tells you about. <span class="bt-redact-text">Sample text: the how-to, blacked out until Reveal.</span></p></div>
    <button type="button" class="bt-btn bt-btn--secondary bt-btn--sm" data-redact-toggle aria-controls="${id}" data-pulse="tang-reveal">Reveal</button>`;
  return onPaper ? `<div class="bt-surface--paper kit-tang-sheet" data-mode="paper">${body}</div>` : `<div class="kit-tang-dark">${body}</div>`;
}

export function boomertangKitHtml() {
  const cell = (label, html) => `<div class="kit-hs-cell"><p class="kit-sub">${label}</p>${html}</div>`;
  return `
  <section class="kit-section" id="kit-tang">
    <h2 class="kit-h">Boomertang pieces (.bt-surface--paper, .bt-factag, .bt-issuebar, .bt-turnpage, .bt-redact)</h2>
    <p class="kit-p">The magazine's pieces (<span class="kit-code">shared/ui/magazine.js</span>: factagHtml, issueBarHtml + initIssueBar, turnPageHtml + initTurnPage, initRedact). The paper is <span class="kit-code">--tang-paper</span> with <span class="kit-code">--tang-ink</span>; Ink is <span class="kit-code">data-mode="ink"</span> on the surface or <span class="kit-code">data-tang-mode="ink"</span> on an ancestor. Gold headings, purple links, the editorial red never on anything clickable. The magazine fonts load only on Boomertang pages, so this page shows the fallback stacks.</p>
    <div class="kit-hs-grid">
      ${cell(".bt-surface--paper: Paper", paperSample("paper"))}
      ${cell(".bt-surface--paper: Ink (data-mode=\"ink\")", paperSample("ink"))}
    </div>
    <h3 class="kit-sub">.bt-factag: span (dark site), button (opens its source: data-factag-source, aria-expanded) and link (to The Index)</h3>
    <div class="kit-tang-row">${tags()}</div>
    <div class="kit-tang-row">${factagHtml({ trust: "off", sourceId: "steam", sourceTitle: "Granny on Steam" })} ${factagHtml({ trust: "ver", version: "PC 1.3.4", sourceId: "boomer", sourceTitle: "Tested by Boomer" })} ${factagHtml({ trust: "com", href: "#kit-tang", sourceTitle: "Granny Wiki (Fandom)" })} ${factagHtml({ trust: "fan", href: "#kit-tang" })}</div>
    <h3 class="kit-sub">.bt-issuebar: on the cover (Paper pressed), on Survive with locked pages (Ink pressed). Phone width: the nav scrolls sideways and the switch stays.</h3>
    <div class="kit-tang-bars" data-kit-tang-bars>
      ${issueBarHtml({ mastHref: "#kit-tang", line: "Vol. 1 · No. 1 · The Granny Issue", pages: pages(0), mode: "paper" })}
      ${issueBarHtml({ mastHref: "#kit-tang", line: "Vol. 1 · No. 2 · Sample issue", pages: pages(5, [2, 3, 4, 6]), mode: "ink" })}
    </div>
    <h3 class="kit-sub">.bt-turnpage: both directions, the first page (next only) and the last page (previous only), on dark and on paper. The arrow keys turn the page on real pages (initTurnPage).</h3>
    <div class="kit-tang-turns">
      ${turnPageHtml({ prev: { href: "#kit-tang", label: "Contents" }, next: { href: "#kit-tang", label: "The Family" } })}
      ${turnPageHtml({ next: { href: "#kit-tang", label: "Contents" } })}
      <div class="bt-surface--paper" data-mode="paper">${turnPageHtml({ prev: { href: "#kit-tang", label: "Chat's Verdict" } })}</div>
      <div class="bt-surface--paper" data-mode="ink">${turnPageHtml({ prev: { href: "#kit-tang", label: "Speed" }, next: { href: "#kit-tang", label: "The Index" } })}</div>
    </div>
    <h3 class="kit-sub">.bt-redact: covered and revealed, on paper and on the dark site (Reveal / Cover it again; covered text is hidden from screen readers)</h3>
    <div class="kit-hs-grid">
      ${cell("Covered, on paper", redactSample("kit-tang-rd1", false, true))}
      ${cell("Revealed, on the dark site", redactSample("kit-tang-rd2", true, false))}
    </div>
  </section>`;
}

export function initBoomertangKit(mount) {
  const sec = mount.querySelector("#kit-tang");
  if (!sec) return;
  sec.querySelectorAll(".bt-issuebar").forEach((bar) => initIssueBar(bar, { onMode: (m) => bar.closest(".kit-tang-bars")?.setAttribute("data-last-mode", m) }));
  sec.querySelectorAll(".bt-turnpage a, .bt-issuebar a").forEach((a) => a.addEventListener("click", (e) => e.preventDefault()));
  sec.querySelectorAll("[data-factag-source]").forEach((b) => b.addEventListener("click", () => b.setAttribute("aria-expanded", String(b.getAttribute("aria-expanded") !== "true"))));
  initRedact(sec);
}
