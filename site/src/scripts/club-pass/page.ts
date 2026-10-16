// /club-pass (docs/specs/club-pass.md §3): the viewer, the perk board and its spread, the pass press, the gold moment, the back cover's tear
// and the cover's Twitch sticker. No reads beyond the auth state, no writes, no checkout (payments are off: site.json clubPass.payments).
//   The viewer: visitor, fan (a signed-up member) or sub (the "sub" role in the ID token). Off production, ?as=member previews Fan Club and
//   ?as=sub Sub Club while signed out; a real signed-in member always wins. The perk board starts on the viewer's own pass ("No pass" for
//   visitors).
import { onAuth, type AuthState } from "../../lib/auth";
import { isProduction } from "../../lib/env";
import { spreadHead, isLongHead, turnSpread } from "../../../../shared/ui/spread.js";
import { initChat } from "../../../../shared/ui/chat.js";
import { bindAdmit } from "../../../../shared/ui/admit.js";
import { escapeHtml as esc } from "../../../../shared/ui/dom.js";
import data from "../../data/club-pass.json";
import { scene } from "./scenes";

type Pass = "visitor" | "fan" | "sub";
interface Perk { id: string; section: string; icon: string; label: string; plan: "fan" | "fan+" | "sub"; soon: boolean; kicker: string; head: string; dek: string; facts: string[]; pull: string; scene: string; serviceId?: string }

const root = document.getElementById("cp-root");
if (root) init(root);

