// Footer Contact + Follow, "Shared power" (docs/design/mockups/footer-power.html,
// approved Option 2). One glowing node where the chain hung feeds a hanging cable to
// every badge (phones: a node per section). When Contact and Follow appear (the chain
// pull sets data-cf, or keyboard focus reveals them) sparks run down each cable in
// turn, each cable lights in its badge colour, the ring flashes and the badge swings
// once, and the follow counts tick up. Show strikes lightning down that badge's cable
// and decodes the address into the readout line; the button then copies it.
//
// Loaded with the game (index.js) or by the idle footer on the first Show / focus, so
// idle pages never load it. The sway runs only while the section is powered and on
// screen. Reduced motion: everything is powered on at once with the final numbers; no
// sparks, sway, swing, lightning or scramble.
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
  let arcs = null;
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
    arcs = document.createElementNS(SVG, "g");
    arcs.setAttribute("class", "arcs");
    svg.append(arcs);
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

  // ---- Show: lightning down the cable, the address decodes into the readout ----
  const jag = (a, b) => {
    let d = `M${a.x.toFixed(0)} ${a.y.toFixed(0)}`;
    const n = 7;
    for (let s = 1; s <= n; s++) {
      const t = s / n;
      const x = a.x + (b.x - a.x) * t + (s < n ? Math.random() * 40 - 20 : 0);
      const y = a.y + (b.y - a.y) * t + (s < n ? Math.random() * 16 - 8 : 0);
      d += ` L${x.toFixed(0)} ${y.toFixed(0)}`;
    }
    return d;
  };
  const GLYPHS = "!<>-_\\/[]{}=+*^?#%@01";
  function reveal(btn) {
    const badge = btn.closest(".bt-tts-pw-b");
    const row = btn.closest("[data-mail-domain]");
    if (!badge || !row) return;
    const address = `${btn.dataset.mailUser}@${row.dataset.mailDomain}`;
    if (btn.dataset.revealed) {
      navigator.clipboard?.writeText(address).then(() => { btn.textContent = "Copied"; }, () => { btn.textContent = "Copy"; });
      return;
    }
    btn.dataset.revealed = "1";
    btn.textContent = "Copy";
    btn.setAttribute("aria-label", `Copy ${address}`);
    if (!wires.length) layout();
    const w = wires.find((x) => x.el === badge);
    const ring = badge.querySelector(".bt-tts-pw-ring");
    if (w && !reduced()) {
      const arc = document.createElementNS(SVG, "path");
      arc.setAttribute("class", "arc");
      arc.style.setProperty("--pw-c", w.c);
      arc.setAttribute("d", jag(w.node, { x: w.x, y: w.y + 3 }));
      arcs?.replaceChildren(arc);
      ring.classList.remove("is-struck"); void ring.offsetWidth; ring.classList.add("is-struck");
    }
    badge.classList.add("is-on");
    w?.w.classList.add("lit");
    let line = readout.querySelector(`[data-for="${badge.dataset.pw}"]`);
    if (!line) {
      line = document.createElement("div");
      line.className = "bt-tts-pw-mail";
      line.dataset.for = badge.dataset.pw;
      line.style.setProperty("--pw-c", w?.c || colorOf(badge));
      readout.append(line);
    }
    const done = () => {
      const a = document.createElement("a");
      a.href = `mailto:${address}`;
      a.textContent = address;
      line.replaceChildren(a);
    };
    if (reduced()) return done();
    let f = 0;
    const total = 18;
    const tick = () => {
      f++;
      line.textContent = [...address].map((ch, i) => (i < (f / total) * address.length ? ch : GLYPHS[Math.floor(Math.random() * GLYPHS.length)])).join("");
      if (f < total) requestAnimationFrame(tick); else done();
    };
    later(tick, 180);
  }

  // ---- when to run ----
  const shown = () => root.dataset.cf === "1" || cf.matches(":focus-within");
  const check = () => { if (shown() && !powered) powerUp(); else if (!shown() && powered) powerDown(); };
  new MutationObserver(check).observe(root, { attributes: true, attributeFilter: ["data-cf"] });
  cf.addEventListener("focusin", check);
  cf.addEventListener("focusout", () => setTimeout(check, 0));
  new IntersectionObserver((es) => { visible = es.some((e) => e.isIntersecting); sync(); }).observe(cf);
  new ResizeObserver(() => { if (powered) layout(); }).observe(cf);
  document.addEventListener("visibilitychange", sync);
  check();

  root._power = { powerUp, powerDown, reveal, layout };
  return root._power;
}
