// The /live drop card (docs/specs/live-drops.md §5 part 3; mockup docs/design/mockups/live-drops.html section 4): in the Bridge under the stream, the same
// states as the site-wide banner (drop-watch.ts decides them for both), with a bigger fuse, the kit's .bt-drop-timer and the claim count ticking.
// A .bt-cr-panel, so it follows the house look. The site-wide banner never shows on /live. Mounted by pub-bridge.ts into [data-p="drop"]; it owns that
// element (pub-bridge never patches it) and hides it while there is no drop. Feature CSS: live-drops.css (.dc-).
import { onAuth } from "../../lib/auth";
import { crPanelHtml } from "../../../../shared/ui/cr-panel.js";
import { dropFuseHtml, setFuse } from "../../../../shared/ui/drop.js";
import { esc, reduced } from "./ui";
import { isMember } from "./pub-ui";
import type { PubApi } from "./pub-data";
import { buttonOf, counts, countWord, dropFace, fuseClock, fuseOf, leftText, untilEnd, watchDrop, watchIo, winnersText, type DropView } from "./drop-watch";

function body(v: DropView, p: number): string {
  const d = v.drop, n = `<span data-drop-n>${(d.claims || 0).toLocaleString("en-US")}</span>`, cw = countWord(d);
  const clock = untilEnd(d) ? "Until stream ends" : `<span data-drop-cd>${leftText(d)}</span>`;
  const big: Record<string, [string, string]> = {
    open: [clock, untilEnd(d) ? `${n} ${cw} so far` : `left · ${n} ${cw}`],
    visitor: [clock, `left · ${n} ${cw} · join free to claim`],
    signup: [clock, `left · ${n} ${cw} · finish joining to claim`],
    closing: ["Last call", `${d.mode === "draw" ? "Entries" : "Claims"} still count · ${n} ${cw}`],
    claimed: ["It's yours", `Added to your Trophy Room · ${n} claimed`],
    already: ["Already yours", `${n} claimed`],
    entered: [clock, `You're in the draw · ${n} entered`],
    drawing: ["Drawing…", `${n} entered · the winner shows within a minute`],
    won: ["You won", `You're ${esc(d.name)} · picked from ${n} entries`],
    lost: ["Not this time", d.winners?.length ? `${winnersText(d)} ${d.winners.length > 1 ? "were" : "was"} chosen` : `${n} entered`],
    closed: ["Drop closed", d.mode === "draw" && d.winners?.length ? `${winnersText(d)} ${d.winners.length > 1 ? "are" : "is"} ${esc(d.name)}` : `${n} ${cw}`],
    dropper: [clock, `Your drop · ${n} ${cw}`],
  };
  const [t, s] = big[v.kind];
  const words = !counts(v.kind) || untilEnd(d);
  const st = v.kind === "closing" || v.kind === "drawing" ? ' data-state="closing"' : "";
  const f = fuseOf(v, p), b = buttonOf(v);
  const kicker = v.kind === "visitor" || v.kind === "signup" || v.kind === "open" ? "Live drop" : d.mode === "draw" ? "Draw" : "Drop";
  return `<div class="dc">${dropFuseHtml(dropFace(d), { p: f.p, state: f.state, flip: v.flip && !reduced() })}`
    + `<div class="dc-main"><span class="dc-k">${kicker}</span><b class="dc-name">${esc(d.name)}</b><div class="bt-drop-timer dc-timer${words ? " dc-timer--words" : ""}"${st}><span>${t}</span><small>${s}</small></div></div>`
    + (b ? `<button type="button" class="bt-btn bt-btn--primary" ${b.attrs}>${esc(b.label)}</button>` : "")
    + `</div>`;
}

export interface DropCard { stop(): void }
export function mountDropCard(el: HTMLElement, api: PubApi): DropCard {
  let w: ReturnType<typeof watchDrop> | null = null, dead = false, timer = 0, fadeTimer = 0, closedAt = 0, gone = "";
  const fuseP = fuseClock();
  el.hidden = true;
  const draw = (v: DropView | null) => {
    if (!v || gone === v.drop.id) { el.hidden = true; el.innerHTML = ""; return; }
    el.hidden = false;
    el.innerHTML = crPanelHtml({ id: "lp-drop", cls: "lp-drop", title: "Live drop", icon: "drop", bodyHtml: body(v, fuseP(v.drop)) });
    if (v.drop.state === "closed") {
      if (!closedAt) closedAt = Date.now();
      clearTimeout(fadeTimer);
      const id = v.drop.id;
      fadeTimer = window.setTimeout(() => { gone = id; el.hidden = true; el.innerHTML = ""; }, Math.max(0, 10000 - (Date.now() - closedAt)));
    } else { closedAt = 0; clearTimeout(fadeTimer); }
  };
  void watchIo().then((io) => {
    if (dead) return;
    w = watchDrop({ io, feed: (fn) => api.feed(fn), onAuthState: (fn) => onAuth(fn), member: isMember, onView: draw });
  });
  timer = window.setInterval(() => {
    const v = w?.view(); if (!v || el.hidden || document.hidden) return;
    const d = v.drop;
    const cd = el.querySelector("[data-drop-cd]"); if (cd && d.closesAt) { const t = leftText(d); if (cd.textContent !== t) cd.textContent = t; }
    el.querySelectorAll("[data-drop-n]").forEach((n) => { const t = (d.claims || 0).toLocaleString("en-US"); if (n.textContent !== t) n.textContent = t; });
    const fz = el.querySelector<HTMLElement>(".bt-dropfuse"); if (fz && fuseOf(v, 1).state === "open") setFuse(fz, fuseP(d));
  }, 250);
  el.addEventListener("click", (e) => { if ((e.target as HTMLElement).closest("[data-drop-claim]")) w?.claim(); });
  return { stop() { dead = true; clearInterval(timer); clearTimeout(fadeTimer); w?.stop(); el.innerHTML = ""; } };
}
