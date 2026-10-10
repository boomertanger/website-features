// site/src/scripts/tech-stack/scenes.ts — the Tech Stack's built-at-build-time scenes (docs/specs/tech-stack.md §4), ported from the approved mockup:
// the hero (the real photos with a pulse along the cables) and chapter 1's six stage-card scenes. Their states are CSS (styles/tech-stack.css):
// the power-on flicker when the chapter scrolls into view, the idle loops, and the play state on hover, focus or tap (.is-play, .is-demo).
// Reduced motion: the final frame, no pulse, no loops. Photos come from Cloudinary; a scene photo that's missing just doesn't show.
import { DEV, photoUrl } from "./data";
import { PLATFORM_ICONS } from "../../data/footer-icons.js";

/** A photo inside a scene svg at x, y, width w (height from the cut-out's shape, or 0.62 × w for a card photo). */
function IMG(id: string, x: number, y: number, w: number, cls = "") {
  const d = DEV[id], P = d?.views.photo, pid = d ? (d.photo.desk || d.photo.card) : `tech-stack/card/${id}`;
  const src = photoUrl(pid, w * 2.5);
  if (!src) return "";
  const h = P && d?.photo.desk ? (w * P.h) / P.w : w * 0.62;
  return `<image${cls ? ` class="${cls}"` : ""} href="${src}" x="${x}" y="${y}" width="${w}" height="${h.toFixed(1)}" preserveAspectRatio="xMidYMid meet"/>`;
}
/** A platform pill with its official mark (the footer's icons). */
const PLAT = (x: number, y: number, label: string, cls: string, k: "twitch" | "youtube" | "tiktok") =>
  `<g class="ts-sx-plat ${cls}" transform="translate(${x} ${y})"><rect width="74" height="22" rx="11"/><path class="ts-sx-mark ts-sx-pc--${k}" transform="translate(5 4) scale(.583)" d="${PLATFORM_ICONS[k]}"/><text x="23" y="15" class="ts-sx-pl">${label}</text></g>`;

export function heroScene() {
  const im = (id: string, cx: number, cy: number, w: number) => {
    const d = DEV[id], P = d.views.photo!, h = (w * P.h) / P.w, src = photoUrl(d.photo.desk, w * 2.5);
    return src ? `<image href="${src}" x="${cx - w / 2}" y="${(cy - h / 2).toFixed(1)}" width="${w}" height="${h.toFixed(1)}"/>` : "";
  };
  const p1 = "M330 196 C330 252 178 252 178 226", p2 = "M178 226 C178 252 78 252 78 196", p3 = "M78 196 C78 90 210 70 210 104";
  return `<svg class="ts-hs" viewBox="0 0 480 270" preserveAspectRatio="xMinYMid meet" aria-hidden="true" focusable="false">
    <path class="ts-cable ts-hs-cable" data-sig="video" d="${p1}"/><path class="ts-cable ts-hs-cable" data-sig="usb" d="${p2}"/><path class="ts-cable ts-hs-cable" data-sig="video" d="${p3}"/>
    ${im("g7a", 210, 110, 190)}${im("link", 210, 36, 34)}${im("sp", 78, 178, 74)}${im("gp", 330, 178, 86)}${im("hd60x", 178, 228, 70)}${im("sm7", 268, 196, 62)}
    <circle class="ts-pulse ts-hs-pulse" data-sig="video" r="5"><animateMotion dur="3.2s" repeatCount="indefinite" path="${p1} L178 226 ${p2.replace("M178 226", "")} L78 196 ${p3.replace("M78 196", "")}"/></circle>
  </svg>`;
}

