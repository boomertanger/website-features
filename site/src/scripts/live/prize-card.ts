// The /live Prize Box card (docs/specs/prize-box.md §5 "/live"; mockup prize-box-wheel-and-draw.html section 2, the member's phone): in the Bridge under the
// stream, the same states as the site-wide banner (prize-watch.ts decides them for both): pool → round 1 → your slice → "It landed on you!" with I'm here →
// You won with Claim my prize. A small Prize Wheel plays the server's decided spins in step with the stream (wheelPlay), muted with a sound button.
// A .bt-cr-panel, so it follows the house look. Mounted by pub-bridge.ts into [data-p="prize"]; it owns that element and hides it while there is no draw.
// Feature CSS: styles/prize-box-live.css (.pz-).
import { onAuth } from "../../lib/auth";
import { crPanelHtml } from "../../../../shared/ui/cr-panel.js";
import { prizeWheelHtml, wheelPlay, wheelShow, wheelReset } from "../../../../shared/ui/wheel.js";
import { wheelSound, soundButtonHtml, bindSoundButton } from "../../../../shared/ui/wheel-sound.js";
import { stampHtml } from "../../../../shared/ui/stamp.js";
import { esc } from "./ui";
import { isMember } from "./pub-ui";
import { PRIZE_TICK_SRC } from "../../lib/prize-sound";
import type { PubApi } from "./pub-data";
import type { PubPrizeDraw } from "./model";
import { bladeColor, bladeName, landsAt, prizeIo, secondsLeft, watchPrize, type PrizeView } from "./prize-watch";

const slice = (v: PrizeView) => (v.me && v.me.blade != null ? `<span class="pz-myslice"><i style="--c:${bladeColor(v.me.blade)}"></i>Your slice: ${esc(bladeName(v.me.blade))}</span>` : "");
function body(v: PrizeView): string {
  const d = v.draw, n = (d.pool ? d.pool.inDraw : 0).toLocaleString("en-US"), prize = `<b>${esc(d.prizeTitle || "the prize")}</b>`;
  const group = esc((d.groupPick && d.groupPick.label) || "a group");
  const who = d.picked ? `@${esc(d.picked.handle)}` : "someone";
  switch (v.kind) {
    case "visitor": return `<h3>${esc(d.contestTitle || "Prize Box draw")}</h3><p>Everyone checked in to the stream is in the draw. Join free to be in the next one.</p><button type="button" class="bt-btn bt-btn--primary" data-signin="join" data-signin-title="Join to enter draws">Join free</button>`;
    case "signup": return `<h3>${esc(d.contestTitle || "Prize Box draw")}</h3><p>Finish joining to be in the next draw.</p><button type="button" class="bt-btn bt-btn--primary" data-signin="signup">Finish joining</button>`;
    case "notIn": return `<h3>Not in this one</h3><p>${esc(d.contestTitle || "This draw")} is for members checked in tonight. Check in at the next beat to be in the next draw.</p>`;
    case "pool": return `<h3>${esc(d.contestTitle || "Prize Box draw")}</h3><p>You're one of <b>${n} members</b> in the draw for ${prize}.</p><p class="pz-small">Everyone checked in tonight is in. Watch the stream for the spin.</p>`;
    case "round1": return `<h3>Round 1 is spinning</h3><p>It picks which group goes on to round 2.</p>`;
    case "still": return `<h3>Still in!</h3><p>Round 1 picked <b>${group}</b>, and you're in it: one of ${(d.groupPick ? d.groupPick.count : 0).toLocaleString("en-US")}.</p>`;
    case "out": return `<h3>Not this time</h3><p>Round 1 picked <b>${group}</b>. Every draw is a fresh pick.</p>`;
    case "wheel": case "spinning": return `<h3>You're on the wheel!</h3>${slice(v)}<p>${v.spinning ? "Round 2 is spinning for the winner." : "It's slowing down…"}</p>`;
    case "offWheel": return `<h3>Round 2 is spinning</h3><p>You're not on the wheel this time. Every spin is a fresh pick.</p>`;
    case "picked": return `<h3>It landed on you!</h3><div class="pz-count" data-pz-left>0:${String(secondsLeft(d)).padStart(2, "0")}</div><button type="button" class="bt-btn bt-btn--primary bt-btn--block pz-here-btn" data-pz-here data-pulse="im-here"${v.busy ? " disabled" : ""}>${v.busy ? "Sending…" : "I'm here"}</button><p class="pz-small">Tap before the time runs out, or the wheel spins again.</p>`;
    case "waiting": return `<h3>It landed on ${who}</h3><p>They have <b data-pz-left-s>${secondsLeft(d)}</b> seconds to tap I'm here. If time runs out, the wheel spins again.</p>`;
    case "won": return `${stampHtml({ label: "Winner", size: "sm", tone: "lime" })}<h3>You won!</h3><p>${prize}, plus the Prize Box Winner badge.</p><a class="bt-btn bt-btn--primary bt-btn--block" href="/prizes/mine" data-pulse="claim-prize">Claim my prize</a><p class="pz-small">You have 7 days to claim it.</p>`;
    case "wonOther": return `<h3>@${esc((d.winner && d.winner.handle) || "")} won!</h3><p>${prize} goes to @${esc((d.winner && d.winner.handle) || "")}. See every winner on <a href="/prizes">the Prize Box</a>.</p>`;
    case "noSpin": return `<h3>Not enough to spin</h3><p>Fewer than two members are left for this draw.</p>`;
    default: return "";
  }
}
const showsWheel = (v: PrizeView) => ["round1", "still", "out", "wheel", "spinning", "offWheel", "picked", "waiting", "won", "wonOther"].includes(v.kind) && !!v.draw.labels;