function init(root: HTMLElement) {
  const P = (data as { perks: Perk[] }).perks;
  const $ = <T extends HTMLElement = HTMLElement>(s: string, r: ParentNode = root) => r.querySelector<T>(s);
  const $$ = <T extends HTMLElement = HTMLElement>(s: string, r: ParentNode = root) => [...r.querySelectorAll<T>(s)];
  const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
  const PAY = root.dataset.pay === "on";
  const PRICE = root.dataset.price || "$5.99";
  const mascot = (style = "") => {
    const t = document.getElementById("cp-mascot-src") as HTMLTemplateElement | null;
    const svg = t ? t.innerHTML.trim() : "";
    return style ? svg.replace("<svg", `<svg style="${style}"`) : svg;
  };
  const S = { viewer: "visitor" as Pass, name: "", pass: "visitor" as Pass, cur: 0, playing: 0 as number, chosen: false };

  // ---------- the viewer ----------
  const preview = (): Pass | null => {
    if (isProduction) return null;
    const as = new URLSearchParams(location.search).get("as");
    return as === "sub" ? "sub" : as === "member" || as === "fan" ? "fan" : as === "visitor" ? "visitor" : null;
  };
  function viewerOf(s: AuthState): { pass: Pass; name: string } {
    const member = !!s.user && s.status !== "needsSignup" && s.status !== "loading";
    if (member) return { pass: s.roles.includes("sub") ? "sub" : "fan", name: s.profile?.handle ? `@${s.profile.handle}` : "" };
    const pv = preview();
    return pv ? { pass: pv, name: pv === "visitor" ? "" : "@member" } : { pass: "visitor", name: "" };
  }
  // (the viewer is applied by onAuth at the end of init, once the board exists)

  // ---------- sparks (the gold press) ----------
  function sparks(host: HTMLElement, x: number, y: number, n = 18) {
    if (reduced()) return;
    for (let i = 0; i < n; i++) {
      const s = document.createElement("span"); s.className = "cp-spark";
      const a = Math.random() * Math.PI * 2, d = 40 + Math.random() * 90;
      s.style.left = `${x}px`; s.style.top = `${y}px`;
      s.style.setProperty("--dx", `${Math.cos(a) * d}px`); s.style.setProperty("--dy", `${Math.sin(a) * d}px`); s.style.setProperty("--r", `${Math.random() * 360}deg`);
      host.appendChild(s); setTimeout(() => s.remove(), 1000);
    }
  }

  // ---------- 03 the pass press ----------
  const press = $("[data-cp-press]");
  if (press) {
    const rider = $("[data-cp-rider]", press)!, rpass = $("[data-cp-rider-pass]", press)!, plan = $("[data-cp-rider-plan]", press)!;
    const stations = $$(".cp-hw-station", press);
    let timers: number[] = [];
    const clear = () => { timers.forEach(clearTimeout); timers = []; };
    const setStep = (n: number) => {
      press.dataset.step = String(n);
      rider.classList.toggle("has-name", n >= 1); rider.classList.toggle("has-plan", n >= 2);
      rpass.classList.toggle("bt-pass--sub", n >= 3);
      plan.textContent = n >= 3 ? "SUB CLUB" : "FAN CLUB";
      press.classList.toggle("is-gold", n >= 3);
      stations.forEach((s, i) => s.classList.toggle("is-done", i < n));
      $$("[data-step-go]", press).forEach((b) => b.classList.toggle("is-active", b.dataset.stepGo === String(n)));
    };
    const hit = (n: number) => {
      if (reduced()) { setStep(n); return; }
      press.classList.add("is-running"); setStep(n);
      timers.push(window.setTimeout(() => {
        press.classList.remove("is-running"); stations[n - 1].classList.add("is-hit");
        if (n === 3) {
          const r = rider.getBoundingClientRect(), h = press.getBoundingClientRect();
          sparks(press, r.left - h.left + r.width / 2, r.top - h.top + 10, 26);
          const f = $("[data-cp-flash]", press); if (f) { f.classList.remove("is-on"); void f.offsetWidth; f.classList.add("is-on"); }
        }
      }, 900));
      timers.push(window.setTimeout(() => stations[n - 1].classList.remove("is-hit"), 1250));
    };
    const playAll = () => { clear(); setStep(0); if (reduced()) { setStep(3); return; } [1, 2, 3].forEach((n, i) => timers.push(window.setTimeout(() => hit(n), 300 + i * 1500))); };
    $$("[data-step-go]", press).forEach((b) => b.addEventListener("click", () => { clear(); if (b.dataset.stepGo === "play") playAll(); else hit(Number(b.dataset.stepGo)); }));
    new IntersectionObserver((es, io) => { if (es[0].isIntersecting) { playAll(); io.disconnect(); } }, { threshold: 0.5 }).observe(press);
  }

  // ---------- 04 the gold moment ----------
  const gold = $("[data-cp-gold]"), gbtn = $<HTMLButtonElement>("[data-cp-gold-btn]");
  if (gold && gbtn) gbtn.addEventListener("click", () => {
    const on = !gold.classList.contains("is-gold");
    gold.classList.toggle("is-gold", on);
    $("[data-cp-gold-pass]", gold)!.classList.toggle("bt-pass--sub", on);
    $("[data-cp-gold-plan]", gold)!.textContent = on ? "SUB CLUB" : "FAN CLUB";
    $("[data-cp-gold-price]", gold)!.textContent = on ? `${PRICE} / MONTH` : "FREE";
    gbtn.textContent = on ? "Play it again" : "Feel the gold moment";
    $(".cp-welcome", gold)?.remove();
    if (!on) return;
    const st = document.createElement("span");
    st.className = "bt-stamp bt-stamp--sm cp-welcome"; st.setAttribute("role", "img"); st.setAttribute("aria-label", "Welcome to Sub Club");
    st.innerHTML = '<span aria-hidden="true">Welcome<small>to Sub Club</small></span>';
    gold.appendChild(st);
    if (reduced()) return;
    const w = gold.clientWidth, cols = ["var(--bt-title)", "var(--bt-lamp)", "var(--bt-pass-fan)", "var(--bt-fuse)"];
    for (let i = 0; i < 70; i++) {
      const c = document.createElement("span"); c.className = "cp-confetti";
      c.style.left = `${Math.random() * w}px`; c.style.background = cols[i % cols.length];
      c.style.setProperty("--dx", `${Math.random() * 120 - 60}px`); c.style.setProperty("--r", `${Math.random() * 720 - 360}deg`); c.style.setProperty("--d", `${1.2 + Math.random() * 1.2}s`);
      c.style.animationDelay = `${Math.random() * 0.3}s`;
      gold.appendChild(c); setTimeout(() => c.remove(), 3000);
    }
  });

  // ---------- 02 the perk board and the spread ----------
  const board = $("[data-cp-board]")!, spread = $("[data-cp-spread]")!, page = $("[data-cp-page]")!;
  const SECTIONS: [string, string][] = [["watch", "Watch"], ["play", "Play"], ["inside", "Inside"], ["you", "You"]];
  $("[data-cp-groups]")!.innerHTML = SECTIONS.map(([k, label]) => `<div class="cp-board-group"><span class="bt-label">${label}</span><div class="cp-board-tiles">${P.map((p, i) => p.section === k
    ? `<button class="cp-board-tile" type="button" data-i="${i}" aria-pressed="false" aria-label="${esc(p.label)}${p.soon ? ", coming soon" : ""}"><span class="cp-board-tile-ic" aria-hidden="true">${p.icon}</span><b>${esc(p.label)}</b><em>p.${String(i + 1).padStart(2, "0")}</em>${p.soon ? '<span class="cp-board-soon">Soon</span>' : ""}</button>` : "").join("")}</div></div>`).join("");
  const tiles = $$<HTMLButtonElement>(".cp-board-tile", board);
  const has = (p: Perk, ps: Pass) => ps === "sub" || (ps === "fan" && p.plan !== "sub");

  function light() {
    board.dataset.pass = S.pass;
    let n = 0, k = 0;
    tiles.forEach((b, i) => { const lit = has(P[i], S.pass); if (lit) n++; b.style.setProperty("--d", String(lit ? k++ * 35 : 0)); b.classList.toggle("is-lit", lit); b.classList.toggle("is-gold", lit && S.pass === "sub"); });
    $("[data-cp-count]", board)!.textContent = `${n} of ${P.length}`;
    $("[data-cp-bar]", board)!.style.width = `${(n / P.length) * 100}%`;
    $("[data-cp-say]", board)!.textContent = S.pass === "visitor" ? "Pick a pass to light up the board." : S.pass === "fan" ? "perks open with the free Fan Club pass." : "Every perk. The whole board goes gold.";
  }
  function setPass(v: Pass) { S.pass = v; $$("[data-map]", board).forEach((x) => x.setAttribute("aria-pressed", String(x.dataset.map === v))); light(); }

  function status(p: Perk): [string, string] {
    if (p.soon && has(p, S.pass)) return [`Coming soon${p.plan === "sub" ? " to Sub Club" : ""}`, "It's being built now. Your pass gets it the day it lands."];
    if (has(p, S.pass)) return [S.pass === "sub" && p.plan !== "fan" ? "Yours with your gold pass" : "Yours with Fan Club", p.plan === "fan+" && S.pass === "fan" ? "Sub Club adds more here." : "Included, nothing extra to pay."];
    if (S.pass === "visitor") return ["Join free to unlock", p.plan === "sub" ? "This one comes with Sub Club." : "This comes with the free Fan Club pass."];
    return ["Sub Club adds this", `Go gold for ${PRICE} a month, or link your Twitch sub.`];
  }
  function cta(p: Perk) {
    if (S.viewer === "visitor" && S.pass === "visitor") return `<button class="bt-btn bt-btn--primary" type="button" data-signin="join" data-signin-title="Join free for your Fan Club pass" data-pulse="spread-join-free">Join free</button>`;
    if (S.viewer !== "sub" && !has(p, S.pass)) return PAY ? `<button class="bt-btn bt-btn--primary" type="button" data-cp-buy="spread-get-sub-club" data-pulse="spread-get-sub-club">Get Sub Club</button>` : `<button class="bt-btn bt-btn--secondary" type="button" disabled>Sub Club opening soon</button>`;
    return "";
  }
  function pageHtml(i: number) {
    const p = P[i];
    const stamp = p.plan === "sub"
      ? `<span class="bt-stamp" role="img" aria-label="Sub Club, gold pass"><span aria-hidden="true">Sub Club<small>gold pass</small></span></span>`
      : `<span class="bt-stamp is-fan" role="img" aria-label="Fan Club, ${p.plan === "fan+" ? "plus gold" : "included"}"><span aria-hidden="true">Fan Club<small>${p.plan === "fan+" ? "plus gold" : "included"}</small></span></span>`;
    const art = scene(p.scene, { mascot: mascot("width:100%;position:static"), name: S.name || "YOUR NAME", sub: S.pass === "sub" });
    const [st1, st2] = status(p);
    return `<div class="bt-spread-mast"><b>Club Pass</b><span>The perks · Issue 01</span><span>p.${String(i + 1).padStart(2, "0")} of ${P.length}</span></div>
      <div class="bt-spread-body">
        <div class="bt-spread-copy">
          <p class="bt-spread-kicker">${esc(p.kicker)}</p>
          <h3 class="bt-spread-head${isLongHead(p.head) ? " bt-spread-head--long" : ""}">${spreadHead(p.head)}</h3>
          <p class="bt-spread-dek">${esc(p.dek)}</p>
          <ul class="bt-spread-facts">${p.facts.map((f, k) => `<li style="--i:${k}"><span>${f}</span></li>`).join("")}</ul>
        </div>
        <div class="bt-spread-art"><div class="bt-spread-art-in" aria-hidden="true">${art}</div>${p.soon ? '<span class="bt-badge bt-badge--gold bt-spread-soon">Coming soon</span>' : ""}${stamp}</div>
      </div>
      <p class="bt-spread-pull">${esc(p.pull)}</p>
      <div class="bt-spread-foot">
        <div class="bt-spread-status"><b>${st1}</b><span>${st2}</span></div>
        ${cta(p)}
        <div class="bt-spread-nav">
          <button class="bt-btn bt-btn--secondary" type="button" data-pg="-1" aria-label="Previous page">←</button>
          <button class="bt-btn bt-btn--secondary" type="button" data-play data-pulse="flip-through">${S.playing ? "❚❚ Pause" : "▶ Flip through"}</button>
          <button class="bt-btn bt-btn--secondary" type="button" data-pg="1" aria-label="Next page">→</button>
        </div>
      </div>`;
  }
  function renderPage(i: number, animate = true) {
    S.cur = i;
    spread.dataset.tone = P[i].plan === "fan" ? "fan" : "sub";
    tiles.forEach((b, k) => b.setAttribute("aria-pressed", String(k === i)));
    turnSpread(spread, page, pageHtml(i), { animate });
  }
  const go = (d: number) => renderPage((S.cur + d + P.length) % P.length);
  function stopPlay() {
    if (!S.playing) return;
    clearInterval(S.playing); S.playing = 0; spread.classList.remove("is-playing");
    const b = $("[data-play]", page); if (b) b.textContent = "▶ Flip through";
  }
  function startPlay() {
    stopPlay();
    const tick = () => { spread.classList.remove("is-playing"); void spread.offsetWidth; spread.classList.add("is-playing"); };
    S.playing = window.setInterval(() => { go(1); tick(); }, 6000); tick();
    const b = $("[data-play]", page); if (b) b.textContent = "❚❚ Pause";
  }
  page.addEventListener("click", (e) => {
    const t = e.target as Element;
    const pg = t.closest<HTMLElement>("[data-pg]"); if (pg) { stopPlay(); go(Number(pg.dataset.pg)); return; }
    if (t.closest("[data-play]")) { if (S.playing) stopPlay(); else startPlay(); }
  });
  spread.addEventListener("keydown", (e) => {
    if (e.target !== spread) return;
    if (e.key === "ArrowRight") { stopPlay(); go(1); }
    if (e.key === "ArrowLeft") { stopPlay(); go(-1); }
  });
  tiles.forEach((b, i) => b.addEventListener("click", () => {
    stopPlay(); renderPage(i);
    const r = spread.getBoundingClientRect();
    if (r.top > innerHeight * 0.6 || r.bottom < 80) spread.scrollIntoView({ behavior: reduced() ? "auto" : "smooth", block: "start" });
  }));
  $$("[data-map]", board).forEach((b) => b.addEventListener("click", () => { S.chosen = true; setPass(b.dataset.map as Pass); renderPage(S.cur, false); }));
  $$("[data-open]").forEach((a) => a.addEventListener("click", () => { const i = P.findIndex((p) => p.id === a.dataset.open); if (i >= 0) { stopPlay(); renderPage(i, false); } }));

  setPass("visitor"); renderPage(0, false);
  onAuth((s) => {
    if (s.status === "loading" && !preview()) return;
    const v = viewerOf(s);
    if (v.pass === S.viewer && v.name === S.name && root.dataset.ready) return;
    S.viewer = v.pass; S.name = v.name;
    root.dataset.viewer = v.pass; root.dataset.ready = "1";
    $$("[data-passname]").forEach((n) => (n.textContent = v.name || "YOUR NAME HERE"));
    if (!S.chosen) setPass(v.pass);
    renderPage(S.cur, false);
  });
  // Arriving at /club-pass#ch-perks (My pass's See your perks / See what Sub Club adds): land on the chapter heading (#ch-perks has its
  // own scroll-margin in club-pass.css), again once the page has finished loading (the board and fonts move it), unless the visitor has
  // scrolled since. The scroll event after each landing lets the rail (shared/ui/toc.js) light up "The perks" even when nothing moved.
  if (location.hash === "#ch-perks") {
    const chapter = document.getElementById("ch-perks")!;
    const land = () => { chapter.scrollIntoView({ block: "start", behavior: "auto" }); dispatchEvent(new Event("scroll")); };
    let moved = false;
    requestAnimationFrame(land);
    addEventListener("wheel", () => (moved = true), { once: true, passive: true });
    addEventListener("touchmove", () => (moved = true), { once: true, passive: true });
    addEventListener("keydown", () => (moved = true), { once: true });
    if (document.readyState === "complete") setTimeout(land, 0); else addEventListener("load", () => { if (!moved) land(); }, { once: true });
  }
  initChat(root as unknown as Document, { question: ".cp-q" });   // 09's letter cards: one open at a time, the typing moment   // the helpers take any element; their JS default (document) types the parameter
  bindAdmit(root as unknown as Document);
  aimSticker(root);
}

