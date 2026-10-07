// shared/ui/marquee.js — .bt-marquee[data-frame] and .bt-flipclock, the H1 hero of /schedule (docs/design-system.md §5
// "Scream Planner pieces"). Text is escaped; arguments ending in Html are trusted markup.
//
//   FRAMES      the pool of 11 frames [id, name, blurb]: bulbs neon barbed drip tape film web electric vhs candles ecg.
//               "Surprise me" rolls only from these.
//   SEASONAL    4 frames picked by hand, never rolled: [id, name, blurb, season] jack, pumpkin (Halloween), blizzard,
//               snowman (Christmas). The snowman frame hides the mascot peek.
//   ALL_FRAMES, frameName(id), isSeasonal(id), rollFrame({ recent = [], current })   a pool id not in `recent` (last three weeks)
//   frameHtml(frame, { tapeTop, tapeBottom })   the frame layer's inner markup (decorative, aria-hidden by its wrapper)
//   marqueeHtml({ frame, kicker, icon, title, whenHtml, clockHtml, metaHtml, ctaHtml, coversHtml, peekHtml, mini, tag })
//        .bt-marquee[data-frame] with the neon kicker ("Tonight · Wed Oct 7"), the title (h1 by default; tag "h2"...),
//        the when line, the flip clock, the meta line, the buttons, two tilted covers and the mascot peek. peekHtml is the
//        mascot markup (default: the page's #bt-mascot-tpl when present).
//   miniMarqueeHtml({ frame, kicker, icon, title, metaHtml })   a small card-sized marquee (the publish dialog's gallery)
//   setMarqueeFrame(marquee, frame)   swap the frame on a live marquee
//   flipClockHtml({ startsAt, label })   .bt-flipclock role="timer": Hours : Min : Sec under 24 h, Days : Hours : Min above
//   initFlipClocks(root, { onZero(el) })  ticks every [data-flipclock] each second (flips only the digits that changed),
//                                         and the found-footage frame's REC counter; returns { stop() }
import { escapeHtml as esc } from "./dom.js";

export const FRAMES = [
  ["bulbs", "Chasing bulbs", "The classic theatre marquee. Two rings of bulbs blink out of step."],
  ["neon", "Busted neon", "Red and gold tubes that buzz. One corner keeps dying."],
  ["barbed", "Barbed wire", "Wire wrapped round the edge, swaying a little."],
  ["drip", "Blood drip", "The top edge bleeds. Drops swell, fall and vanish."],
  ["tape", "Crime scene", "Caution tape with tonight's time crawling along it."],
  ["film", "Film reel", "Sprocket holes rolling past, like an old horror print."],
  ["web", "Cobwebs", "Webs in the corners and a spider that drops in and climbs back."],
  ["electric", "Live wire", "A yellow current crackles round the whole border."],
  ["vhs", "Found footage", "VHS tracking, RGB split, scanlines and a REC counter."],
  ["candles", "Séance", "A row of candles flickering along the bottom edge."],
  ["ecg", "Flatline", "A heartbeat races along the top, and flatlines now and then."],
];
export const SEASONAL = [
  ["jack", "Jack-o'-lanterns", "Carved pumpkins grinning along the bottom, bats flitting over the top.", "Halloween"],
  ["pumpkin", "Pumpkin lights", "Orange, red and gold string lights swagged along the top.", "Halloween"],
  ["blizzard", "Blizzard", "Snow blowing across, icicles hanging off the top, a drift piling up below.", "Christmas"],
  ["snowman", "Snowman", "A candy-cane border and a snowman wrapped in blinking lights.", "Christmas"],
];
export const ALL_FRAMES = [...FRAMES, ...SEASONAL];
export const frameName = (id) => (ALL_FRAMES.find((f) => f[0] === id) || FRAMES[0])[1];
export const isSeasonal = (id) => SEASONAL.some((f) => f[0] === id);
export function rollFrame({ recent = [], current } = {}) {
  const pool = FRAMES.map((f) => f[0]).filter((id) => id !== current && !recent.includes(id));
  const from = pool.length ? pool : FRAMES.map((f) => f[0]);
  return from[Math.floor(Math.random() * from.length)];
}

const rnd = (i, k) => { const x = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453; return x - Math.floor(x); };
let uidN = 0;

