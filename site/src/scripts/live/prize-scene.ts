// The Prize Box scene on the stream view /live/obs (docs/specs/prize-box.md §2 "Prize stand", §5 "/live/obs"; mockup prize-box-wheel-and-draw.html section 2):
// the F2 wheel on the Prize Box (shared/ui/prizestand.js, motion always on: it's video) and the panel beside it (wide) or under it (tall): PRIZE BOX,
// the round chip, the contest, the prize, then the group list or the name legend, the I'm here ring, and the winner reveal with the box burst.
// The panel is gold, lime and gray only; the wheel's colours are decorative. The wheel plays the server's decided spins from their startAt, so it
// matches every phone; one tick per peg (sound ON here: the browser source's audio goes to the stream, "Control audio via OBS" in Streamlabs).
// Fed by obs.ts from obsFeed's view.prizeDraw (the same pointer as public/live: handles only). While a draw is on, the regular scene is hidden.
import { prizeStandHtml, standBurst, standReset } from "../../../../shared/ui/prizestand.js";
import { wheelPlay, wheelShow, wheelReset } from "../../../../shared/ui/wheel.js";
import { wheelSound } from "../../../../shared/ui/wheel-sound.js";
import { stampHtml } from "../../../../shared/ui/stamp.js";
import { escapeHtml as esc } from "../../../../shared/ui/dom.js";
import { PRIZE_TICK_SRC } from "../../lib/prize-sound";
import type { PubPrizeDraw } from "./model";
import { isSpinning, landsAt, secondsLeft } from "./prize-watch";

const GIFT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="8" width="18" height="4" rx="1"/><path d="M5 12v8h14v-8M12 8v12M12 8c-1.5-3-5-4-5.5-2S9 8 12 8zm0 0c1.5-3 5-4 5.5-2S15 8 12 8z"/></svg>';

