// Footer Contact + Follow, "Shared power" (docs/design/mockups/footer-power.html,
// approved Option 2). One glowing node where the chain hung feeds a hanging cable to
// every badge (phones: a node per section). When Contact and Follow appear (the chain
// pull sets data-cf, or keyboard focus reveals them) sparks run down each cable in
// turn, each cable lights in its badge colour, the ring flashes and the badge swings
// once, and the follow counts tick up; after the chain pull it waits for the page to
// stop scrolling. Show sends a pulse down that badge's cable and types the address into
// the readout ("Pulse and type", docs/design/mockups/contact-copy.html); Copy sends it
// back up and confirms.
//
// Loaded with the game (index.js) or by the idle footer on the first Show / focus, so
// idle pages never load it. The sway runs only while the section is powered and on
// screen. Reduced motion: everything is powered on at once with the final numbers; no
// sparks, sway, swing, pulses or typing (Copy still confirms "Copied ✓").
const SVG = "http://www.w3.org/2000/svg";
const STALE_MS = 7 * 24 * 60 * 60 * 1000;   // older counts show "Follow"
const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const fmt = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(1).replace(/\.0$/, "")}M` : n >= 1000 ? `${(n / 1000).toFixed(1).replace(/\.0$/, "")}K` : String(Math.round(n)));

// ---- counts: sites/{siteId}/public/socials, one read per page view ----
let socials = null;
function loadSocials() {
  socials ??= (async () => {
    const { db, doc, getDoc, SITE_ID } = await import("../../lib/db");
    const s = await getDoc(doc(db, "sites", SITE_ID, "public", "socials"));
    return s.exists() ? s.data() : null;
  })().catch((err) => { console.warn("footer: couldn't read the follow counts", err); return null; });
  return socials;
}
const fresh = (p) => p?.updatedAt?.toMillis && Date.now() - p.updatedAt.toMillis() < STALE_MS;
/** { n, unit, goal } for a badge, or null (shows "Follow"). */
function countFor(id, data) {
  const p = data?.[id];
  if (!fresh(p)) return null;
  if (id === "youtube" && typeof p.subscribers === "number") {
    const goal = data.youtubeGoal;
    return { n: p.subscribers, unit: "subscribers", goal: goal && p.subscribers < goal ? `goal ${fmt(goal)}` : "" };
  }
  if ((id === "tiktok" || id === "twitch") && typeof p.followers === "number") return { n: p.followers, unit: "followers", goal: "" };
  return null;
}

export function initPower(root) {
  if (root._power) return root._power;
  const cf = root.querySelector("[data-power]");
  if (!cf) return null;
  const svg = cf.querySelector(".bt-tts-pw-svg");
  const badges = [...cf.querySelectorAll(".bt-tts-pw-b")];
  const readout = cf.querySelector("[data-pw-readout]");
  const phone = () => getComputedStyle(root).getPropertyValue("--bt-tts-phone").trim() === "1";
  let wires = [], nodes = [], raf = 0, visible = false, powered = false, runId = 0;
  const timers = new Set();
  const later = (fn, ms) => { const t = setTimeout(() => { timers.delete(t); fn(); }, ms); timers.add(t); };
  const colorOf = (el) => getComputedStyle(el).getPropertyValue("--pw-c").trim();

  // ---- geometry: positions relative to the section ----
  const rel = (el) => {
    const a = cf.getBoundingClientRect(), r = el.getBoundingClientRect();
    return { x: r.left - a.left + r.width / 2, top: r.top - a.top, bottom: r.bottom - a.top, w: r.width, h: r.height };
  };
  // The paths are built once; a resize (the section opening, the readout growing, the
  // window) only moves their end points, so running sparks and strikes carry on.
  let pulses = null;
  function build() {
    const cols = [...cf.querySelectorAll("[data-pw-col]")];
    nodes = phone() ? cols.map(() => ({ x: 0, y: 0 })) : [{ x: 0, y: 0 }];
    wires = [];
    cols.forEach((c, ci) => c.querySelectorAll(".bt-tts-pw-b").forEach((b) => wires.push({ node: nodes[phone() ? ci : 0], col: c, x: 0, y: 0, c: colorOf(b), el: b })));
    svg.replaceChildren();
    wires.forEach((w) => {
      for (const cls of ["w", "sp"]) {
        const p = document.createElementNS(SVG, "path");
        p.setAttribute("class", cls + (cls === "w" && w.el.classList.contains("is-on") ? " lit" : ""));
        p.style.setProperty("--pw-c", w.c);
        if (cls === "sp") p.setAttribute("pathLength", "100");
        svg.append(p);
        w[cls] = p;
      }
    });
    nodes.forEach((n) => { n.el = document.createElementNS(SVG, "circle"); n.el.setAttribute("class", "node"); n.el.setAttribute("r", "6"); svg.append(n.el); });
    pulses = document.createElementNS(SVG, "g");
    pulses.setAttribute("class", "pulses");
    svg.append(pulses);
    built = phone();
  }
  let built = null;
  function layout() {
    const W = cf.clientWidth, H = cf.scrollHeight;
    if (!W) return;
    if (built !== phone()) build();   // first time, or switched between one node and two
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    if (!phone()) Object.assign(nodes[0], { x: W / 2, y: 8 });
    else [...cf.querySelectorAll("[data-pw-col]")].forEach((c, i) => { const l = rel(c.querySelector(".bt-label")); Object.assign(nodes[i], { x: l.x, y: l.bottom + 12 }); });
    nodes.forEach((n) => { n.el.setAttribute("cx", n.x); n.el.setAttribute("cy", n.y); });
    // Each cable ends at the top of its own ring and comes in from above, so it never
    // passes through another badge (every ring's top is on the same row line).
    wires.forEach((w) => { const r = rel(w.el.querySelector(".bt-tts-pw-ring")); w.x = r.x; w.y = r.top + 1; });
    draw(performance.now());
  }
  // A cable hangs from the node and drops onto the ring from straight above. The curve
  // stays above the rings' top line all the way (its control points sit above it).
  const pathFor = (w, t) => {
    const dy = w.y - w.node.y;
    const sway = reduced() ? 0 : Math.sin(t / 1600 + w.x / 180) * 5;
    return `M${w.node.x} ${w.node.y} C${(w.node.x + sway * 0.4).toFixed(1)} ${(w.node.y + dy * 0.75).toFixed(1)}, ${(w.x + sway).toFixed(1)} ${(w.y - dy * 0.55).toFixed(1)}, ${w.x.toFixed(1)} ${w.y.toFixed(1)}`;
  };
  const draw = (t) => wires.forEach((w) => { const d = pathFor(w, t); w.w.setAttribute("d", d); w.sp.setAttribute("d", d); });
  const loop = (t) => { draw(t); raf = requestAnimationFrame(loop); };
  const sync = () => {
    cancelAnimationFrame(raf); raf = 0;
    if (powered && visible && !document.hidden && !reduced()) raf = requestAnimationFrame(loop);
  };

  // ---- power-up ----
  async function powerUp() {
    const run = ++runId;
    powered = true;
    timers.forEach(clearTimeout); timers.clear();
    layout();
    const counts = badges.filter((b) => b.dataset.social).map((b) => ({ b, n: b.querySelector("[data-count]"), u: b.querySelector("[data-unit]") }));
    const dataP = loadSocials();
    const still = reduced();
    badges.forEach((b) => b.classList.remove("is-on", "is-swing"));
    wires.forEach((w, i) => {
      w.w.classList.remove("lit"); w.sp.classList.remove("run");
      if (still) { w.w.classList.add("lit"); w.el.classList.add("is-on"); return; }
      later(() => { void w.sp.getBoundingClientRect(); w.sp.classList.add("run"); }, i * 150);
      later(() => { w.w.classList.add("lit"); w.el.classList.add("is-on", "is-swing"); }, i * 150 + 820);
      later(() => w.el.classList.remove("is-swing"), i * 150 + 2500);
    });
    const data = await dataP;
    if (run !== runId) return;
    const targets = counts.map(({ b, n, u }) => {
      const c = countFor(b.dataset.social, data);
      if (!c) { n.textContent = "Follow"; u.innerHTML = "&nbsp;"; b.querySelector(".bt-tts-pw-goal")?.remove(); return null; }
      u.textContent = c.unit;
      b.querySelector(".bt-tts-pw-goal")?.remove();
      if (c.goal) u.insertAdjacentHTML("afterend", `<span class="bt-tts-pw-u bt-tts-pw-goal">${c.goal}</span>`);
      n.textContent = still ? fmt(c.n) : "0";
      return { n, to: c.n };
    }).filter(Boolean);
    if (still) return;
    const start = performance.now() + 1000;
    const step = (t) => {
      if (run !== runId) return;
      let busy = false;
      targets.forEach((x, i) => {
        const k = Math.min(1, Math.max(0, (t - start - i * 150) / 1100));
        if (k < 1) busy = true;
        x.n.textContent = fmt(x.to * (1 - Math.pow(1 - k, 3)));
      });
      if (busy) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
    sync();
  }
  function powerDown() {
    runId++; powered = false;
    timers.forEach(clearTimeout); timers.clear();
    badges.forEach((b) => b.classList.remove("is-on", "is-swing"));
    wires.forEach((w) => { w.w.classList.remove("lit"); w.sp.classList.remove("run"); });
    sync();
  }

  // ---- Show and Copy, style A "Pulse and type" (docs/design/mockups/contact-copy.html) ----
  // Show: a soft pulse runs down the cable from the node (650 ms), the ring blooms, and the
  // address types into a readout line (28 ms a character) with a cursor that goes 0.9 s
  // after. Copy: the characters light left to right, the pulse runs back up the cable, the
  // ring ripples, a COPIED tag pops beside the line and the button confirms "Copied ✓".
  const PULSE_MS = 650, TYPE_MS = 28;
  const lines = new Map();   // badge -> { line, text, address }
  function pulse(w, up = false) {
    if (!w || reduced()) return;
    const p = document.createElementNS(SVG, "path");
    p.setAttribute("class", "pulse" + (up ? " up" : ""));
    p.setAttribute("pathLength", "100");
    p.setAttribute("d", w.w.getAttribute("d") || "");
    p.style.setProperty("--pw-c", w.c);
    pulses?.append(p);
    later(() => p.remove(), PULSE_MS + 150);
  }
  function ringFx(badge, cls) {
    if (reduced()) return;
    const ring = badge.querySelector(".bt-tts-pw-ring");
    ring.classList.remove(cls); void ring.offsetWidth; ring.classList.add(cls);
  }
  function show(btn, badge, address, w) {
    const line = document.createElement("div");
    line.className = "bt-tts-pw-mail";
    line.style.setProperty("--pw-c", w?.c || colorOf(badge));
    const text = document.createElement("span");
    text.className = "bt-tts-pw-mail-text";
    line.append(text);
    readout.append(line);
    lines.set(badge, { line, text, address });
    // Keep the new line in view (e.g. the third address below the fold): scroll just
    // enough, and only if it isn't fully visible already.
    requestAnimationFrame(() => line.scrollIntoView({ block: "nearest", inline: "nearest", behavior: reduced() ? "auto" : "smooth" }));
    badge.classList.add("is-on");
    w?.w.classList.add("lit");
    btn.dataset.showLabel ??= btn.getAttribute("aria-label") || "";
    btn.textContent = "Copy";
    btn.classList.add("is-copy");
    btn.setAttribute("aria-label", `Copy ${address}`);
    if (reduced()) { text.textContent = address; return; }
    pulse(w);
    later(() => ringFx(badge, "is-bloom"), PULSE_MS - 90);
    const cursor = document.createElement("span");
    cursor.className = "bt-tts-pw-cursor";
    cursor.setAttribute("aria-hidden", "true");
    line.append(cursor);
    let k = 0;
    const type = () => {
      k++;
      const s = document.createElement("span");
      s.className = "ch";
      s.textContent = address[k - 1];
      text.append(s);
      if (k < address.length) later(type, TYPE_MS);
      else later(() => cursor.remove(), 900);
    };
    later(type, PULSE_MS - 30);
  }
  function copied(btn, badge, entry, w) {
    const { line, text, address } = entry;
    // The whole address is there even if Copy comes mid-typing.
    if (text.textContent !== address) { text.replaceChildren(...[...address].map((ch) => Object.assign(document.createElement("span"), { className: "ch", textContent: ch }))); line.querySelector(".bt-tts-pw-cursor")?.remove(); }
    const tag = (label, cls = "") => {
      let t = line.querySelector(".bt-tts-pw-tag");
      if (!t) { t = document.createElement("span"); t.className = "bt-tts-pw-tag"; t.setAttribute("aria-hidden", "true"); line.append(t); }
      t.textContent = label;
      t.className = `bt-tts-pw-tag ${cls}`;
      void t.offsetWidth; t.classList.add("is-shown");
    };
    const ok = () => {
      if (!reduced()) {
        [...text.children].forEach((s, i) => later(() => { s.classList.add("is-lit"); later(() => s.classList.remove("is-lit"), 260); }, i * 14));
        pulse(w, true);
        later(() => ringFx(badge, "is-ripple"), PULSE_MS - 90);
      }
      tag("Copied");
      btn.textContent = "Copied ✓";
      btn.classList.add("is-done");
      later(() => { btn.textContent = "Copy"; btn.classList.remove("is-done"); }, 1800);
    };
    const failed = () => {
      // No clipboard (or it was refused): the text stays selectable; select it for them.
      const sel = getSelection(), r = document.createRange();
      r.selectNodeContents(text); sel?.removeAllRanges(); sel?.addRange(r);
      tag("Press and hold to copy", "is-hint");
    };
    try {
      if (!navigator.clipboard?.writeText) return failed();
      navigator.clipboard.writeText(address).then(ok, failed);
    } catch { failed(); }
  }
  function reveal(btn) {
    const badge = btn.closest(".bt-tts-pw-b");
    const row = btn.closest("[data-mail-domain]");
    if (!badge || !row) return;
    if (!wires.length) layout();
    const w = wires.find((x) => x.el === badge);
    const entry = lines.get(badge);
    if (entry) return copied(btn, badge, entry, w);
    show(btn, badge, `${btn.dataset.mailUser}@${row.dataset.mailDomain}`, w);
  }

  // When the footer collapses back to idle (the splat tapped, a tap-out, an end card
  // closed) every revealed address leaves the page, the buttons go back to Show and any
  // typing, pulse or Copied timers are cancelled, so Contact starts fresh next time.
  function resetContacts() {
    timers.forEach(clearTimeout); timers.clear();
    pulses?.replaceChildren();
    readout.replaceChildren();
    lines.clear();
    cf.querySelectorAll("[data-mail-user]").forEach((btn) => {
      btn.textContent = "Show";
      btn.classList.remove("is-copy", "is-done");
      if (btn.dataset.showLabel != null) { btn.setAttribute("aria-label", btn.dataset.showLabel); delete btn.dataset.showLabel; }
    });
    cf.querySelectorAll(".bt-tts-pw-ring").forEach((r) => r.classList.remove("is-bloom", "is-ripple"));
  }

  // ---- when to power up ----
  // After the chain pull the game scrolls to the bottom of the footer (G.toBottom, about
  // 0.56 s later). The power-up waits until that scroll has finished (scrollend, or 150 ms
  // without scroll events) and at least 60% of the section is on screen, then starts
  // 200 ms later. Safety net: 1.5 s after the pull it starts anyway if the section is on
  // screen at all; otherwise as soon as it comes into view. Keyboard focus powers up at once.
  let ratio = 0, arm = null;
  new IntersectionObserver((es) => {
    ratio = es[es.length - 1].intersectionRatio;
    arm?.onView();
  }, { threshold: [0, 0.6, 1] }).observe(cf);
  function disarm() { if (!arm) return; arm.stop(); arm = null; }
  function armPowerUp() {
    disarm();
    let settled = false, started = false, idle = 0, sawScroll = false;
    const ts = [];
    const go = () => { if (started) return; started = true; ts.push(setTimeout(() => { arm = null; stopListening(); if (shown()) powerUp(); }, 200)); };
    const settle = () => { settled = true; if (ratio >= 0.6) go(); };
    const onScroll = () => { sawScroll = true; settled = false; clearTimeout(idle); idle = setTimeout(settle, 150); };
    const onEnd = () => { if (sawScroll) { clearTimeout(idle); settle(); } };
    const stopListening = () => { removeEventListener("scroll", onScroll); removeEventListener("scrollend", onEnd); clearTimeout(idle); };
    addEventListener("scroll", onScroll, { passive: true });
    if ("onscrollend" in window) addEventListener("scrollend", onEnd);
    // No scroll at all (already at the bottom): settled once the game's scroll would have begun.
    ts.push(setTimeout(() => { if (!sawScroll) settle(); }, 800));
    let late = false;
    ts.push(setTimeout(() => { late = true; if (ratio > 0) go(); }, 1500));
    arm = {
      onView: () => { if ((settled || late) && ratio >= 0.6) go(); },
      stop: () => { ts.forEach(clearTimeout); stopListening(); },
    };
  }
  const shown = () => root.dataset.cf === "1" || cf.matches(":focus-within");
  const check = () => {
    if (!shown()) { disarm(); if (powered) powerDown(); return; }
    if (powered || arm) return;
    if (cf.matches(":focus-within") && root.dataset.cf !== "1") powerUp();   // keyboard: no scroll to wait for
    else armPowerUp();
  };
  let wasOpen = root.dataset.cf === "1";
  new MutationObserver(() => {
    const open = root.dataset.cf === "1";
    if (wasOpen && !open) resetContacts();   // the footer collapsed (not just focus leaving)
    wasOpen = open;
    check();
  }).observe(root, { attributes: true, attributeFilter: ["data-cf"] });
  cf.addEventListener("focusin", check);
  cf.addEventListener("focusout", () => setTimeout(check, 0));
  new IntersectionObserver((es) => { visible = es.some((e) => e.isIntersecting); sync(); }).observe(cf);
  new ResizeObserver(() => { if (wires.length) layout(); }).observe(cf);
  document.addEventListener("visibilitychange", sync);
  check();

  root._power = { powerUp, powerDown, reveal, layout };
  return root._power;
}
