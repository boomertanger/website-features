// Tap the Splat engine: state, clock, completion meter, penalties and input
// routing. Ported from the approved prototype (docs/design/mockups/tap-the-splat.html,
// "TAP THE SPLAT v2", initGame2); the rules are docs/specs/tap-the-splat.md.
// Rounds live in their own modules and get the shared game object `G`.
import { createSounds } from "./sounds.js";
import { mountPieces } from "./art.js";
import * as rounds from "./rounds.js";
import { flyBug } from "./bug.js";
import { explode, cutFuse } from "./bomb.js";
import { onChase } from "./chase.js";
import { showEnd, onFeedback, END_GRACE_MS } from "./end.js";
import { pickTool, dropTool, moveHeldTool, initPlug } from "./tools.js";
import { fmtTime } from "./format.js";

let GID = 0;


// Phases where the links behave as normal links (before the breaker is flipped,
// or when no game is running).
const LINKS_WORK = ["idle", "over", "p1", "bug", "chainwait", "post-chain", "breaker"];

export function createGame(root) {
  const gid = ++GID;
  mountPieces(root, gid);

  const S = { phase: "idle", pen: 0, prog: 0, t0: 0, got: new Set(), timers: [], raf: 0, clock: 0, catches: 0, hot: null, held: null, loose: new Set(), cutWarned: false, device: "desktop", sock: null, plugP: null, fuseK: 0 };
  const $ = (s) => root.querySelector(s), $$ = (s) => [...root.querySelectorAll(s)];
  const { SFX, hissStart, hissStop } = createSounds(root);

  const G = {
    root, S, $, $$, SFX, hissStart, hissStop,
    setA: (k, v) => (v == null ? root.removeAttribute("data-" + k) : root.setAttribute("data-" + k, v)),
    later: (fn, ms) => S.timers.push(setTimeout(fn, ms)),
    clearTimers: () => { S.timers.forEach(clearTimeout); S.timers = []; },
    /** Element box relative to the game root (x/y at the anchor point). */
    rel: (el, ax = 0.5, ay = 0.5) => { const r = el.getBoundingClientRect(), gr = root.getBoundingClientRect(); return { x: r.left - gr.left + r.width * ax, y: r.top - gr.top + r.height * ay, w: r.width, h: r.height }; },
    pointer: (ev) => { const gr = root.getBoundingClientRect(); return { x: ev.clientX - gr.left, y: ev.clientY - gr.top }; },
    reduced: () => matchMedia("(prefers-reduced-motion: reduce)").matches,
    /** Phones play the grid version (set by the stylesheet's container query). */
    isPhone: () => getComputedStyle(root).getPropertyValue("--bt-tts-phone").trim() === "1",
    /** The play area rounds place things in: the stage, or on phones just the hub
        (the prototype kept its phone link grid outside the stage). */
    playRect: () => G.rel(G.isPhone() ? $(".bt-tts-hub") : $(".bt-tts-stage")),
    cards: () => $$(".bt-tts-link"),
    idx: (el) => +el.dataset.i,
    /** Show or hide an interactive piece: hidden pieces are inert (no focus, no clicks). */
    enable: (el, on) => { el.inert = !on; },
    fmtTime,
  };

  /** Run time in seconds: wall clock plus penalties. The clock never pauses. */
  G.elapsed = () => (performance.now() - S.t0) / 1000 + S.pen;
  /** Smooth scroll so the bottom of the footer is in view (first tap, after the chain). */
  G.toBottom = (ms = 520) => G.later(() => (root.closest("footer") || root).scrollIntoView({ block: "end", behavior: G.reduced() ? "auto" : "smooth" }), ms);

  const meter = $(".bt-tts-meter");
  G.draw = () => {
    $(".bt-tts-meter-fill").style.width = S.prog + "%";
    $(".bt-tts-meter-pct").textContent = Math.round(S.prog) + "%";
    meter.setAttribute("aria-valuenow", String(Math.round(S.prog)));
    $("[data-pen]").textContent = "+" + S.pen + "s";
  };
  /** Raise the completion meter to p% (it never goes down during a run). */
  G.progress = (p) => {
    if (p > S.prog) { S.prog = Math.min(100, p); meter.classList.remove("is-bump"); void meter.offsetWidth; meter.classList.add("is-bump"); }
    G.draw();
  };
  /** A miss-click: +1 s, with a red "+1s" floating up from (x, y). */
  G.minus = (x, y) => {
    S.pen += 1; G.draw(); SFX.minus();
    const m = document.createElement("span");
    m.className = "bt-tts-minus"; m.textContent = "+1s"; m.style.left = x + "px"; m.style.top = y + "px";
    root.append(m); setTimeout(() => m.remove(), 950);
  };
  G.toast = (text, ms = 2400) => {
    const e = $(".bt-tts-toast");
    e.textContent = text; e.classList.add("is-shown");
    clearTimeout(e._t); e._t = setTimeout(() => e.classList.remove("is-shown"), ms);
  };
  const tanger = $(".bt-tts-tanger");
  G.phase = (p) => {
    S.phase = p; G.setA("phase", p);
    const live = p === "glowclick" || p === "danger";
    tanger.tabIndex = live ? 0 : -1;
    tanger.setAttribute("aria-disabled", String(!live));
  };
  G.stopClock = () => clearInterval(S.clock);

  G.reset = () => {
    G.clearTimers(); cancelAnimationFrame(S.raf); G.stopClock(); hissStop();
    ["links", "flicker", "chain", "cf", "tstate", "bomb", "fuse", "end", "finish", "plug", "breaker", "dark"].forEach((k) => G.setA(k, null));
    root.classList.remove("is-end-ready");
    Object.assign(S, { pen: 0, prog: 0, catches: 0, hot: null, endAt: null });
    S.got.clear(); S.loose.clear();
    dropTool(G); G.phase("idle"); G.draw();
    $("[data-tm]").textContent = "0:00.00";
    G.cards().forEach((c) => c.classList.remove("is-got", "is-hot", "is-caught"));
    $$(".bt-tts-tanger span").forEach((s) => { s.classList.remove("is-loose"); s.style.transform = ""; });
    $(".bt-tts-t1").textContent = "T";
    $(".bt-tts-boom").innerHTML = ""; $(".bt-tts-fuse .f-fx").innerHTML = "";
    root.classList.remove("is-shake");
    $(".bt-tts-cord path").setAttribute("d", "");
    $(".bt-tts-bug")?.remove();
    [".bt-tts-chain", ".bt-tts-breaker", ".bt-tts-end"].forEach((s) => G.enable($(s), false));
  };

  G.start = () => {
    G.reset(); SFX.slop();
    S.t0 = performance.now(); S.device = G.isPhone() ? "mobile" : "desktop";
    G.phase("p1"); G.setA("links", "1"); G.progress(5);
    G.stopClock(); S.clock = setInterval(() => { $("[data-tm]").textContent = fmtTime(G.elapsed()); }, 47);
    G.later(() => flyBug(G), 1100); G.toBottom();
  };

  /** Tapping the splat mid-game (or closing an end screen): collapse back to idle. */
  G.tapOut = (quiet) => {
    SFX.slop();
    const p = Math.round(S.prog);
    root.classList.add("is-collapsing"); G.reset();
    G.later(() => root.classList.remove("is-collapsing"), 700);
    if (!quiet) G.toast(`Tapped out at ${p}%`);
  };

  G.end = (kind, title, sub) => showEnd(G, kind, title, sub);

  // ---- input ----
  root.addEventListener("click", (ev) => {
    // The idle footer script owns the sound toggle, the leaderboard and Contact / Follow.
    if (ev.target.closest("[data-snd], [data-lb-wrap], .bt-tts-cf")) return;
    // The end card's first 2 s: ignore everything on it and the dimmed play area.
    if (S.phase === "over" && root.hasAttribute("data-end") && performance.now() - (S.endShownAt || 0) < END_GRACE_MS) { ev.preventDefault(); return; }
    const t = ev.target.closest("[data-tts-g], .bt-tts-link, [data-fb], [data-tool], .bt-tts-tanger span, .bt-tts-plug");
    if (t?.matches("[data-fb]")) return onFeedback(G, t);
    if (S.phase === "over" && root.hasAttribute("data-end") && !ev.target.closest("button, a")) { G.setA("end", null); return G.tapOut(true); }
    const active = !["idle", "over", "finish"].includes(S.phase);

    if (t?.matches("[data-tool]")) return pickTool(G, t);
    if (t?.classList.contains("bt-tts-link")) {
      if (LINKS_WORK.includes(S.phase)) return;
      ev.preventDefault();
      if (S.phase === "links") rounds.relight(G, t);
      return;
    }
    if (t?.matches(".bt-tts-tanger span") && S.phase === "hammer") return rounds.hammerHit(G, t, ev);

    const k = (t?.matches(".bt-tts-tanger span") ? t.closest("[data-tts-g]") : t)?.dataset.ttsG;
    if (k === "again") return G.start();
    if (k === "splat") {
      if (S.phase === "idle" || S.phase === "over") return G.start();
      if (S.phase === "finish") { SFX.splat(); G.progress(100); return G.end("win"); }
      return G.tapOut();
    }
    if (k === "chain" && S.phase === "chainwait") { ev.stopPropagation(); return rounds.pullChain(G); }
    if (k === "breaker" && S.phase === "breaker") return rounds.flipBreaker(G);
    if (k === "tanger" && S.phase === "glowclick") return rounds.restoreTanger(G);
    if (k === "tanger" && S.phase === "danger") return rounds.clickDanger(G);
    if (k === "bomb" && S.phase === "fuse") return explode(G);
    if (k === "fuse" && S.phase === "fuse") return cutFuse(G, ev);

    // A miss-click: during play, inside the play area, on nothing.
    if (active && !t && ev.target.closest(".bt-tts-stage")) { const p = G.pointer(ev); G.minus(p.x, p.y); }
  });

  // Catches register on pointer down (a click would be too late on a short window).
  root.addEventListener("pointerdown", (ev) => {
    if (S.held) moveHeldTool(G, ev);
    if (S.phase !== "chase") return;
    const c = ev.target.closest(".bt-tts-link");
    if (!c || !root.contains(c)) return;
    ev.preventDefault(); onChase(G, c);
  });
  // Links round: hover relights on a mouse; a finger relights by dragging over or tapping.
  root.addEventListener("pointerover", (ev) => { const c = ev.target.closest(".bt-tts-link"); if (c && ev.pointerType !== "touch") rounds.relight(G, c); });
  root.addEventListener("pointermove", (ev) => {
    if (S.held) moveHeldTool(G, ev);
    if (ev.pointerType !== "touch") return;
    const c = document.elementFromPoint(ev.clientX, ev.clientY)?.closest(".bt-tts-link");
    if (c && root.contains(c)) rounds.relight(G, c);
  });
  // Keyboard: role="button" pieces (TANGER) act on Enter and Space.
  root.addEventListener("keydown", (ev) => {
    if ((ev.key === "Enter" || ev.key === " ") && ev.target.matches?.('[role="button"]') && ev.target.getAttribute("aria-disabled") !== "true") { ev.preventDefault(); ev.target.click(); }
  });

  initPlug(G);
  G.reset();
  return G;
}