export function createPrizeScene(el: HTMLElement) {
  const snd = wheelSound({ muted: false, src: PRIZE_TICK_SRC });
  snd.unlock();   // a browser source may play sound without a tap; if it can't, the wheel just turns silently
  let standKey = "", spinKey = "", burstFor = "", stop: () => void = () => {}, ticker = 0, cur: PubPrizeDraw | null = null, landTimer = 0;
  el.innerHTML = `<div class="pz-svs" data-pz-svs></div><div class="bt-sv-panel pz-svp" data-pz-svp></div>`;
  const svs = el.querySelector<HTMLElement>("[data-pz-svs]")!, svp = el.querySelector<HTMLElement>("[data-pz-svp]")!;

  const head = (d: PubPrizeDraw, chip: string) => `<div class="bt-sv-h"><span class="pz-sv-box">${GIFT}</span>PRIZE BOX<span class="pz-sv-chip">${esc(chip)}</span></div>`
    + `<div class="pz-sv-title">${esc(d.contestTitle || "Prize Box draw")}</div><div class="pz-sv-prize">Prize: <b>${esc(d.prizeTitle || "")}</b></div>`;
  const foot = '<div class="pz-sv-foot">Everyone checked in tonight is in the draw.<br><b>boomertanger.com/live</b></div>';
  const legend = (rows: { label: string; count?: number | null }[], win: number | null) => `<div class="pz-sv-legend${win != null ? " is-landed" : ""}">${rows.map((r, i) => `<div class="${i === win ? "is-win" : ""}"><i style="--c:var(--bt-wheel-${i + 1})"></i><span>${esc(r.label)}</span>${r.count != null ? `<em>${r.count}</em>` : ""}</div>`).join("")}</div>`;
  const roundChip = (d: PubPrizeDraw) => (d.phase === "won" ? "Winner" : d.rounds === 2 ? `Round ${Math.max(1, d.round)} of 2` : "The draw");

  function panel(d: PubPrizeDraw): string {
    const spinning = isSpinning(d);
    if (d.phase === "pool") {
      return head(d, roundChip(d)) + (d.rounds === 2 && d.groups ? `<div class="pz-sv-k">ROUND 1 PICKS THE GROUP</div>${legend(d.groups.map((g) => ({ label: g.label || "Spin again", count: g.count })), null)}`
        : `<div class="pz-sv-k">IN THE DRAW</div><div class="pz-sv-big">${(d.pool ? d.pool.inDraw : 0).toLocaleString("en-US")} members</div>`) + foot;
    }
    if (d.phase === "round1") {
      return head(d, roundChip(d)) + (spinning ? `<div class="pz-sv-spin">Spinning for the group…</div>${legend((d.groups || []).map((g) => ({ label: g.label || "Spin again", count: g.count })), null)}`
        : `<div class="pz-sv-k">THE GROUP</div><div class="pz-sv-big">${esc((d.groupPick && d.groupPick.label) || "")}</div><div class="pz-sv-line"><b>${(d.groupPick ? d.groupPick.count : 0)} members</b>. Round 2 puts up to 10 of them on the wheel.</div>`) + foot;
    }
    if (d.phase === "here") {
      if (spinning) return head(d, roundChip(d)) + `<div class="pz-sv-k">SPINNING FOR THE WINNER</div>${legend((d.labels || []).map((l) => ({ label: l || "Spin again" })), null)}` + foot;
      const s = secondsLeft(d);
      return head(d, roundChip(d)) + `<div class="pz-sv-here"><div class="bt-sv-ring" style="--ring:${d.hereSeconds ? s / d.hereSeconds : 0}"><span data-pz-sv-left>${s}</span></div><div><div class="pz-sv-big">@${esc((d.picked && d.picked.handle) || "")}</div><div class="pz-sv-line">Tap <b>I'm here</b> on boomertanger.com/live to claim it. If time runs out, the wheel spins again.</div></div></div>` + foot;
    }
    if (d.phase === "noSpin") return head(d, roundChip(d)) + `<div class="pz-sv-big">Not enough to spin</div><div class="pz-sv-line">Fewer than two members are left for this draw.</div>` + foot;
    return head(d, "Winner") + `<div class="pz-sv-win">${stampHtml({ label: "Winner", tone: "lime" })}<div><div class="pz-sv-big">@${esc((d.winner && d.winner.handle) || "")}</div><div class="pz-sv-line">wins <b>${esc(d.prizeTitle || "the prize")}</b> and the Prize Box Winner badge.</div></div></div><div class="pz-sv-foot">Congrats! See every winner at<br><b>boomertanger.com/prizes</b></div>`;
  }

  function stand(d: PubPrizeDraw) {
    const k = JSON.stringify([d.drawId, d.round, d.respins, d.labels]);
    if (k !== standKey) {
      standKey = k; stop(); spinKey = "";
      svs.innerHTML = prizeStandHtml({ labels: d.labels || (d.groups ? d.groups.map((g) => g.label) : []), motion: true, label: "The Prize Wheel" });
    }
    const sk = JSON.stringify([k, d.spins.map((s) => s.startAt)]);
    if (sk !== spinKey) {
      spinKey = sk; stop();
      const last = d.spins.length ? d.spins[d.spins.length - 1] : null;
      if (!last) wheelReset(svs);
      else if (Date.now() >= (landsAt(d) || 0)) wheelShow(svs, { pickIndex: last.pickIndex, offset: last.offset });
      else stop = wheelPlay(svs, d.spins, { motion: true, onTick: () => snd.tick() });
    }
    // the winner: the box shakes, the lid blows off, gold light, confetti, the card rises (once per draw)
    if (d.phase === "won" && burstFor !== d.drawId) {
      burstFor = d.drawId;
      void standBurst(svs, { title: `@${(d.winner && d.winner.handle) || ""}`, line: `wins ${d.prizeTitle || "the prize"}`, motion: true, confetti: 260 });
    } else if (d.phase !== "won" && burstFor) { burstFor = ""; standReset(svs); }
  }

  function render(d: PubPrizeDraw | null) {
    cur = d;
    clearTimeout(landTimer);
    if (!d) { el.hidden = true; stop(); standKey = ""; spinKey = ""; burstFor = ""; svs.innerHTML = ""; svp.innerHTML = ""; clearInterval(ticker); ticker = 0; return; }
    el.hidden = false;
    stand(d);
    const html = panel(d);
    if (svp.dataset.k !== html) { svp.dataset.k = html; svp.innerHTML = html; }
    if (isSpinning(d)) { const end = landsAt(d); if (end) landTimer = window.setTimeout(() => render(cur), Math.max(50, end - Date.now() + 60)); }
    if (!ticker) ticker = window.setInterval(() => {
      const x = cur; if (!x || x.phase !== "here" || isSpinning(x)) return;
      const s = secondsLeft(x), left = svp.querySelector("[data-pz-sv-left]"), ring = svp.querySelector<HTMLElement>(".bt-sv-ring");
      if (left && left.textContent !== String(s)) left.textContent = String(s);
      if (ring && x.hereSeconds) ring.style.setProperty("--ring", String(s / x.hereSeconds));
    }, 250);
  }
  return { render };
}