export function frameHtml(f, { tapeTop = "CAUTION · TONIGHT · DO NOT MISS · ", tapeBottom = "SCREAM PLANNER · BOOMERTANGER · KEEP OUT · " } = {}) {
  const u = "bt-mqf" + ++uidN;
  switch (f) {
    case "bulbs": return `<span class="bt-marquee-bulbs"></span>`;
    case "neon": return `<i class="n1"></i><i class="n2"></i>`;
    case "barbed": return `<i class="e t"></i><i class="e b"></i><i class="e l"></i><i class="e r"></i>`;
    case "drip": return `<i class="bar"></i>${Array.from({ length: 16 }, (_, i) => `<i class="d" style="--x:${(3 + i * 6 + rnd(i, 1) * 3).toFixed(1)}%;--w:${(5 + rnd(i, 2) * 7).toFixed(0)}px;--h:${(10 + rnd(i, 3) * 38).toFixed(0)}px;--dl:${(rnd(i, 4) * 6).toFixed(2)}s;--du:${(3.5 + rnd(i, 5) * 4).toFixed(2)}s"></i>`).join("")}`;
    case "tape": { const tx = esc(tapeTop).repeat(6), bx = esc(tapeBottom).repeat(6); return `<i class="tp t"><span>${tx}</span><span>${tx}</span></i><i class="tp b"><span>${bx}</span><span>${bx}</span></i><i class="sd l"></i><i class="sd r"></i>`; }
    case "film": return `<i class="fs t"><i class="h"></i></i><i class="fs b"><i class="h"></i><em>SCREAM 400 · 14A ▸</em></i><i class="fs l"></i><i class="fs r"></i>`;
    case "web": {
      const web = (rot) => { let p = ""; const R = 120; for (let a = 0; a <= 90; a += 15) { const r = a * Math.PI / 180; p += `M0 0L${(Math.cos(r) * R).toFixed(1)} ${(Math.sin(r) * R).toFixed(1)}`; } [30, 55, 80, 105].forEach((rr) => { p += "M"; for (let a = 0; a <= 90; a += 15) { const r = a * Math.PI / 180, k = rr * (a % 30 ? 0.9 : 1); p += `${(Math.cos(r) * k).toFixed(1)} ${(Math.sin(r) * k).toFixed(1)} `; } }); return `<svg class="wb" style="transform:${rot}" viewBox="0 0 120 120" aria-hidden="true"><path d="${p}"/></svg>`; };
      return `<i class="dust"></i>${web("none")}<span class="wbr">${web("scaleX(-1)")}</span><span class="wbl">${web("scaleY(-1)")}</span><span class="spider"><i class="th"></i><svg viewBox="-12 -10 24 22" aria-hidden="true"><g class="lg"><path d="M-3 -2 L-10 -8 M-3 0 L-11 -1 M-3 2 L-10 6 M-2 3 L-7 10 M3 -2 L10 -8 M3 0 L11 -1 M3 2 L10 6 M2 3 L7 10"/></g><ellipse cx="0" cy="1" rx="4" ry="5"/><circle cx="0" cy="-4.5" r="2.6"/><circle class="ey" cx="-1" cy="-5" r=".7"/><circle class="ey" cx="1" cy="-5" r=".7"/></svg></span>`;
    }
    case "electric": return `<svg class="el" width="100%" height="100%" aria-hidden="true"><defs><filter id="${u}" x="-5%" y="-5%" width="110%" height="110%"><feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="2" seed="1"><animate attributeName="seed" values="1;3;5;7;9;11" dur="0.6s" repeatCount="indefinite" calcMode="discrete"/></feTurbulence><feDisplacementMap in="SourceGraphic" scale="9"/></filter></defs><rect class="gl" filter="url(#${u})"/><rect class="co" filter="url(#${u})"/></svg>`;
    case "vhs": return `<i class="vo r"></i><i class="vo c"></i><i class="vo bl"></i><i class="scan"></i><i class="trk"></i><span class="osd tl">● REC</span><span class="osd bl2">PLAY ▶</span><span class="osd br">SP <b data-vhs>00:13:47</b></span>`;
    case "candles": return `<i class="gl"></i>${Array.from({ length: 11 }, (_, i) => `<span class="cd" style="--x:${(4 + i * 9.2).toFixed(1)}%;--h:${(14 + rnd(i, 7) * 20).toFixed(0)}px;--w:${(9 + rnd(i, 8) * 6).toFixed(0)}px;--dl:${(rnd(i, 9) * 2).toFixed(2)}s"><i class="fl"></i><i class="wx"></i></span>`).join("")}`;
    case "ecg": { const beat = "h23 l4 -4 l4 4 h8 l3 4 l5 -26 l5 32 l4 -10 h10 l6 -6 l6 6 h22"; const path = "M0 20 " + Array(16).fill(beat).join(" "); return `<i class="ln"></i><span class="ekw"><svg viewBox="0 0 1600 40" preserveAspectRatio="none" aria-hidden="true"><path class="w" d="${path}"/><path class="f" d="M0 20 H1600"/></svg></span><span class="bpm">♥ <b>112</b> BPM</span>`; }
    case "jack": {
      const pk = (x, s, dl) => `<svg class="pk" viewBox="0 0 60 54" style="left:${x}%;width:${s}px;--dl:${dl}s" aria-hidden="true"><path class="st" d="M29 11 q0 -6 7 -9"/><ellipse class="o1" cx="18" cy="32" rx="14" ry="19"/><ellipse class="o1" cx="42" cy="32" rx="14" ry="19"/><ellipse class="o2" cx="30" cy="32" rx="14" ry="21"/><path class="rib" d="M30 12 v40 M20 15 q-6 17 0 34 M40 15 q6 17 0 34"/><g class="face"><path d="M17 27 l6 -8 l6 8z M31 27 l6 -8 l6 8z"/><path d="M14 36 q16 13 32 0 l-4 4 l-4 -4 l-4 5 l-4 -5 l-4 5 l-4 -5 l-4 4z"/></g></svg>`;
      const bat = (top, du, dl, s) => `<svg class="bat" viewBox="0 0 40 18" style="top:${top}px;width:${s}px;animation-duration:${du}s;animation-delay:${dl}s" aria-hidden="true"><path d="M20 7 q-3 -5 -6 -1 q-4 -6 -14 -2 q6 2 6 8 q4 -3 8 1 q2 -3 6 -1 q4 -2 6 1 q4 -4 8 -1 q0 -6 6 -8 q-10 -4 -14 2 q-3 -4 -6 1z"/></svg>`;
      return `<i class="glow"></i>${bat(14, 9, 0, 34)}${bat(30, 12, -5, 22)}${bat(8, 15, -9, 26)}${[[1, 44, 0], [7, 30, 0.7], [12.5, 36, 0.3], [80, 32, 0.9], [86, 48, 0.2], [93.5, 30, 0.6]].map(([x, s, d]) => pk(x, s, d)).join("")}`;
    }
    case "blizzard": {
      let ic = "M0 0 H1000 V6 "; for (let x = 1000; x > 0;) { const w = 14 + rnd(x, 3) * 26, h = 10 + rnd(x, 4) * 34; ic += `L${(x - w / 2).toFixed(0)} ${(6 + h).toFixed(0)} L${(x - w).toFixed(0)} 6 `; x -= w; } ic += "Z";
      const flakes = Array.from({ length: 46 }, (_, i) => `<i class="fk" style="left:${(rnd(i, 1) * 100).toFixed(1)}%;--s:${(2 + rnd(i, 2) * 4).toFixed(1)}px;--du:${(4 + rnd(i, 3) * 6).toFixed(2)}s;--dl:${(-rnd(i, 4) * 10).toFixed(2)}s;--dx:${(20 + rnd(i, 5) * 60).toFixed(0)}px"></i>`).join("");
      return `<i class="frost"></i>${flakes}<svg class="ice" viewBox="0 0 1000 50" preserveAspectRatio="none" aria-hidden="true"><path d="${ic}"/></svg><svg class="drift" viewBox="0 0 1000 40" preserveAspectRatio="none" aria-hidden="true"><path d="M0 40 V26 Q60 8 140 22 T300 18 T470 26 T640 14 T820 24 T1000 16 V40Z"/></svg>`;
    }
    case "snowman": {
      const flakes = Array.from({ length: 22 }, (_, i) => `<i class="fk" style="left:${(rnd(i, 6) * 100).toFixed(1)}%;--s:${(2 + rnd(i, 7) * 3).toFixed(1)}px;--du:${(7 + rnd(i, 8) * 6).toFixed(2)}s;--dl:${(-rnd(i, 9) * 12).toFixed(2)}s;--dx:${(10 + rnd(i, 10) * 30).toFixed(0)}px"></i>`).join("");
      const bulbs = [[34, 76], [52, 70], [70, 80], [30, 96], [50, 104], [72, 98], [38, 120], [62, 124], [44, 52], [58, 50]].map(([x, y], i) => `<circle class="lt l${i % 4}" cx="${x}" cy="${y}" r="3" style="animation-delay:${(i % 4) * 0.35}s"/>`).join("");
      return `<i class="cane"></i>${flakes}<svg class="sm" viewBox="0 0 100 150" aria-hidden="true"><circle class="sn" cx="50" cy="112" r="30"/><circle class="sn" cx="50" cy="70" r="22"/><circle class="sn" cx="50" cy="36" r="16"/><path class="arm" d="M30 66 L8 52 M14 56 l-6 -2 M70 66 L92 50 M86 54 l6 -4"/><rect class="hat" x="37" y="8" width="26" height="16" rx="2"/><rect class="hat" x="31" y="22" width="38" height="5" rx="2"/><rect class="band" x="37" y="18" width="26" height="4"/><circle class="coal" cx="44" cy="33" r="2"/><circle class="coal" cx="56" cy="33" r="2"/><path class="nose" d="M50 37 l14 3 l-14 3z"/><path class="scarf" d="M34 50 q16 8 32 0 l0 6 q-16 8 -32 0z M58 54 l4 18 l-7 0 l-2 -16z"/><circle class="coal" cx="50" cy="66" r="2"/><circle class="coal" cx="50" cy="76" r="2"/><path class="wire" d="M28 60 Q50 90 72 64 M24 92 Q50 116 78 88 M28 116 Q50 134 74 112 M40 48 Q50 56 62 46"/>${bulbs}</svg>`;
    }
    case "pumpkin": {
      const sw = 4, seg = 960 / sw; let d = "M 20 40";
      for (let s = 0; s < sw; s++) { const x0 = 20 + s * seg, x1 = x0 + seg; d += ` Q ${(x0 + x1) / 2} 130 ${x1} 40`; }
      const pts = Array.from({ length: 24 }, (_, i) => { const xv = 20 + (i + 0.5) * 960 / 24, t = ((xv - 20) % seg) / seg, yv = 40 + 180 * t * (1 - t); return [xv / 10, 4 + yv * 0.22]; });
      return `<svg class="wire" viewBox="0 0 1000 200" preserveAspectRatio="none" aria-hidden="true"><path d="${d}"/></svg>${pts.map(([x, y], i) => `<i class="pb ${["o", "r", "g"][i % 3]}" style="left:${x.toFixed(1)}%;top:${y.toFixed(1)}px;--dl:${(i % 3) * 0.45}s"></i>`).join("")}`;
    }
    default: return "";
  }
}

