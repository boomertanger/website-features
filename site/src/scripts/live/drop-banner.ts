// The site-wide drop banner (docs/specs/live-drops.md §5 part 2, B1 "Strip"; mockup docs/design/mockups/live-drops.html section 3). The kit's
// .bt-live-banner[data-kind="drop"] with the fuse (shared/ui/drop.js): no banner CSS here. It sits in the check-in banner's slot (banner-host.ts),
// under the check-in strip when both are open. Not on /live (the drop card, drop-card.ts), /live/control or /live/obs.
// Loaded by BaseLayout only once public/live has a drop (the one shared listener), or on a non-production address with ?drop= (the preview).
// The state is drop-watch.ts's (shared with the /live card). The strip element is kept and updated in place, so the kit's slide-in plays only when it
// first appears; the countdown, the fuse and the claim count tick here every 250 ms without a redraw. ✕ hides it for that drop (sessionStorage).
// A closed drop (and the member's result after it) fades out 10 s after it closed.
import { onAuth } from "../../lib/auth";
import { onLive } from "../../lib/live";
import { dropFuseHtml, setFuse } from "../../../../shared/ui/drop.js";
import { esc, reduced } from "./ui";
import { isMember } from "./pub-ui";
import { bannerOf, putBanner } from "./banner-host";
import { buttonOf, countWord, counts, dropFace, fuseClock, fuseOf, leftText, untilEnd, watchDrop, watchIo, winnersText, type DropView } from "./drop-watch";
import type { PubLive } from "./model";

const HIDE_KEY = "bt-drop-hidden";
const hiddenId = () => { try { return sessionStorage.getItem(HIDE_KEY) || ""; } catch { return ""; } };

/** The strip's inside for a view (the strip element itself is kept). */
function inner(v: DropView, p: number): string {
  const d = v.drop, name = `<b>${esc(d.name)}</b>`, f = fuseOf(v, p);
  const n = (t: string) => `<span class="bt-live-banner-n bt-live-banner-wide">· ${t}</span>`;
  const claims = `<span data-drop-n>${(d.claims || 0).toLocaleString("en-US")}</span>`;
  const cd = !counts(v.kind) ? "" : untilEnd(d) ? `<span class="bt-live-banner-cd bt-live-banner-wide">until the stream ends</span>` : `<span class="bt-live-banner-cd"><b data-drop-cd>${leftText(d)}</b><span class="bt-live-banner-wide"> left</span></span>`;
  const ok = `<span class="bt-live-banner-ok" aria-hidden="true">✓</span> `;
  const k = (t: string) => `<span class="bt-live-banner-k">${t}</span>`;
  const txt: Record<string, string> = {
    open: `${k("Live drop")} ${name} ${n(`${claims} ${countWord(d)}`)}`,
    visitor: `${k("Live drop")} ${name} ${n(`${claims} ${countWord(d)}`)}`,
    signup: `${k("Live drop")} ${name} ${n(`${claims} ${countWord(d)}`)}`,
    closing: `${k("Last call")} ${name} ${n(d.mode === "draw" ? "entries still count" : "claims still count")}`,
    claimed: `${ok}${k("It's yours")} ${name} ${n("added to your Trophy Room")}`,
    already: `${k("Already yours")} ${name} ${n(`${claims} claimed`)}`,
    entered: `${k("You're in the draw")} ${name} ${n(`${claims} entered`)}`,
    drawing: `${k("Drawing…")} ${name} ${n(`${claims} entered`)}`,
    won: `${ok}${k(`You're ${esc(d.name)}`)} ${n(`picked from ${claims} entries`)}`,
    lost: `${k("Not this time")} ${d.winners?.length ? `${winnersText(d)} ${d.winners.length > 1 ? "were" : "was"} chosen` : name}`,
    closed: `${k("Drop closed")} ${name} ${n(`${claims} ${countWord(d)}`)}`,
    dropper: `${k("Your drop")} ${name} ${n(`${claims} ${countWord(d)}`)}`,
  };
  const b = buttonOf(v);
  return `${dropFuseHtml(dropFace(d), { p: f.p, state: f.state, flip: v.flip && !reduced() })}<span class="bt-live-banner-txt">${txt[v.kind]}</span>${cd}<span class="bt-live-banner-sp"></span>`
    + (b ? `<button type="button" class="bt-btn bt-btn--primary bt-btn--sm" ${b.attrs}>${esc(b.label)}</button>` : "")
    + `<button type="button" class="bt-live-banner-x" data-drop-x aria-label="Hide the drop banner">✕</button>`;
}
/** The kit's data-state for a view ("signup" draws as the visitor strip). */
const stateOf = (v: DropView) => (v.kind === "signup" ? "visitor" : v.kind);