/** Chapter 1's six stage cards: [title, text, scene svg]. uid keeps the clip path id unique. */
export function stageScenes(uid = "a"): [string, string, string][] {
  const vu = (x: number, d: number) => { let s = ""; for (let i = 0; i < 10; i++) s += `<rect class="ts-sx-vu ${i > 7 ? "hot" : i > 5 ? "warm" : i < 4 ? "lo" : ""}" style="--d:${(d + i * 0.03).toFixed(2)}s" x="${x}" y="${128 - i * 9}" width="10" height="6" rx="1.5"/>`; return s; };
  return [
    ["More power for the game", "The heavy Twitch and YouTube encoding and the recording happen on the other PC. The Gaming PC only adds TikTok's stream.",
      `<svg viewBox="0 0 360 200" class="ts-sx" aria-hidden="true" focusable="false"><defs><clipPath id="sxc-${uid}"><rect x="100" y="12" width="164" height="92" rx="3"/></clipPath></defs>${IMG("g7a", 92, 6, 180)}<g clip-path="url(#sxc-${uid})"><rect class="ts-sx-shine" x="40" y="0" width="34" height="120"/></g>${IMG("gp", 282, 66, 68)}
      <g transform="translate(64 176)"><path class="ts-sx-arc" d="M-48 0 A48 48 0 0 1 48 0"/><path class="ts-sx-arc on" d="M-48 0 A48 48 0 0 1 34 -34"/><path class="ts-sx-arc tt" d="M34 -34 A48 48 0 0 1 48 0"/>
      <g class="ts-sx-needle"><path d="M0 0 L-4 -4 L0 -40 L4 -4Z"/></g><circle r="6" class="ts-sx-hub"/>
      <text class="ts-sx-k" x="-40" y="16">GAME</text><text class="ts-sx-k tt" x="22" y="16">TIKTOK</text></g>
      <g class="ts-sx-fps"><rect x="212" y="20" width="52" height="18" rx="9"/><text x="238" y="33" text-anchor="middle">PLAYING</text></g></svg>`],
    ["Cleaner streams", "The Streaming PC encodes Twitch and YouTube on its own GPU, so a heavy moment in the game doesn't hit those streams.",
      `<svg viewBox="0 0 360 200" class="ts-sx" aria-hidden="true" focusable="false">${IMG("sp", 12, 52, 72)}
      <g transform="translate(100 18)"><rect class="ts-sx-panel" width="248" height="166" rx="12"/><text class="ts-sx-k" x="14" y="24">STREAM HEALTH</text>
      <g class="ts-sx-rec"><circle cx="206" cy="20" r="5"/><text x="216" y="24">REC</text></g>
      <text class="ts-sx-row" x="14" y="58">Twitch</text><path class="ts-sx-grid" d="M80 46 H234 M80 66 H234"/><path class="ts-sx-line tw" d="M80 60 C100 56 112 58 130 57 S168 55 186 57 S220 56 234 56"/><circle class="ts-sx-dot tw" r="3.5"><animateMotion dur="2.6s" repeatCount="indefinite" path="M80 60 C100 56 112 58 130 57 S168 55 186 57 S220 56 234 56"/></circle>
      <text class="ts-sx-row" x="14" y="106">YouTube</text><path class="ts-sx-grid" d="M80 94 H234 M80 114 H234"/><path class="ts-sx-line yt" d="M80 108 C98 105 116 107 134 105 S170 104 190 106 S222 105 234 104"/><circle class="ts-sx-dot yt" r="3.5"><animateMotion dur="2.6s" begin="1.3s" repeatCount="indefinite" path="M80 108 C98 105 116 107 134 105 S170 104 190 106 S222 105 234 104"/></circle>
      <text class="ts-sx-row" x="14" y="150">Recording</text><rect class="ts-sx-bar" x="80" y="141" width="154" height="10" rx="5"/><rect class="ts-sx-bar on" x="80" y="141" width="154" height="10" rx="5"/></g></svg>`],
    ["Audio you can mix live", "Mics, game and sound pads run through the L-8, so levels change mid-scream.",
      `<svg viewBox="0 0 360 200" class="ts-sx" aria-hidden="true" focusable="false">${IMG("l8", 236, 34, 116)}
      ${([["MIC", 24, 0], ["VR", 72, 0.12], ["GAME", 120, 0.24], ["PADS", 168, 0.36]] as [string, number, number][]).map(([l, x, d], i) => `<g><text class="ts-sx-k" x="${x + 16}" y="22" text-anchor="middle">${l}</text>${vu(x, d)}<rect class="ts-sx-slot" x="${x + 24}" y="40" width="5" height="96" rx="2.5"/><rect class="ts-sx-cap c${i + 1}" x="${x + 17}" y="${70 + (i % 2) * 22}" width="19" height="11" rx="3"/></g>`).join("")}
      <text class="ts-sx-f" x="110" y="160" text-anchor="middle">FADERS · ONE PER SOUND</text></svg>`],
    ["Upgrade one side at a time", "Swap the Gaming PC's GPU without touching the stream setup, and the other way round.",
      `<svg viewBox="0 0 360 200" class="ts-sx" aria-hidden="true" focusable="false">${IMG("gp", 18, 40, 82)}
      <g class="ts-sx-gpu"><g class="ts-sx-bob">${IMG("gpu3080", 112, 92, 150)}</g></g><path class="ts-sx-arrow" d="M196 70 C226 44 256 44 276 58"/><path class="ts-sx-arrow-h" d="M270 50 L278 59 L266 62"/>
      <g opacity=".9">${IMG("sp", 300, 96, 46)}</g><g class="ts-sx-still"><circle cx="290" cy="186" r="5"/><text x="299" y="189">STILL LIVE</text></g>
      <text class="ts-sx-k" x="59" y="188" text-anchor="middle">GAMING PC</text></svg>`],
    ["A backup built in", "If one PC crashes, the other keeps part of the show running. Try it in the diagram with Pull the plug.",
      `<svg viewBox="0 0 360 200" class="ts-sx" aria-hidden="true" focusable="false"><g class="ts-sx-dead">${IMG("gp", 34, 18, 78)}</g>${IMG("sp", 214, 22, 64)}
      <path class="ts-sx-cord" d="M74 146 C74 172 120 176 140 176"/><path class="ts-sx-zap" d="M140 176 C120 176 74 172 74 146"/><g class="ts-sx-plug"><rect x="138" y="168" width="20" height="16" rx="3"/><path d="M158 172 H166 M158 180 H166"/></g>
      ${PLAT(14, 162, "TikTok", "ts-sx-tt", "tiktok")}${PLAT(196, 150, "Twitch", "ts-sx-ok", "twitch")}${PLAT(276, 150, "YouTube", "ts-sx-ok", "youtube")}</svg>`],
    ["Room to get creative", "Scenes, overlays and transitions live on the Streaming PC, away from the game.",
      `<svg viewBox="0 0 360 200" class="ts-sx" aria-hidden="true" focusable="false"><rect class="ts-sx-panel" x="30" y="12" width="300" height="160" rx="10"/><rect class="ts-sx-scr" x="118" y="24" width="200" height="112" rx="6"/>
      <g class="ts-sx-prev"><rect class="p1" x="118" y="24" width="200" height="112" rx="6"/><rect class="p2" x="118" y="24" width="200" height="112" rx="6"/><rect class="p3" x="118" y="24" width="200" height="112" rx="6"/></g>
      <rect class="ts-sx-cam" x="262" y="90" width="48" height="36" rx="4"/><text class="ts-sx-live" x="128" y="40">● LIVE</text>
      ${["Starting soon", "Gameplay", "Jump scare", "Be right back", "Ending"].map((t, i) => `<g class="ts-sx-scene s${i + 1}"><rect x="40" y="${26 + i * 22}" width="70" height="18" rx="4"/><text x="46" y="${38 + i * 22}">${t}</text></g>`).join("")}
      <rect class="ts-sx-sweep" x="118" y="24" width="40" height="112"/><text class="ts-sx-f" x="180" y="190" text-anchor="middle">STREAMLABS SCENES · STREAMING PC</text></svg>`],
  ];
}