const layer = (f) => `<span class="bt-marquee-frame" aria-hidden="true">${frameHtml(f)}</span>`;
export function setMarqueeFrame(marquee, frame) {
  marquee.dataset.frame = frame;
  const l = marquee.querySelector(".bt-marquee-frame");
  if (l) l.innerHTML = frameHtml(frame);
  else marquee.insertAdjacentHTML("afterbegin", layer(frame));
}

function mascotTpl() {
  const t = typeof document !== "undefined" ? document.getElementById("bt-mascot-tpl") : null;
  return t ? t.innerHTML : "";
}

export function marqueeHtml({ frame = "bulbs", kicker = "", icon = "", title = "", whenHtml = "", clockHtml = "", metaHtml = "", ctaHtml = "", coversHtml = "", peekHtml, tag = "h1", label = "Next stream" } = {}) {
  const peek = peekHtml ?? mascotTpl();
  return `<section class="bt-marquee" data-frame="${esc(frame)}" aria-label="${esc(label)}">${layer(frame)}<span class="bt-marquee-fog" aria-hidden="true"></span>`
    + `<div class="bt-marquee-main">${kicker ? `<span class="bt-marquee-neon">${esc(kicker)}</span>` : ""}`
    + `<${tag} class="bt-title bt-marquee-title">${icon ? `<span class="bt-marquee-ic" aria-hidden="true">${esc(icon)}</span>` : ""}${esc(title)}</${tag}>`
    + (whenHtml ? `<div class="bt-marquee-when">${whenHtml}</div>` : "") + clockHtml
    + (metaHtml ? `<div class="bt-marquee-meta">${metaHtml}</div>` : "") + (ctaHtml ? `<div class="bt-marquee-cta">${ctaHtml}</div>` : "") + `</div>`
    + (coversHtml || peek ? `<div class="bt-marquee-art">${coversHtml}${peek ? `<span class="bt-marquee-peek" aria-hidden="true">${peek}</span>` : ""}</div>` : "") + `</section>`;
}