// ---------- the cover's Twitch sticker: aim the arrow tip at the middle of "Already", never over the pass ----------
// It sits in the normal flow above the Twitch cover line and slides left (margin-right) until the arrow's tip is over the word. It never
// goes further left than 14px right of the gold pass (on phones, the column's left edge). Re-measured on resize, after the fonts load and
// after the entrance animation.
function aimSticker(root: HTMLElement) {
  const st = root.querySelector<HTMLElement>("a.cp-sticker"), aim = root.querySelector<HTMLElement>(".cp-aim");
  const arrow = st?.querySelector<SVGElement>(".cp-sticker-arrow");
  const col = root.querySelector<HTMLElement>(".cp-lines--r"), pass = root.querySelector<HTMLElement>(".cp-star .bt-pass");
  if (!st || !aim || !arrow || !col || !pass) return;
  const place = () => {
    if (root.clientWidth <= 640) {
      // Phones (P1): the sticker starts at the column's left edge above 05 and slides right until the tip is over "Already", never past the column
      st.style.marginRight = ""; st.style.marginLeft = "0px";
      const a = arrow.getBoundingClientRect(), t = aim.getBoundingClientRect(), s = st.getBoundingClientRect(), c = col.getBoundingClientRect();
      const move = Math.min(Math.max(0, t.left + t.width / 2 - (a.left + a.width * (29 / 50))), Math.max(0, c.right - s.right));
      st.style.marginLeft = `${move}px`;
      return;
    }
    st.style.marginLeft = "";
    st.style.marginRight = "0px";
    const a = arrow.getBoundingClientRect(), t = aim.getBoundingClientRect();
    const tip = a.left + a.width * (29 / 50), target = t.left + t.width / 2;   // the tip is at x=29 of the arrow's 50-wide viewBox
    let shift = Math.max(0, tip - target);
    const s = st.getBoundingClientRect();
    const phone = root.clientWidth <= 640;
    const minLeft = phone ? col.getBoundingClientRect().left : pass.getBoundingClientRect().right + 14;
    if (s.left - shift < minLeft) shift = Math.max(0, s.left - minLeft);
    st.style.marginRight = `${shift}px`;
  };
  new ResizeObserver(place).observe(root);
  addEventListener("load", place);
  document.fonts?.ready.then(place);
  setTimeout(place, 50);
  setTimeout(place, 2300);   // after the cover's entrance animation
}
