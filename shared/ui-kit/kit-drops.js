// shared/ui-kit/kit-drops.js — the "Live drops" section of the UI Kit page (/dev/ui-kit): the drop banner (.bt-live-banner[data-kind="drop"])
// in all 11 states, the stacked pair (check-in + drop), the same states in a phone-width (390 px) container, the fuse (.bt-dropfuse) at three
// fills and in each state with a Flip button, and .bt-drop-timer normal and closing (docs/specs/live-drops.md §5, §7; shared/ui/drop.js).
// Static: no live data, no writes. ui-kit.js appends dropsKitHtml() and calls initDropsKit(mount).
import { dropFuseHtml, setFuse, formatDropTime } from "../ui/drop.js";

// the five real drop badges (functions/data/trophy-room-badges.json); none has commissioned art yet, so the emoji shows
const B = {
  jump: { name: "Jump-Scare Witness", emoji: "😱", rarity: 1 },
  glitch: { name: "The Glitchwitness", emoji: "💥", rarity: 2 },
  chosen: { name: "The Chosen One", emoji: "🎲", rarity: 4 },
  boss: { name: "Boss Fight Believer", emoji: "⚔️", rarity: 2 },
  ember: { name: "Anniversary Ember", emoji: "🕯", rarity: 4 },
};

const cd = (t) => `<span class="bt-live-banner-cd"><b data-cd>${t}</b><span class="bt-live-banner-wide"> left</span></span>`;
const btn = (label, cls = "bt-btn--primary") => `<button type="button" class="bt-btn ${cls} bt-btn--sm">${label}</button>`;
const banner = (state, fuse, txt, { cdHtml = "", button = "" } = {}) =>
  `<div class="bt-live-banner" data-kind="drop" data-state="${state}" role="status">${fuse}<span class="bt-live-banner-txt">${txt}</span>${cdHtml}<span class="bt-live-banner-sp"></span>${button}<button type="button" class="bt-live-banner-x" aria-label="Hide">✕</button></div>`;

/** The 11 states, in the order the spec lists them. */
const STATES = [
  ["open", () => banner("open", dropFuseHtml(B.jump, { p: 0.9 }), `<span class="bt-live-banner-k">Live drop</span> <b>Jump-Scare Witness</b> <span class="bt-live-banner-n bt-live-banner-wide">· 14 claimed</span>`, { cdHtml: cd("2:41"), button: btn("Claim") })],
  ["closing", () => banner("closing", dropFuseHtml(B.jump, { p: 0, state: "closing" }), `<span class="bt-live-banner-k">Last call</span> <b>Jump-Scare Witness</b> <span class="bt-live-banner-wide">· claims still count</span>`, { button: btn("Claim") })],
  ["drawing", () => banner("drawing", dropFuseHtml(B.chosen, { p: 0, state: "closing" }), `<span class="bt-live-banner-k">Drawing…</span> <b>The Chosen One</b> <span class="bt-live-banner-n bt-live-banner-wide">· 38 entries</span>`)],
  ["claimed", () => banner("claimed", dropFuseHtml(B.glitch, { p: 1, state: "claimed", flip: true }), `<span class="bt-live-banner-ok" aria-hidden="true">✓</span> <span class="bt-live-banner-k">It's yours</span> <b>The Glitchwitness</b> <span class="bt-live-banner-wide">· added to your Trophy Room</span>`)],
  ["already", () => banner("already", dropFuseHtml(B.glitch, { p: 1, state: "already" }), `<span class="bt-live-banner-k">Already yours</span> <b>The Glitchwitness</b>`, { cdHtml: cd("1:12") })],
  ["entered", () => banner("entered", dropFuseHtml(B.chosen, { p: 0.7 }), `<span class="bt-live-banner-k">You're in the draw</span> <b>The Chosen One</b> <span class="bt-live-banner-n bt-live-banner-wide">· 38 entries</span>`, { cdHtml: cd("3:05") })],
  ["won", () => banner("won", dropFuseHtml(B.chosen, { p: 1, state: "won", flip: true }), `<span class="bt-live-banner-ok" aria-hidden="true">✓</span> <span class="bt-live-banner-k">You're The Chosen One</span> <span class="bt-live-banner-wide">· picked from 38 entries</span>`)],
  ["lost", () => banner("lost", dropFuseHtml(B.chosen, { p: 0, state: "lost" }), `<span class="bt-live-banner-k">Not this time</span> <b>@nightowl</b> was chosen`)],
  ["closed", () => banner("closed", dropFuseHtml(B.boss, { p: 0, state: "closed" }), `<span class="bt-live-banner-k">Drop closed</span> <b>Boss Fight Believer</b> <span class="bt-live-banner-n bt-live-banner-wide">· 52 claimed</span>`)],
  ["visitor", () => banner("visitor", dropFuseHtml(B.ember, { p: 0.9 }), `<span class="bt-live-banner-k">Live drop</span> <b>Anniversary Ember</b> <span class="bt-live-banner-n bt-live-banner-wide">· 120 claimed</span>`, { cdHtml: `<span class="bt-live-banner-cd bt-live-banner-wide">until the stream ends</span>`, button: btn("Join free to claim") })],
  ["dropper", () => banner("dropper", dropFuseHtml(B.boss, { p: 0.9 }), `<span class="bt-live-banner-k">Your drop</span> <b>Boss Fight Believer</b> <span class="bt-live-banner-n bt-live-banner-wide">· 9 claimed</span>`, { cdHtml: cd("4:30") })],
];

