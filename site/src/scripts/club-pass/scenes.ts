// The scene drawings in each perk's .bt-spread art box (docs/specs/club-pass.md §3 item 4; mockup docs/design/mockups/club-pass.html).
// One key per scene; scripts/check-club-pass.js keeps the same list, so a perk can't name a scene that doesn't exist. Every scene is
// decoration (the art box is aria-hidden by its stamp and text): the words that matter are in the spread itself. Colours are the page's
// tokens (styles/club-pass.css cp-sc-*); reduced motion stops the movement there.
//   scene(key, { mascot, name, sub })   mascot: the real mascot SVG; name: the viewer's handle or YOUR NAME; sub: the Sub Club pass is lit
import { escapeHtml as esc } from "../../../../shared/ui/dom.js";

const ROAD = ["Rebuild", "Relaunch", "Grow", "Break out", "Halloween", "The Game Awards"];
const PINS = ["👁", "💀", "🕯️", "🔪", "🩸", "🎃"];

export interface SceneCtx { mascot: string; name: string; sub: boolean }

const SCENES: Record<string, (c: SceneCtx) => string> = {
  curtain: (c) => `<span class="cp-sc-spot"></span><span class="cp-sc-onair">BACKSTAGE</span><div class="cp-sc-center cp-sc-w26">${c.mascot}</div><span class="cp-sc-curt cp-sc-curt--l"></span><span class="cp-sc-curt cp-sc-curt--r"></span>`,
  ballot: () => `<div class="cp-sc-center cp-sc-ballot"><div>Granny<i style="width:100%"></i></div><div>Your pick<i style="width:72%"></i></div><div>Their pick<i style="width:45%"></i></div></div>`,
  moon: (c) => `<span class="cp-sc-moon"></span><div class="cp-sc-cal">${"<i></i>".repeat(17)}<i class="on"></i>${"<i></i>".repeat(10)}</div><div class="cp-sc-moon-m">${c.mascot}</div>`,
  cards: () => `<span class="cp-sc-card">Hot Seat</span><span class="cp-sc-card">Would you rather…</span><span class="cp-sc-card">Called it!</span>`,
  drop: () => `<span class="cp-sc-banner">A BADGE IS DROPPING · CLAIM IT</span><span class="cp-sc-coin">👁</span><span class="cp-sc-fuse"><i></i></span>`,
  flame: (c) => `<div class="cp-sc-center cp-sc-tc"><span class="cp-sc-flame">🔥</span></div><span class="cp-sc-savers"><i class="f"></i><i class="f"></i><i class="${c.sub ? "f" : ""}"></i></span>`,
  arcade: () => `<div class="cp-sc-center cp-sc-cab"><span class="cp-sc-cab-screen">INSERT COIN</span><span class="cp-sc-cab-stick"></span></div>`,
  mixer: () => `<div class="cp-sc-center cp-sc-mixer">${[30, 60, 45, 80, 20].map((v, i) => `<div><b style="--v:${v}%"></b><span style="--y:${20 + i * 10}px"></span></div>`).join("")}</div>`,
  climb: () => `<svg class="cp-sc-climb" viewBox="0 0 300 140" preserveAspectRatio="none" aria-hidden="true"><path class="base" d="M0 138H300"/><path d="M0 130 C30 126 50 120 80 112 S130 96 160 84 S220 50 250 36 S285 14 300 8"/></svg>`,
  // The Goal Tracker's public teaser doesn't say which level is current, so no level is highlighted; the last one is the boss.
  road: () => `<div class="cp-sc-center cp-sc-road">${ROAD.map((t, i) => `<span style="--i:${i}" class="${i === ROAD.length - 1 ? "boss" : ""}">${t}</span>`).join("")}</div>`,
  stars: () => `<div class="cp-sc-center cp-sc-stars">${[1, 1, 1, 1, 0].map((o, i) => `<i style="--i:${i}" class="${o ? "on" : ""}">★</i>`).join("")}</div>`,
  trophy: (c) => `<div class="cp-sc-center cp-sc-case">${PINS.map((e, k) => { const on = c.sub || k < 3; return `<i style="--i:${k}" class="${on ? "" : "empty"}">${on ? e : ""}</i>`; }).join("")}</div>`,
  phone: () => `<div class="cp-sc-center cp-sc-phone"><b><small>LIVE NOW</small>Boomertanger is live. Come scream.</b></div>`,
  bars: () => `<div class="cp-sc-center cp-sc-bars">${[30, 45, 40, 62, 70, 88].map((h, i) => `<i style="--h:${h}%;--i:${i}"></i>`).join("")}</div><span class="cp-sc-env">✉️</span>`,
  credits: (c) => `<div class="cp-sc-credits"><div><small>BUILDING BOOMERTANGER</small><b>Created by Boomertanger</b><small>SUB CLUB</small><b>@sample_one</b><b class="you">${esc(c.name)}</b><b>@sample_two</b><b>@sample_three</b></div></div>`,
  raffle: () => `<div class="cp-sc-center cp-sc-raffle"><span class="cp-sc-hat">🎩</span>${[0, 1, 2, 3, 4].map((i) => `<i style="--i:${i}">🎟️</i>`).join("")}</div><span class="cp-sc-check">✓ CHECKED IN</span>`,
  shelf: () => `<div class="cp-sc-center cp-sc-shelf">${["NIGHT 1", "THE HALL", "BASEMENT", "DOLLHOUSE", "STATIC"].map((t, i) => `<span style="--i:${i}">${t}</span>`).join("")}</div><span class="cp-sc-shelf-sign">BOOMGAMES.TV</span>`,
  mag: () => `<div class="cp-sc-center cp-sc-mag"><small>NO. 01 · SAMPLE</small><b>BOOMER<br>TANG</b><span>The monthly horror edition</span></div>`,
  merch: (c) => `<div class="cp-sc-center cp-sc-tee">${c.mascot}</div><span class="cp-sc-tag">SUB CLUB<br><b>${esc(document.getElementById("cp-root")?.dataset.discount || "10")}% OFF</b></span>`,
  pass: (c) => `<div class="cp-sc-center cp-sc-pass"><div class="bt-pass${c.sub ? " bt-pass--sub" : ""}"><span class="bt-pass-top">CLUB PASS</span>${c.mascot}<span class="bt-pass-plan">${c.sub ? "SUB CLUB" : "FAN CLUB"}</span><span class="bt-pass-name">${esc(c.name)}</span></div></div>`,
};

export const SCENE_KEYS = Object.keys(SCENES);
export function scene(key: string, c: SceneCtx): string {
  return (SCENES[key] || (() => ""))(c);
}
