// site/src/scripts/not-found/room.js — the 404 page's engine (docs/specs/not-found.md "The light" to "Performance"): the firefly, its
// light, and the room that reacts to it. Ported from the approved mockup's Room (docs/design/mockups/not-found-workshop.html), with the
// spec's fixed values: Bright core glow, light step 2 Dim (size 0.74, dim 0.2 in not-found.css). No switches on the real page.
//
// startRoom(nf, { input, reduced })   nf = the page's .nf block; input "mouse" | "touch"; reduced = prefers-reduced-motion.
//   One requestAnimationFrame loop. It pauses while the block is off screen (IntersectionObserver) or the tab is hidden, and stops
//   for good on pagehide. Reduced motion: the still state (the firefly rests at the TV; the TV still switches, instantly).
// The TV is a toy, not a control: not focusable, nothing depends on it; the real message is the page's text.
import { DEFS, DEFS2, CR, ROOM } from "./workshop-art.js";

const SIZE = 0.74;        // light step 2
const GK = 1.05;          // Bright core: how far the reactions reach, × the light radius
const BEHIND_AT = 4200, BEHIND_FOR = 1400, REBOOT_AFTER = 2600;

export function startRoom(main, { input = "mouse", reduced = false } = {}) {
  const scene = main.querySelector(".nf-scene"), art = scene.querySelector(".nf-art"), eyesSvg = scene.querySelector(".nf-eyes");
  const motesEl = scene.querySelector(".nf-motes"), grainEl = scene.querySelector(".nf-grain");
  const layer = main.querySelector(".nf-layer"), ff = layer.querySelector(".bt-firefly"), home = main.querySelector("[data-home]");
  const rm = reduced, R = ROOM;
  let crawlers = [], eyes = [], hangers = [], sways = [], motes = [], raf = 0, last = 0, clock = 0, onScreen = true, stopped = false;
  let pos = { x: 0, y: 0 }, vel = { x: 0, y: 0 }, way = null, dwell = 0, lastPoi = -1, focusHome = false, hoverHome = false, tap = null, landed = false, ptr = { x: 0, y: 0, at: -1e9, on: false };
  let tvEl = null, tvOn = false, tvAmt = 0, led = null, timers = [], scared = false, rebooted = false;
  let doll = null, iris = null, dollRot = 0, irisX = 0, irisY = 0, fig = null, figX = 770, figO = 0, figCool = 0, figForce = 0;
  const rect = (el) => { const l = layer.getBoundingClientRect(), r = el.getBoundingClientRect(); return { x: r.left - l.left, y: r.top - l.top, w: r.width, h: r.height }; };
  const map = () => { const s = rect(scene), k = Math.max(s.w / 900, s.h / 600); return { s, k, ox: s.x + (s.w - 900 * k) / 2, oy: s.y + (s.h - 600 * k) / 2 }; };
  const u2p = (m, u, v) => ({ x: m.ox + u * m.k, y: m.oy + v * m.k });
  const p2u = (m, x, y) => ({ u: (x - m.ox) / m.k, v: (y - m.oy) / m.k });
  const baseR = () => (input === "touch" ? 112 : 150) * SIZE;
  const later = (fn, ms) => timers.push(setTimeout(fn, ms));

  // ---- build the room ----
  scene.insertAdjacentHTML("afterbegin", DEFS + DEFS2);
  const cr = R.crawlers.map((c, i) => `<g class="nf-cr" data-i="${i}">${CR[c.k](c.s || 1)}</g>`).join("");
  const hg = R.hangers.map((h, i) => `<g class="nf-hg" data-i="${i}"><line class="s-thread" x1="${h.x}" y1="${h.top}" x2="${h.x}" y2="${h.rest}"/><g class="nf-hs">${CR.spider(.8)}</g></g>`).join("");
  art.innerHTML = R.art() + `<g>${cr}</g><g>${hg}</g>`;
  eyesSvg.innerHTML = R.eyes.map((e, i) => `<g class="ey ey--${e.tone}" transform="translate(${e.x} ${e.y}) scale(${e.s || 1})" style="--d:${(-i * 1.9).toFixed(1)}s"><ellipse cx="-9" cy="0" rx="4.6" ry="3.2"/><ellipse cx="9" cy="0" rx="4.6" ry="3.2"/></g>`).join("")
    + `<circle class="nf-led" cx="543" cy="343" r="2.2"/>`;   // the TV's standby LED, above the dark so it can be found
  const drawCrawler = (c) => { c.el.setAttribute("transform", `translate(${c.x.toFixed(1)} ${c.y.toFixed(1)}) rotate(${(c.a * 180 / Math.PI).toFixed(1)})`); c.el.classList.toggle("is-run", c.sp > 4); };
  const drawHanger = (h) => { h.line.setAttribute("y2", h.y.toFixed(1)); h.sp.setAttribute("transform", `translate(${h.x} ${(h.y + 8).toFixed(1)}) rotate(90)`); };
  crawlers = R.crawlers.map((c, i) => ({ ...c, el: art.querySelector(`.nf-cr[data-i="${i}"]`), a: c.a * Math.PI / 180, want: c.a * Math.PI / 180, sp: 0, mode: "idle", t: 1 + Math.random() * 3 }));
  hangers = R.hangers.map((h, i) => { const g = art.querySelector(`.nf-hg[data-i="${i}"]`); return { ...h, y: h.rest, line: g.querySelector("line"), sp: g.querySelector(".nf-hs") }; });
  eyes = R.eyes.map((e, i) => ({ ...e, el: eyesSvg.children[i], hide: 0 }));
  sways = [...art.querySelectorAll(".nf-sway")].map((el) => { const [px, py] = el.style.transformOrigin.split(" ").map(parseFloat); el.addEventListener("animationend", () => el.classList.remove("is-swing")); return { el, px, py }; });
  tvEl = art.querySelector(".nf-tv"); led = eyesSvg.querySelector(".nf-led");
  doll = art.querySelector(".nf-doll-head"); iris = art.querySelector(".nf-doll-iris");
  fig = art.querySelector(".nf-figure"); if (fig) fig.style.opacity = "0";
  if (!rm) motesEl.innerHTML = Array.from({ length: R.motes }, () => "<i></i>").join("");
  motes = [...motesEl.children].map(() => ({ a: Math.random() * 6.28, rad: .15 + Math.random() * .7, sp: .00025 + Math.random() * .0005, ph: Math.random() * 6.28 }));
  grainEl.style.opacity = String(R.grain);
  crawlers.forEach(drawCrawler); hangers.forEach(drawHanger);
  main.toggleAttribute("data-rm", rm);
  main.classList.add("is-ready");

  // ---- the TV ----
  function tvCenter() { const g = rect(tvEl.querySelector(".tv-glass")); return { x: g.x + g.w / 2, y: g.y + g.h / 2 }; }
  function tvSet(on) {
    if (!tvEl) return;
    if (on) {
      tvEl.classList.remove("is-off", "is-alt"); void tvEl.getBoundingClientRect(); tvEl.classList.add("is-on"); tvOn = true;
      // BEHIND YOU: once per page view, 4.2 s after it first comes on
      if (!scared && !rm) { scared = true; later(() => { if (!tvOn) return; tvEl.classList.add("is-alt"); figForce = 1.6; later(() => tvEl.classList.remove("is-alt"), BEHIND_FOR); }, BEHIND_AT); }
    } else {
      tvEl.classList.remove("is-on", "is-alt"); tvEl.classList.add("is-off"); tvOn = false; later(() => tvEl.classList.remove("is-off"), 420);
      // Won't stay off: the first time, it turns itself back on
      if (!rebooted && !rm) { rebooted = true; later(() => { if (!tvOn && !stopped) tvSet(true); }, REBOOT_AFTER); }
    }
    if (led) led.classList.toggle("is-on", tvOn);
    if (rm) { tvAmt = tvOn ? 1 : 0; still(); }
  }
  function setLight(m, r) {
    scene.style.setProperty("--lx", (pos.x - m.s.x).toFixed(0) + "px");
    scene.style.setProperty("--ly", (pos.y - m.s.y).toFixed(0) + "px");
    scene.style.setProperty("--r", r.toFixed(0) + "px");
    if (tvEl && tvAmt > 0.001) { const c = tvCenter(); scene.style.setProperty("--tx", (c.x - m.s.x).toFixed(0) + "px"); scene.style.setProperty("--ty", (c.y - m.s.y).toFixed(0) + "px"); scene.style.setProperty("--tr", Math.max(1, baseR() * .95 * tvAmt).toFixed(0) + "px"); }
    else scene.style.setProperty("--tr", "1px");
    scene.style.setProperty("--tvon", tvAmt.toFixed(2));
  }
  const place = (face = 1, tilt = 0) => { const h = ff.offsetWidth / 2; ff.style.transform = `translate(${(pos.x - h).toFixed(1)}px, ${(pos.y - h).toFixed(1)}px) scaleX(${face}) rotate(${tilt.toFixed(1)}deg)`; };
  const setLit = (on) => home.classList.toggle("nf-lit", on);

  function pickWay(m) {
    let p;
    if (Math.random() < .72) { let i; do { i = Math.floor(Math.random() * R.pois.length); } while (i === lastPoi && R.pois.length > 1); lastPoi = i; p = u2p(m, R.pois[i][0] + (Math.random() - .5) * 30, R.pois[i][1] + (Math.random() - .5) * 24); }
    else p = { x: m.s.x + m.s.w * (.12 + Math.random() * .8), y: m.s.y + m.s.h * (.1 + Math.random() * .8) };
    p.x = Math.min(m.s.x + m.s.w - 16, Math.max(m.s.x + 16, p.x)); p.y = Math.min(m.s.y + m.s.h - 16, Math.max(m.s.y + 16, p.y));
    return p;
  }
  function still() { const m = map(); pos = u2p(m, R.rest[0], R.rest[1]); place(); setLight(m, baseR()); reactLights(m, baseR(), 0, true); }

  // ---- everything that reacts to light (the firefly, plus the TV when it's on) ----
  function reactLights(m, r, dt, frozen) {
    const L = p2u(m, pos.x, pos.y), Ru = r * GK / m.k;
    const lights = [{ u: L.u, v: L.v, R: Ru }];
    if (tvEl && tvAmt > .5) { const c = tvCenter(), T2 = p2u(m, c.x, c.y); lights.push({ u: T2.u, v: T2.v, R: baseR() * .95 * tvAmt * GK / m.k }); }
    const near = (x, y) => lights.reduce((best, l) => { const d = Math.hypot(x - l.u, y - l.v) / l.R; return d < best.n ? { n: d, l } : best; }, { n: 1e9, l: null });
    eyes.forEach((e) => { if (near(e.x, e.y).n < 1.25) e.hide = 2.6; e.hide = Math.max(0, e.hide - dt); e.el.style.opacity = e.hide > 0 ? "0" : "1"; });
    if (frozen) return;   // reduced motion: no doll turn, no crawlers, no swings, no figure
    // the doll watches the firefly, slowly
    if (doll) {
      const hx = 668, hy = 247;
      const tr = Math.max(-28, Math.min(28, (L.u - hx) * .11)), tix = Math.max(-1.3, Math.min(1.3, (L.u - hx) / 45)), tiy = Math.max(-1.1, Math.min(1.1, (L.v - hy) / 45));
      const f = Math.min(1, dt * 1.6);
      dollRot += (tr - dollRot) * f; irisX += (tix - irisX) * f; irisY += (tiy - irisY) * f;
      doll.setAttribute("transform", `translate(0 -40) rotate(${dollRot.toFixed(1)})`); iris.setAttribute("cx", (5 + irisX).toFixed(2)); iris.setAttribute("cy", (1 + irisY).toFixed(2));
    }
    crawlers.forEach((c) => {
      const nn = near(c.x, c.y), slow = c.k === "maggot";
      if (!slow && nn.n < .95) { c.mode = "flee"; c.want = Math.atan2(c.y - nn.l.v, c.x - nn.l.u) + (Math.random() - .5) * .5; }
      else if (c.mode === "flee" && nn.n > 1.5) { c.mode = "idle"; c.t = 1 + Math.random() * 3; }
      let target = 0;
      if (c.mode === "flee") target = c.k === "rat" ? 230 : c.k === "centipede" ? 120 : 170;
      else { c.t -= dt; if (c.t <= 0) { if (c.walk) { c.walk = false; c.t = 1.5 + Math.random() * 4; } else { c.walk = true; c.t = .6 + Math.random() * 1.6; c.want = c.a + (Math.random() - .5) * 2.4; } } target = c.walk && !slow ? 22 : slow ? 3 : 0; }
      if (c.x < 30) c.want = 0; if (c.x > 870) c.want = Math.PI; if (c.y < 476) c.want = Math.PI / 2; if (c.y > 588) c.want = -Math.PI / 2;
      const da = ((c.want - c.a + Math.PI * 3) % (Math.PI * 2)) - Math.PI; c.a += da * Math.min(1, dt * (c.mode === "flee" ? 9 : 3));
      c.sp += (target - c.sp) * Math.min(1, dt * 6);
      c.x = Math.max(20, Math.min(880, c.x + Math.cos(c.a) * c.sp * dt)); c.y = Math.max(472, Math.min(592, c.y + Math.sin(c.a) * c.sp * dt));
      drawCrawler(c);
    });
    hangers.forEach((h) => { const goal = near(h.x, h.y).n < 1.1 ? h.top + 6 : h.rest; const s = goal < h.y ? 200 : 26; h.y += Math.sign(goal - h.y) * Math.min(Math.abs(goal - h.y), s * dt); drawHanger(h); });
    sways.forEach((s) => { if (!s.el.classList.contains("is-swing") && Math.hypot(s.px - L.u, s.py + 50 - L.v) < Ru * .8) s.el.classList.add("is-swing"); });
    // the figure behind the plastic: only at the edge of the light, gone when you look straight at it
    if (fig) {
      const d = Math.hypot(figX - L.u, 440 - L.v) / Ru;
      figCool = Math.max(0, figCool - dt); figForce = Math.max(0, figForce - dt);
      let want = 0;
      if (figForce > 0) want = .92;
      else if (figCool <= 0 && d > .55 && d < 1.45) want = .85;
      else if (d <= .55 && figO > .05) { figCool = 1.8; }
      figO += (want - figO) * Math.min(1, dt * (want > figO ? 2.5 : 9));
      if (figO < .02 && figCool > 0 && figCool < 1.7) { figX = 725 + Math.random() * 120; }
      fig.style.opacity = figO.toFixed(3); fig.setAttribute("transform", `translate(${figX.toFixed(0)} 560)`);
    }
  }

  function tick(now) {
    raf = 0;
    if (stopped || !onScreen || document.hidden) { last = 0; return; }   // paused; resume() starts it again
    const dtms = last ? Math.min(50, now - last) : 16; last = now;
    clock += dtms; const dt = dtms / 1000, k = dtms / 16.7, t = clock;
    const m = map(), r = baseR() * (1 + .035 * Math.sin(t / 700) + .018 * Math.sin(t / 233));
    const hb = rect(home), land = { x: hb.x + hb.w - 12, y: hb.y - 8 };
    const wantHome = focusHome || hoverHome || (tap && tap.home);
    let T, stiff = .006, damp = .9;
    if (wantHome) { T = { x: land.x, y: land.y + Math.sin(t / 420) * 2 }; stiff = .018; damp = .82; }
    else if (input === "mouse" && ptr.on && performance.now() - ptr.at < 3500) { T = { x: ptr.x - 16, y: ptr.y - 18 }; stiff = .016; damp = .86; way = null; tap = null; }
    else {
      if (tap) { way = { x: tap.x, y: tap.y }; tap = null; dwell = 0; }
      if (!way) way = pickWay(m);
      const d = Math.hypot(way.x - pos.x, way.y - pos.y);
      if (d < 14) { dwell += dtms; if (dwell > 900 + (way.dw ??= Math.random() * 1600)) { way = pickWay(m); dwell = 0; } }
      T = { x: way.x + Math.sin(t / 500) * 6, y: way.y + Math.cos(t / 380) * 5 };
    }
    vel.x = (vel.x + (T.x - pos.x) * stiff * k) * Math.pow(damp, k);
    vel.y = (vel.y + (T.y - pos.y) * stiff * k) * Math.pow(damp, k);
    const sp = Math.hypot(vel.x, vel.y); if (sp > 7) { vel.x *= 7 / sp; vel.y *= 7 / sp; }
    pos.x += vel.x * k + Math.sin(t / 95) * .3; pos.y += vel.y * k + Math.cos(t / 120) * .3;
    const dh = Math.hypot(pos.x - land.x, pos.y - land.y);
    if (wantHome && dh < 22 && !landed) { landed = true; setLit(true); }
    if (landed && (!wantHome || dh > 50)) { landed = false; setLit(false); if (!wantHome) way = null; }
    place(vel.x < -.2 ? -1 : 1, Math.max(-16, Math.min(16, vel.y * 3)));
    tvAmt += ((tvOn ? 1 : 0) - tvAmt) * Math.min(1, dt * (tvOn ? 2.2 : 7));
    setLight(m, r);
    reactLights(m, r, dt, false);
    // dust in the light
    const lx = pos.x - m.s.x, ly = pos.y - m.s.y;
    motes.forEach((o, i) => { const a = o.a + t * o.sp, rr = o.rad * r * .85; const x = lx + Math.cos(a) * rr + Math.sin(t / 900 + o.ph) * 8, y = ly + Math.sin(a * 1.3) * rr * .8 + Math.cos(t / 700 + o.ph) * 6;
      const el = motesEl.children[i]; el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`; el.style.opacity = (.6 * Math.pow(1 - o.rad, 1.2) * (.6 + .4 * Math.sin(t / 400 + o.ph))).toFixed(2); });
    raf = requestAnimationFrame(tick);
  }
  const resume = () => { if (!rm && !stopped && !raf && onScreen && !document.hidden) raf = requestAnimationFrame(tick); };

  // ---- input (never blocks scrolling: no drag handling, no preventDefault) ----
  scene.addEventListener("pointerdown", (e) => {
    if (e.target.closest && e.target.closest(".nf-tv")) { tvSet(!tvOn); return; }
    if (rm) return; const l = layer.getBoundingClientRect(); tap = { x: e.clientX - l.left, y: e.clientY - l.top };
  });
  if (!rm) {
    // touch: a tap near Take me home sends the firefly to it
    main.addEventListener("pointerdown", (e) => { if (input !== "touch" || scene.contains(e.target)) return; const l = layer.getBoundingClientRect(), hb = rect(home); const x = e.clientX - l.left, y = e.clientY - l.top; if (x > hb.x - 40 && x < hb.x + hb.w + 40 && y > hb.y - 40 && y < hb.y + hb.h + 40) tap = { home: true }; });
    if (input === "mouse") {
      main.addEventListener("pointermove", (e) => { const l = layer.getBoundingClientRect(); ptr = { x: e.clientX - l.left, y: e.clientY - l.top, at: performance.now(), on: true }; });
      main.addEventListener("pointerleave", () => { ptr.on = false; });
      home.addEventListener("pointerenter", () => { hoverHome = true; }); home.addEventListener("pointerleave", () => { hoverHome = false; });
    }
    home.addEventListener("focus", () => { focusHome = true; }); home.addEventListener("blur", () => { focusHome = false; });
    new IntersectionObserver((es) => { onScreen = es[0].isIntersecting; resume(); }).observe(main);
    document.addEventListener("visibilitychange", resume);
  }
  addEventListener("pagehide", (e) => { if (e.persisted) return; stopped = true; cancelAnimationFrame(raf); raf = 0; timers.forEach(clearTimeout); timers = []; });

  // ---- start ----
  requestAnimationFrame(() => {
    if (rm) { still(); return; }
    const m = map();
    pos = { x: m.s.x + 10, y: m.s.y + m.s.h * .45 }; vel = { x: 4, y: -1 }; way = pickWay(m);
    resume();
  });
  if (rm) new ResizeObserver(() => still()).observe(main);
}