export function miniMarqueeHtml({ frame = "bulbs", kicker = "", icon = "", title = "", metaHtml = "" } = {}) {
  return `<div class="bt-marquee bt-marquee--mini" data-frame="${esc(frame)}">${layer(frame)}<span class="bt-marquee-fog" aria-hidden="true"></span>`
    + `<div class="bt-marquee-main">${kicker ? `<span class="bt-marquee-neon">${esc(kicker)}</span>` : ""}<span class="bt-marquee-mini-title">${icon ? `<i aria-hidden="true">${esc(icon)}</i>` : ""}${esc(title)}</span>${metaHtml ? `<span class="bt-meta">${metaHtml}</span>` : ""}</div></div>`;
}

// ---- flip clock ----
function parts(ms) {
  const s = Math.max(0, Math.floor(ms / 1000)), d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return d >= 1 ? { mode: "dhm", v: [Math.min(d, 99), h, m], lab: ["Days", "Hours", "Min"] } : { mode: "hms", v: [h, m, sec], lab: ["Hours", "Min", "Sec"] };
}
const two = (n) => String(n).padStart(2, "0");
const spoken = (p) => `${p.v[0]} ${p.lab[0].toLowerCase()} ${p.v[1]} ${p.lab[1] === "Min" ? "minutes" : p.lab[1].toLowerCase()}`;

