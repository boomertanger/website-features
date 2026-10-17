// shared/ui-kit/kit-prize-box.js — the "Prize Box pieces" section of the UI Kit page (/dev/ui-kit): the F2 Prize Wheel
// (.bt-wheel--prize), the prize stand (.bt-prizestand), the you-won card and the PRIZE BOX wordmark (PB_ICON) in every state
// (docs/specs/prize-box.md §2, §9; design-system.md §8aj). Sample names only. "Spin" replays a server-style spin
// ({ pickIndex, offset, spins, durationMs, startAt }); "Join late" starts the same spin 5 s in, the way a late viewer sees it.
// ui-kit.js appends prizeBoxKitHtml() and calls initPrizeBoxKit(mount).
import { prizeWheelHtml, wheelSpin, wheelReset } from "../ui/wheel.js";
import { prizeStandHtml, standBurst, standReset } from "../ui/prizestand.js";
import { wheelSound, soundButtonHtml, bindSoundButton } from "../ui/wheel-sound.js";
import { pbWordmarkHtml } from "../ui/prize-box.js";
import { initPowerWordmarks } from "../ui/wordmark.js";

const NAMES = ["@cryptkeeper", "@nightowl", "@ghostlight", "@hexqueen", "@mothman", "@screamteam", "@gravedigger", "@lanternjack", "@pumpkinrot", "@staticghost"];
const SIX = NAMES.map((n, i) => (i < 6 ? n : null));
const GROUPS = ["Everyone", "Night Shift top 50", "Every beat tonight", "Tap the Splat badge", "Stream streak 3+", "Everyone", "First stream here", "Night Shift top 10", "Beat the Boss badge", "Every beat tonight"];
const SAMPLE = () => ({ pickIndex: Math.floor(Math.random() * 10), offset: 0.2 + Math.random() * 0.6, spins: 5 + Math.round(Math.random()), durationMs: 7200 + Math.round(Math.random() * 1200) });

export function prizeBoxKitHtml() {
  const cell = (label, html) => `<div class="kit-hs-cell"><p class="kit-sub">${label}</p>${html}</div>`;
  return `
  <section class="kit-section" id="kit-prize-box">
    <h2 class="kit-h">Prize Box pieces (.bt-wheel--prize, .bt-prizestand, PB_ICON)</h2>
    <p class="kit-p">The Prize Wheel is F2 Gentle fan (<span class="kit-code">shared/ui/wheel.js</span>: prizeWheelHtml, wheelSpin with <span class="kit-code">{ pickIndex, offset, spins, durationMs, startAt, onTick }</span>, wheelShow, wheelReset). The server decides the spin before anything moves, so every viewer turns the same wheel from <span class="kit-code">startAt</span>, and a late joiner lands in the middle of it or on the result. Blade colours are the decorative <span class="kit-code">--bt-wheel-1</span> … <span class="kit-code">10</span>, never a status. One tick per peg (<span class="kit-code">shared/ui/wheel-sound.js</span>): muted on the site with a sound button, on in the stream view. The stand (<span class="kit-code">shared/ui/prizestand.js</span>) is the wheel on its post into the Prize Box: shake, lid off, gold beam, confetti, winner card. Reduced motion: no spin, shake or confetti; the result appears.</p>
    <div class="kit-hs-grid kit-hs-grid--wheel">
      ${cell("Wheel: idle (ten names)", prizeWheelHtml({ labels: NAMES }))}
      ${cell(`Wheel: spinning <button type="button" class="bt-btn bt-btn--secondary bt-btn--sm" data-kit-pb-spin>Spin</button><button type="button" class="bt-btn bt-btn--ghost bt-btn--sm" data-kit-pb-late>Join late</button>${soundButtonHtml()}`, `<div data-kit-pb-wheel>${prizeWheelHtml({ labels: NAMES })}</div><p class="kit-p" data-kit-pb-res aria-live="polite">Press Spin.</p>`)}
      ${cell("Wheel: landed (blade 2)", prizeWheelHtml({ labels: NAMES, landed: 1, offset: 0.4 }))}
      ${cell("Wheel: empty blades (six names; the rest say Spin again)", prizeWheelHtml({ labels: SIX }))}
      ${cell("Wheel: round 1 groups", prizeWheelHtml({ labels: GROUPS }))}
      ${cell("Wheel: plain (text: false, for cards)", `<div style="max-width:160px">${prizeWheelHtml({ text: false })}</div>`)}
    </div>
    <div class="kit-hs-grid">
      ${cell("Prize stand: idle", prizeStandHtml({ labels: NAMES }))}
      ${cell(`Prize stand: burst <button type="button" class="bt-btn bt-btn--secondary bt-btn--sm" data-kit-pb-burst>Spin and burst</button><button type="button" class="bt-btn bt-btn--ghost bt-btn--sm" data-kit-pb-reset>Reset</button>`, `<div data-kit-pb-stand>${prizeStandHtml({ labels: NAMES })}</div>`)}
      ${cell("You won: the lime It's you! card", `<div data-kit-pb-me>${prizeStandHtml({ labels: NAMES, landed: 5, offset: 0.5 })}</div>`)}
      ${cell("Winner card (someone else)", `<div data-kit-pb-other>${prizeStandHtml({ labels: NAMES, landed: 3, offset: 0.6 })}</div>`)}
    </div>
    <h3 class="kit-sub">.bt-live-banner[data-kind="prize"]: the site-wide draw strip (scripts/live/prize-banner.ts), states on, spinning, picked, won, quiet</h3>
    <div style="display:grid;gap:8px;grid-template-columns:minmax(0,1fr)">
      ${[["on", "<b>Prize Box draw</b> starting. You're in it, one of 47.", '<a class="bt-btn bt-btn--secondary bt-btn--sm" href="#">Watch</a>'],
        ["spinning", '<b>Prize Box:</b> round 2 is spinning. <span class="bt-live-banner-slice"><i style="--c:var(--bt-wheel-6)"></i>Your slice: yellow</span>', '<a class="bt-btn bt-btn--secondary bt-btn--sm" href="#">Watch</a>'],
        ["picked", "<b>It landed on you.</b> Tap I'm here.", '<span class="bt-live-banner-cd"><b>52</b> s</span><button type="button" class="bt-btn bt-btn--primary bt-btn--sm">I\'m here</button>'],
        ["won", "<b>You won</b> Break Wheel #1 (sample)!", '<a class="bt-btn bt-btn--primary bt-btn--sm" href="#">Claim my prize</a>'],
        ["quiet", "<b>Prize Box:</b> round 1 picked Every beat tonight. Not you this time.", '<a class="bt-btn bt-btn--secondary bt-btn--sm" href="#">Watch</a>']]
        .map(([st, t, b]) => `<div class="bt-live-banner" data-kind="prize" data-state="${st}" style="animation:none"><svg class="bt-live-banner-gift" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="8" width="18" height="4" rx="1"/><path d="M5 12v8h14v-8M12 8v12M12 8c-1.5-3-5-4-5.5-2S9 8 12 8zm0 0c1.5-3 5-4 5.5-2S15 8 12 8z"/></svg><span class="bt-live-banner-txt">${t}</span><span class="bt-live-banner-sp"></span>${b}<button type="button" class="bt-live-banner-x" aria-label="Hide">✕</button></div>`).join("")}
    </div>
    <h3 class="kit-sub">The PRIZE BOX wordmark (I2): at rest, and lit (.is-lit; hover or focus does the same; touch screens play it once on scroll-in)</h3>
    <div style="display:flex;flex-wrap:wrap;gap:32px;align-items:center;padding:8px 0">
      ${pbWordmarkHtml()}
      ${pbWordmarkHtml().replace('class="bt-wordmark bt-wordmark--power"', 'class="bt-wordmark bt-wordmark--power is-lit" data-kit-pb-lit')}
      <button type="button" class="bt-btn bt-btn--ghost bt-btn--sm" data-kit-pb-relight>Replay the lit one</button>
    </div>
  </section>`;
}

