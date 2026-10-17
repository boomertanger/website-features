// The small stroke icons of the /prizes flow ("Three ways to win"; mockup prize-box-pages.html). currentColor, so the flow boxes colour them.
export const IC = {
  live: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M6.3 6.3a8 8 0 0 0 0 11.4M17.7 6.3a8 8 0 0 1 0 11.4M3.5 3.5a12 12 0 0 0 0 17M20.5 3.5a12 12 0 0 1 0 17"/></svg>',
  up: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 16V4M7 9l5-5 5 5M4 16v4h16v-4"/></svg>',
  mail: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/></svg>',
  wheel: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="13" r="8"/><path d="M12 13l-5 -5M12 13l7 0M12 13l-2 8M12 2v3"/></svg>',
  judge: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.4 6.8 19.1l1-5.8L3.5 9.2l5.9-.9z"/></svg>',
  dice: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="3"/><circle cx="9" cy="9" r="1.2" fill="currentColor"/><circle cx="15" cy="15" r="1.2" fill="currentColor"/><circle cx="15" cy="9" r="1.2" fill="currentColor"/><circle cx="9" cy="15" r="1.2" fill="currentColor"/></svg>',
  tv: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="6" width="18" height="12" rx="2"/><path d="M8 21h8M9 2l3 4 3-4"/></svg>',
  page: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M6 3h9l4 4v14H6z"/><path d="M9 12h7M9 16h5"/></svg>',
  badge: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="9" r="6"/><path d="M8.5 14l-1.5 7 5-3 5 3-1.5-7"/></svg>',
};

/** A ghost-numbered chapter header (.bt-chapter--ghost) for the /prizes story page. ledeAttr: extra attributes on the lede (trusted). */
export const chapter = (n: number, id: string, title: string, lede = "", ledeAttr = "") => `<header class="bt-chapter bt-chapter--ghost" data-n="${String(n).padStart(2, "0")}"><p class="bt-chapter-eyebrow" aria-hidden="true">${String(n).padStart(2, "0")} · Chapter</p><h2 class="bt-chapter-title" id="h-${id}">${title}</h2>${lede ? `<p class="bt-chapter-lede"${ledeAttr}>${lede}</p>` : ""}</header>`;

// The small Prize Box scene (the box with the mascot peeking out; hover lifts the lid) for hero headers: a contest page, /admin/prize-box.
const mascotSvg = () => { const t = document.getElementById("bt-mascot-tpl") as HTMLTemplateElement | null; const s = t && t.content.querySelector("svg"); return s ? s.innerHTML : ""; };
export const boxScene = () => `<svg class="pz-scene" viewBox="0 0 320 220" role="img" aria-label="The Prize Box, with the mascot peeking out"><defs><linearGradient id="pzBeam" x1="0" y1="1" x2="0" y2="0"><stop class="beam-a" offset="0"/><stop class="beam-b" offset="1"/></linearGradient></defs>
  <ellipse class="pz-floor" cx="160" cy="204" rx="120" ry="10"/><path class="pz-beams" d="M84 112 L40 0 L280 0 L246 112 Z" fill="url(#pzBeam)"/>
  <g class="bt-mascot pz-mas" transform="translate(108 34) scale(0.5)">${mascotSvg()}</g>
  <rect class="wood" x="72" y="112" width="176" height="88" rx="4"/><path class="slat" d="M72 141 H248 M72 170 H248"/><path class="ribbon" d="M150 112 V200 M170 112 V200"/>
  <path class="brass" d="M72 112 h16 v16 M248 112 h-16 v16 M72 200 h16 v-16 M248 200 h-16 v-16"/>
  <g class="pz-lid"><rect class="wood" x="66" y="92" width="188" height="22" rx="3"/><path class="ribbon" d="M150 92 V114 M170 92 V114"/><path class="ribbon" d="M160 92 c-14 -18 -30 -10 -18 0 M160 92 c14 -18 30 -10 18 0"/></g>
  <circle class="pz-spark" style="--d:0s" cx="64" cy="60" r="3"/><circle class="pz-spark" style="--d:.8s" cx="262" cy="46" r="2.5"/><circle class="pz-spark" style="--d:1.5s" cx="230" cy="88" r="2"/><circle class="pz-spark" style="--d:.4s" cx="96" cy="22" r="2"/></svg>`;