export function flipClockHtml({ startsAt, label = "Starts in" } = {}) {
  const at = new Date(startsAt).getTime(), p = parts(at - Date.now());
  const digits = p.v.map(two).join("");
  const groups = [0, 1, 2].map((g) => `<div class="bt-flipclock-g"><div class="bt-flipclock-ds">${[0, 1].map((i) => `<span class="bt-flipclock-d" data-d="${g * 2 + i}">${digits[g * 2 + i]}</span>`).join("")}</div><small data-lab>${p.lab[g]}</small></div>${g < 2 ? `<span class="bt-flipclock-sep" aria-hidden="true">:</span>` : ""}`).join("");
  return `<div class="bt-flipclock" role="timer" data-flipclock data-starts-at="${esc(new Date(at).toISOString())}" data-label="${esc(label)}" aria-label="${esc(label)} ${esc(spoken(p))}">${groups}</div>`;
}

export function initFlipClocks(root = document, { onZero } = {}) {
  const clocks = [...root.querySelectorAll("[data-flipclock]")];
  let rec = 827;
  const tick = () => {
    clocks.forEach((el) => {
      const left = new Date(el.dataset.startsAt).getTime() - Date.now(), p = parts(left), digits = p.v.map(two).join("");
      el.querySelectorAll("[data-d]").forEach((d) => {
        const v = digits[+d.dataset.d];
        if (d.textContent !== v) { d.textContent = v; d.classList.remove("is-flip"); void d.offsetWidth; d.classList.add("is-flip"); }
      });
      el.querySelectorAll("[data-lab]").forEach((l, i) => { if (l.textContent !== p.lab[i]) l.textContent = p.lab[i]; });
      const a = `${el.dataset.label} ${spoken(p)}`;
      if (el.getAttribute("aria-label") !== a) el.setAttribute("aria-label", a);   // changes once a minute
      const zero = left <= 0;
      if (zero && !el.classList.contains("is-zero")) { el.classList.add("is-zero"); onZero?.(el); }
      else if (!zero) el.classList.remove("is-zero");
    });
    root.querySelectorAll("[data-vhs]").forEach((el) => { rec += 1; el.textContent = `00:${two(Math.floor(rec / 60) % 60)}:${two(rec % 60)}`; });
  };
  tick();
  const t = setInterval(tick, 1000);
  return { stop: () => clearInterval(t) };
}