export function initPrizeBoxKit(mount) {
  const box = mount.querySelector("#kit-prize-box");
  if (!box) return;
  initPowerWordmarks(box);
  const snd = wheelSound({ muted: true });
  bindSoundButton(box.querySelector("[data-wheel-sound]"), snd);
  standBurst(box.querySelector("[data-kit-pb-me]"), { title: "It's you!", line: "@screamteam wins the draw", note: "On stream: tap I'm here within 60 seconds", me: true, confetti: 0 });
  standBurst(box.querySelector("[data-kit-pb-other]"), { title: "@hexqueen", line: "wins this spin", note: "Not you this time. Every spin is a fresh pick.", confetti: 0 });
  let stop = () => {}, stopStand = () => {};
  const res = box.querySelector("[data-kit-pb-res]");
  const spin = (late) => {
    stop();
    const host = box.querySelector("[data-kit-pb-wheel]");
    const s = SAMPLE();
    res.textContent = late ? "Joined 5 seconds into the spin…" : "Spinning…";
    stop = wheelSpin(host, { ...s, startAt: Date.now() - (late ? 5000 : 0), onTick: () => snd.tick(), onDone: (k) => { res.textContent = `Landed on ${NAMES[k]} (blade ${k + 1}, picked before the spin).`; } });
  };
  box.addEventListener("click", (e) => {
    const t = e.target;
    if (t.closest("[data-kit-pb-spin]")) spin(false);
    else if (t.closest("[data-kit-pb-late]")) spin(true);
    else if (t.closest("[data-kit-pb-burst]")) {
      stopStand();
      const host = box.querySelector("[data-kit-pb-stand]");
      standReset(host);
      wheelReset(host);
      const s = SAMPLE();
      stopStand = wheelSpin(host, { ...s, startAt: Date.now(), onTick: () => snd.tick(), onDone: (k) => standBurst(host, { title: NAMES[k], line: "wins this spin", note: "Sample draw: nothing is saved." }) });
    } else if (t.closest("[data-kit-pb-reset]")) {
      stopStand();
      const host = box.querySelector("[data-kit-pb-stand]");
      standReset(host);
      wheelReset(host);
    } else if (t.closest("[data-kit-pb-relight]")) {
      const w = box.querySelector("[data-kit-pb-lit]");
      w.classList.remove("is-lit"); void w.offsetWidth; w.classList.add("is-lit");
    }
  });
}
