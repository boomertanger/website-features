// The site-wide Prize Box banner (docs/specs/prize-box.md §5 "/live"; mockup prize-box-wheel-and-draw.html section 2, the member's phone): the kit's
// .bt-live-banner[data-kind="prize"] in the banner slot under the header (banner-host.ts), stacking after the check-in and drop strips. Gold, like a drop.
// Never on /live (it has the Prize Box card), /live/control or /live/obs. The states come from prize-watch.ts, shared with the /live card. "It landed on
// you" carries the I'm here button and the countdown, so a member reading another page can still claim the win. Hidden with ✕ for the rest of the draw.
import { onAuth } from "../../lib/auth";
import { onLive } from "../../lib/live";
import { isMember } from "./pub-ui";
import { esc, reduced } from "./ui";
import { putBanner, bannerOf } from "./banner-host";
import { bladeColor, bladeName, prizeIo, secondsLeft, watchPrize, type PrizeView } from "./prize-watch";
import type { PubLive } from "./model";

const HIDE_KEY = "bt.prize.hidden";
const GIFT = '<svg class="bt-live-banner-gift" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="8" width="18" height="4" rx="1"/><path d="M5 12v8h14v-8M12 8v12M12 8c-1.5-3-5-4-5.5-2S9 8 12 8zm0 0c1.5-3 5-4 5.5-2S15 8 12 8z"/></svg>';
const hiddenId = () => { try { return sessionStorage.getItem(HIDE_KEY) || ""; } catch { return ""; } };

function text(v: PrizeView): string {
  const d = v.draw, n = d.pool ? d.pool.inDraw : 0, who = d.picked ? `@${esc(d.picked.handle)}` : "someone";
  const slice = v.me && v.me.blade != null ? ` <span class="bt-live-banner-slice"><i style="--c:${bladeColor(v.me.blade)}"></i>Your slice: ${esc(bladeName(v.me.blade))}</span>` : "";
  const t: Record<string, string> = {
    visitor: `<b>Prize Box draw</b> on stream now. Join free to be in the next one.`,
    signup: `<b>Prize Box draw</b> on stream now. Finish joining to be in the next one.`,
    notIn: `<b>Prize Box draw</b> on stream now. Check in at the next beat to be in the next one.`,
    pool: `<b>Prize Box draw</b> starting. You're in it, one of ${n.toLocaleString("en-US")}.`,
    round1: `<b>Prize Box:</b> round 1 is spinning.`,
    still: `<b>Prize Box:</b> still in! Round 1 picked ${esc((d.groupPick && d.groupPick.label) || "a group")}.`,
    out: `<b>Prize Box:</b> round 1 picked ${esc((d.groupPick && d.groupPick.label) || "another group")}. Not you this time.`,
    wheel: `<b>Prize Box:</b> you're on the wheel!${slice}`,
    offWheel: `<b>Prize Box:</b> round 2 is spinning. You're not on the wheel this time.`,
    spinning: `<b>Prize Box:</b> round 2 is spinning.${slice}`,
    picked: `<b>It landed on you.</b> Tap I'm here.`,
    waiting: `<b>Prize Box:</b> it landed on ${who}.`,
    won: `<b>You won</b> ${esc(d.contestTitle || "the Prize Box draw")}!`,
    wonOther: `<b>Prize Box:</b> @${esc((d.winner && d.winner.handle) || "")} won ${esc(d.contestTitle || "the draw")}.`,
    noSpin: `<b>Prize Box:</b> not enough members left to spin.`,
  };
  return t[v.kind] || t.pool;
}
function inner(v: PrizeView): string {
  const btn = v.kind === "picked" ? `<span class="bt-live-banner-cd"><b data-pz-left>${secondsLeft(v.draw)}</b> s</span><button type="button" class="bt-btn bt-btn--primary bt-btn--sm" data-pz-here data-pulse="im-here"${v.busy ? " disabled" : ""}>${v.busy ? "Sending…" : "I'm here"}</button>`
    : v.kind === "won" ? `<a class="bt-btn bt-btn--primary bt-btn--sm" href="/prizes/mine" data-pulse="claim-prize">Claim my prize</a>`
    : v.kind === "visitor" ? `<button type="button" class="bt-btn bt-btn--primary bt-btn--sm" data-signin="join" data-signin-title="Join to enter draws">Join free</button>`
    : v.kind === "signup" ? `<button type="button" class="bt-btn bt-btn--primary bt-btn--sm" data-signin="signup">Finish joining</button>`
    : `<a class="bt-btn bt-btn--secondary bt-btn--sm" href="/live">Watch</a>`;
  return `${GIFT}<span class="bt-live-banner-txt">${text(v)}</span><span class="bt-live-banner-sp"></span>${btn}<button type="button" class="bt-live-banner-x" data-pz-x aria-label="Hide the Prize Box banner">✕</button>`;
}
const stateOf = (v: PrizeView) => (v.kind === "picked" ? "picked" : v.kind === "won" ? "won" : ["out", "offWheel", "notIn", "noSpin", "wonOther"].includes(v.kind) ? "quiet" : v.spinning ? "spinning" : "on");

let started = false;
export async function startPrizeBanner() {
  if (started) return;
  started = true;
  const path = location.pathname.replace(/\/+$/, "");
  if (path === "/live" || path.startsWith("/live/control") || path.startsWith("/live/obs")) return;   // /live has the card; the control and stream view pages none
  const io = await prizeIo();
  let el: HTMLElement | null = null, gone = "";
  const draw = (v: PrizeView | null) => {
    if (!v || hiddenId() === v.draw.drawId || gone === v.draw.drawId) { if (el) { putBanner("prize", null); el = null; } return; }
    if (!el || !el.isConnected || bannerOf("prize") !== el) {
      el = document.createElement("div");
      el.className = "bt-live-banner";
      el.dataset.kind = "prize";
      el.setAttribute("role", "status");
    }
    el.dataset.state = stateOf(v);
    el.dataset.drawId = v.draw.drawId;
    el.innerHTML = inner(v);
    putBanner("prize", el);
    if (v.kind === "won" && !reduced()) el.animate([{ transform: "scale(1)" }, { transform: "scale(1.02)" }, { transform: "scale(1)" }], { duration: 500 });
  };
  const w = watchPrize({
    io,
    feed: (fn) => (io.preview ? (fn({ state: "live" } as PubLive), () => {}) : onLive(fn)),
    onAuthState: (fn) => onAuth(fn), member: isMember, onView: draw,
  });
  setInterval(() => {   // the I'm here countdown, without a redraw
    const v = w.view(); if (!v || !el || document.hidden || v.kind !== "picked") return;
    const t = el.querySelector("[data-pz-left]"); const s = String(secondsLeft(v.draw)); if (t && t.textContent !== s) t.textContent = s;
  }, 250);
  document.addEventListener("click", (e) => {
    const t = (e.target as HTMLElement).closest<HTMLElement>("[data-pz-here], [data-pz-x]");
    if (!t || !el || !el.contains(t)) return;
    if (t.hasAttribute("data-pz-x")) { try { sessionStorage.setItem(HIDE_KEY, el.dataset.drawId || ""); } catch { /* storage off: hidden for this page only */ } gone = el.dataset.drawId || ""; putBanner("prize", null); el = null; return; }
    w.here();
  });
}