const checkin = `<div class="bt-live-banner" data-state="open" role="status"><span class="bt-live-banner-dot"></span><span><b>Check-in is open</b> · Break 1</span><span class="bt-live-banner-sep">·</span><span class="bt-live-banner-cd"><b data-cd>4:12</b> left</span><span class="bt-live-banner-sp"></span>${btn("Check in")}<button type="button" class="bt-live-banner-x" aria-label="Hide">✕</button></div>`;

const list = () => STATES.map(([st, html]) => `<div class="kit-dr-row"><p class="bt-meta">${st}</p><div class="kit-dr-frame">${html()}</div></div>`).join("");
const FUSE_STATES = ["open", "closing", "closed", "lost", "claimed", "won"];

export function dropsKitHtml() {
  return `
  <section class="kit-section" id="kit-drops">
    <h2 class="kit-h">Live drops (.bt-live-banner[data-kind="drop"], .bt-dropfuse, .bt-drop-timer)</h2>
    <p class="kit-p">A drop is a limited badge the owner or the live Captain opens during a stream (<span class="kit-code">docs/specs/live-drops.md</span>). Its strip sits in the check-in banner's slot and stacks under it. Gold is the drop's tint; Claim is purple. <span class="kit-code">.bt-live-banner-txt</span> holds the words (one line with an ellipsis on phones), <span class="kit-code">.bt-live-banner-wide</span> hides at 640 px, and the "Live drop" label hides on phones for open, visitor and dropper ("Last call" always shows). Markup helpers: <span class="kit-code">shared/ui/drop.js</span> (dropFuseHtml, setFuse, formatDropTime). Reduced motion stops the spin, blink and flip.</p>
    <h3 class="kit-sub">The 11 states</h3>
    <div class="kit-dr-list">${list()}</div>
    <h3 class="kit-sub">The stacked pair (check-in + drop)</h3>
    <div class="kit-dr-frame">${checkin}${STATES[0][1]()}</div>
    <h3 class="kit-sub">Phone width (390 px container)</h3>
    <div class="kit-dr-phone"><div class="kit-dr-frame">${checkin}${STATES.map(([, html]) => html()).join("")}</div></div>
    <h3 class="kit-sub">The fuse (.bt-dropfuse)</h3>
    <div class="kit-dr-fuses">
      ${[1, 0.6, 0.2].map((p) => `<figure class="kit-dr-fig">${dropFuseHtml(B.jump, { p, size: 56 })}<figcaption class="bt-meta">--p ${p}</figcaption></figure>`).join("")}
      ${FUSE_STATES.map((s) => `<figure class="kit-dr-fig">${dropFuseHtml(B.chosen, { p: s === "open" ? 0.6 : 1, state: s, size: 56 })}<figcaption class="bt-meta">${s}</figcaption></figure>`).join("")}
      <figure class="kit-dr-fig" data-kit-dr-flip>${dropFuseHtml(B.glitch, { p: 1, state: "claimed", size: 56 })}<figcaption><button type="button" class="bt-btn bt-btn--secondary bt-btn--sm">Flip</button></figcaption></figure>
    </div>
    <p class="kit-p">The fuse drains with the clock: <span class="bt-meta" data-kit-dr-live-t></span></p>
    <div class="kit-dr-fuses" data-kit-dr-live>${dropFuseHtml(B.ember, { p: 1, size: 56 })}</div>
    <h3 class="kit-sub">The timer (.bt-drop-timer)</h3>
    <div class="kit-dr-timers">
      <div class="bt-drop-timer"><span>${formatDropTime(161000)}</span><small>left to claim</small></div>
      <div class="bt-drop-timer" data-state="closing"><span>Last call</span><small>claims still count</small></div>
    </div>
  </section>`;
}

export function initDropsKit(mount) {
  const flip = mount.querySelector("[data-kit-dr-flip]");
  if (flip) flip.querySelector("button").addEventListener("click", () => {
    const f = flip.querySelector(".bt-dropfuse");
    f.classList.remove("is-flip"); void f.offsetWidth; f.classList.add("is-flip");
  });
  // a 20-second demo fuse that loops, to show setFuse and formatDropTime moving together
  const live = mount.querySelector("[data-kit-dr-live] .bt-dropfuse"), t = mount.querySelector("[data-kit-dr-live-t]");
  if (live && t) {
    const SPAN = 20000; let start = performance.now();
    const tick = () => {
      if (!live.isConnected) return;
      let left = SPAN - (performance.now() - start);
      if (left <= 0) { start = performance.now(); left = SPAN; }
      setFuse(live, left / SPAN); t.textContent = formatDropTime(left);
      setTimeout(tick, 250);
    };
    tick();
  }
}