export interface PrizeCard { stop(): void }
export function mountPrizeCard(el: HTMLElement, api: PubApi): PrizeCard {
  let w: ReturnType<typeof watchPrize> | null = null, dead = false, timer = 0, stopSpin: () => void = () => {}, wheelKey = "", playedKey = "";
  const snd = wheelSound({ muted: true, src: PRIZE_TICK_SRC });
  el.hidden = true;
  const ensureShell = () => {
    if (el.querySelector("[data-pz-body]")) return;
    el.innerHTML = crPanelHtml({ id: "lp-prize", cls: "lp-prize", title: "Prize Box", icon: "gift", bodyHtml: `<div class="pz-card"><div class="pz-card-wheel" data-pz-wheel hidden></div><div class="pz-card-body" data-pz-body aria-live="polite"></div><div class="pz-card-sound">${soundButtonHtml({ muted: true })}</div></div>` });
    bindSoundButton(el.querySelector<HTMLButtonElement>("[data-wheel-sound]"), snd);
  };
  /** The mini wheel: drawn once per wheel (labels), played once per set of spins, so a redraw of the words never restarts it. */
  function wheel(d: PubPrizeDraw, on: boolean) {
    const host = el.querySelector<HTMLElement>("[data-pz-wheel]");
    if (!host) return;
    host.hidden = !on;
    if (!on) return;
    const k = JSON.stringify([d.drawId, d.round, d.respins, d.labels]);
    if (k !== wheelKey) { wheelKey = k; stopSpin(); host.innerHTML = prizeWheelHtml({ labels: d.labels || [], text: false, label: "The Prize Wheel" }); playedKey = ""; }
    const pk = JSON.stringify([k, d.spins.map((s) => s.startAt)]);
    if (pk === playedKey) return;
    playedKey = pk;
    if (!d.spins.length) { wheelReset(host); return; }
    const last = d.spins[d.spins.length - 1];
    if (Date.now() >= (landsAt(d) || 0)) { wheelShow(host, { pickIndex: last.pickIndex, offset: last.offset }); return; }
    stopSpin = wheelPlay(host, d.spins, { onTick: () => snd.tick() });
  }
  const draw = (v: PrizeView | null) => {
    if (!v) { el.hidden = true; el.innerHTML = ""; wheelKey = ""; stopSpin(); return; }
    el.hidden = false;
    ensureShell();
    el.querySelector<HTMLElement>(".pz-card")!.dataset.kind = v.kind;
    wheel(v.draw, showsWheel(v));
    const b = el.querySelector<HTMLElement>("[data-pz-body]")!;
    const html = body(v);
    if (b.dataset.k !== html) { b.dataset.k = html; b.innerHTML = html; }
  };
  void prizeIo().then((io) => {
    if (dead) return;
    w = watchPrize({ io, feed: (fn) => api.feed(fn), onAuthState: (fn) => onAuth(fn), member: isMember, onView: draw });
  });
  timer = window.setInterval(() => {
    const v = w?.view(); if (!v || el.hidden || document.hidden) return;
    const s = secondsLeft(v.draw);
    const big = el.querySelector("[data-pz-left]"); if (big) { const t = `0:${String(s).padStart(2, "0")}`; if (big.textContent !== t) big.textContent = t; }
    const small = el.querySelector("[data-pz-left-s]"); if (small && small.textContent !== String(s)) small.textContent = String(s);
  }, 250);
  el.addEventListener("click", (e) => { if ((e.target as HTMLElement).closest("[data-pz-here]")) w?.here(); });
  return { stop() { dead = true; clearInterval(timer); stopSpin(); w?.stop(); el.innerHTML = ""; } };
}