let started = false;
export async function startDropBanner() {
  if (started) return;
  started = true;
  const path = location.pathname.replace(/\/+$/, "");
  if (path === "/live" || path.startsWith("/live/control") || path.startsWith("/live/obs")) return;   // /live has the card; the control and stream view pages none
  const io = await watchIo();
  const fuseP = fuseClock();
  let el: HTMLElement | null = null, closedAt = 0, fadeTimer = 0, gone = "";

  const draw = (v: DropView | null) => {
    if (!v || hiddenId() === v.drop.id || gone === v.drop.id) { if (el) { putBanner("drop", null); el = null; } return; }
    if (!el || !el.isConnected || bannerOf("drop") !== el) {
      el = document.createElement("div");
      el.className = "bt-live-banner";
      el.dataset.kind = "drop";
      el.setAttribute("role", "status");
    }
    el.dataset.state = stateOf(v);
    el.dataset.dropId = v.drop.id;
    el.innerHTML = inner(v, fuseP(v.drop));
    putBanner("drop", el);
    // a closed drop fades out 10 s after it closed (the member's result too)
    if (v.drop.state === "closed") {
      if (!closedAt) closedAt = Date.now();
      clearTimeout(fadeTimer);
      const id = v.drop.id;
      fadeTimer = window.setTimeout(() => {
        const cur = el; if (!cur || cur.dataset.dropId !== id) return;
        const done = () => { gone = id; if (el === cur) { putBanner("drop", null); el = null; } };
        if (reduced()) done(); else cur.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 400, easing: "ease-out" }).finished.then(done, done);
      }, Math.max(0, 10000 - (Date.now() - closedAt)));
    } else { closedAt = 0; clearTimeout(fadeTimer); }
  };

  const w = watchDrop({
    io,
    feed: (fn) => {
      if (io.preview) { const p = { state: "live", streamId: "preview" } as PubLive; fn(p); const t = setInterval(() => fn(p), 1000); return () => clearInterval(t); }
      return onLive(fn);
    },
    onAuthState: (fn) => onAuth(fn), member: isMember, onView: draw,
  });

  // the tick: countdown, fuse, claim count, without a redraw
  setInterval(() => {
    const v = w.view(); if (!v || !el || document.hidden) return;
    const d = v.drop;
    const cd = el.querySelector("[data-drop-cd]"); if (cd && d.closesAt) { const t = leftText(d); if (cd.textContent !== t) cd.textContent = t; }
    const n = el.querySelector("[data-drop-n]"); if (n) { const t = (d.claims || 0).toLocaleString("en-US"); if (n.textContent !== t) n.textContent = t; }
    const fz = el.querySelector<HTMLElement>(".bt-dropfuse"); if (fz && fuseOf(v, 1).state === "open") setFuse(fz, fuseP(d));
  }, 250);

  document.addEventListener("click", (e) => {
    const t = (e.target as HTMLElement).closest<HTMLElement>("[data-drop-claim], [data-drop-x]");
    if (!t || !el || !el.contains(t)) return;
    if (t.hasAttribute("data-drop-x")) { try { sessionStorage.setItem(HIDE_KEY, el.dataset.dropId || ""); } catch { /* storage off: hidden for this page only */ } gone = el.dataset.dropId || ""; putBanner("drop", null); el = null; return; }
    w.claim();
  });
}

