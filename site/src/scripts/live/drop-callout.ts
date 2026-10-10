// The stream view's drop callout (/live/obs, layout wide and tall; docs/specs/live-drops.md §5 part 4; mockup docs/design/mockups/live-drops.html
// section 4): the fuse, "Live drop · claim at boomertanger.com/live", the badge name, the countdown and the claim count, so Twitch, YouTube and TikTok
// viewers know where to claim. It slides in when a drop opens, shows the winner's handle for a draw, and slides out 10 s after the drop closed.
// Reduced motion: it fades. Data: the drop in obsFeed's view (the stream view's own feed, obs.ts); nothing else is read. Stream view colours only:
// gold, lime and gray (purple means clickable, and nothing here is). Feature CSS: live-drops.css (.obs-drop).
import { dropFuseHtml, setFuse, formatDropTime } from "../../../../shared/ui/drop.js";
import { escapeHtml as esc } from "../../../../shared/ui/dom.js";
import type { PubDrop } from "./model";
import site from "../../data/site.json";

const isUrl = (s: string | null) => !!s && /^(https?:)?\//.test(s);
const face = (d: PubDrop) => ({ art: isUrl(d.art) ? d.art! : "", emoji: isUrl(d.art) ? "" : d.art || "✦", rarity: d.rarity, name: d.name });
/** Where to claim: the site's own domain (site.json; the same domain as its email), plus /live. */
const host = site.emailDomain;

export function createDropCallout(el: HTMLElement) {
  let cur: PubDrop | null = null, key = "", closedSeen = 0, goneId = "", out = 0;
  let fullId = "", fullCloses = 0, full = 1;
  const fuseP = (d: PubDrop, now: number) => {
    if (!d.closesAt) return 1;
    const left = d.closesAt - now;
    if (d.id !== fullId) { fullId = d.id; fullCloses = d.closesAt; full = Math.max(left, 1); }
    else if (d.closesAt !== fullCloses) { full += d.closesAt - fullCloses; fullCloses = d.closesAt; }
    return Math.max(0, Math.min(1, left / full));
  };
  const line = (d: PubDrop, now: number) => {
    if (d.state === "closing") return "Last call";
    if (d.state === "drawing") return "Drawing…";
    if (d.state === "closed") return d.mode === "draw" ? (d.winners?.length ? `${d.winners.map((h) => `@${h}`).join(", ")} ${d.winners.length > 1 ? "win" : "wins"}` : "No entries") : "Closed";
    return d.closesAt ? formatDropTime(d.closesAt - now) : "Until the end";
  };
  function draw(now = Date.now()) {
    const d = cur;
    if (!d || goneId === d.id) { if (el.childElementCount) hide(); return; }
    const k = `${d.id}|${d.state}|${(d.winners || []).join()}`;
    const won = d.state === "closed" && d.mode === "draw" && !!d.winners?.length;
    if (k !== key) {
      key = k;
      const fz = d.state === "open" ? "open" : d.state === "closed" ? (won ? "won" : "closed") : "closing";
      const first = !el.querySelector(".obs-drop-call");
      el.innerHTML = `<div class="obs-drop-call${first ? " is-in" : ""}" data-state="${d.state}" role="status">${dropFuseHtml(face(d), { p: d.state === "open" ? fuseP(d, now) : won ? 1 : 0, state: fz })}`
        + `<div class="obs-drop-txt"><small>Live drop · claim at ${esc(host)}/live</small><b><span class="obs-drop-name">${esc(d.name)}</span> <span class="obs-drop-cd" data-cd></span> <span class="obs-drop-n" data-n></span></b></div></div>`;
      clearTimeout(out); out = 0;
    }
    const cd = el.querySelector("[data-cd]"), n = el.querySelector("[data-n]");
    const t = line(d, now); if (cd && cd.textContent !== t) cd.textContent = t;
    const c = `· ${(d.claims || 0).toLocaleString("en-US")}`; if (n && n.textContent !== c) n.textContent = c;
    const fz = el.querySelector<HTMLElement>(".bt-dropfuse"); if (fz && d.state === "open") setFuse(fz, fuseP(d, now));
    // 10 s after it closed (after the winner shows, for a draw), it slides out
    if (d.state === "closed") {
      if (!closedSeen) closedSeen = now;
      if (!out) out = window.setTimeout(() => { goneId = d.id; hide(); }, Math.max(0, 10000 - (now - closedSeen)));
    } else closedSeen = 0;
  }
  function hide() {
    const call = el.querySelector<HTMLElement>(".obs-drop-call");
    key = "";
    if (!call) { el.innerHTML = ""; return; }
    call.classList.remove("is-in"); call.classList.add("is-out");
    window.setTimeout(() => { if (call.isConnected && call.classList.contains("is-out")) el.innerHTML = ""; }, 600);
  }
  setInterval(() => { if (cur) draw(); }, 250);
  return {
    render(drop: PubDrop | null | undefined) {
      const d = drop && typeof drop.id === "string" ? drop : null;
      if (d && cur && d.id !== cur.id) { goneId = ""; closedSeen = 0; }
      cur = d;
      draw();
    },
  };
}
