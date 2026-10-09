// Cloud Stash art (docs/design/mockups/cloud-stash.html: I1 Storm stash, S2 One big gauge, W1 Into the cloud): the CLOUDSTASH wordmark's icon (three disk bars inside a cloud; it rests, and
// on hover or focus rain falls and the bars light gold one by one, cloud-stash.css), the hero's rain-gauge scene and the page's small icons. Stash-only, so it lives with the feature.

const DROP = (x: number, y: number, cls: string) => `<path class="drop ${cls}" d="M${x} ${y}c.9 1.1 1.3 1.9 1.3 2.5a1.3 1.3 0 0 1-2.6 0c0-.6.4-1.4 1.3-2.5Z"/>`;
export const CLOUD_PATH = "M10.5 25H30.5A6.2 6.2 0 0 0 31.4 12.7A8.4 8.4 0 0 0 15.3 10.6A7.6 7.6 0 0 0 10.5 25Z";

/** I1 Storm stash. */
export const STASH_ICON = `<svg class="cs-i1" viewBox="0 0 40 40" aria-hidden="true" focusable="false">
    <path class="cloud" d="${CLOUD_PATH}"/>
    <path class="puff" d="M17.2 13.6a5.4 5.4 0 0 1 4.4-2.4M27.6 15.4a3 3 0 0 1 2.2 1.8"/>
    <rect class="bar" x="14.6" y="18.4" width="3" height="4.8" rx="1"/><rect class="bar" x="18.8" y="15.6" width="3" height="7.6" rx="1"/><rect class="bar" x="23" y="17.2" width="3" height="6" rx="1"/>
    <rect class="bar-lit b1" x="14.6" y="18.4" width="3" height="4.8" rx="1"/><rect class="bar-lit b2" x="18.8" y="15.6" width="3" height="7.6" rx="1"/><rect class="bar-lit b3" x="23" y="17.2" width="3" height="6" rx="1"/>
    ${DROP(14, 27, "d1")}${DROP(20.5, 27, "d2")}${DROP(27, 27, "d3")}
  </svg>`;

export const mascot = () => document.getElementById("bt-mascot-tpl")?.innerHTML ?? "";

const svg = (body: string, vb = "0 0 16 16", w = 16) => `<svg viewBox="${vb}" width="${w}" height="${w}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${body}</svg>`;
export const IC = {
  help: svg('<circle cx="8" cy="8" r="6.5"/><path d="M6.2 6.2a1.9 1.9 0 0 1 3.6.6c0 1.3-1.8 1.5-1.8 2.7"/><path d="M8 11.7v.1"/>'),
  scan: svg('<path d="M13.5 8A5.5 5.5 0 0 1 3.4 11"/><path d="M2.5 8A5.5 5.5 0 0 1 12.6 5"/><path d="M12.8 2.2v2.9H9.9"/><path d="M3.2 13.8v-2.9h2.9"/>'),
  lock: svg('<rect x="3" y="7" width="10" height="7" rx="1.6"/><path d="M5.2 7V5.2a2.8 2.8 0 0 1 5.6 0V7"/>'),
  eye: svg('<path d="M1.5 8s2.4-4.5 6.5-4.5S14.5 8 14.5 8 12.1 12.5 8 12.5 1.5 8 1.5 8Z"/><circle cx="8" cy="8" r="2"/>'),
  ext: svg('<path d="M9 2.5h4.5V7"/><path d="M13.5 2.5 7.5 8.5"/><path d="M12 9.5v3a1 1 0 0 1-1 1H3.5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h3"/>'),
  plus: svg('<path d="M8 3v10M3 8h10"/>', "0 0 16 16", 14),
  gear: svg('<circle cx="8" cy="8" r="2.2"/><path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M3.4 12.6l1.4-1.4M11.2 4.8l1.4-1.4"/>'),
  x: svg('<path d="M4 4l8 8M12 4l-8 8"/>'),
  trash: svg('<path d="M2.5 4.5h11"/><path d="M6 4.5V3a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v1.5"/><path d="M4 4.5l.7 8.6a1 1 0 0 0 1 .9h4.6a1 1 0 0 0 1-.9l.7-8.6"/>'),
  broom: svg('<path d="M13.5 2.5 8 8"/><path d="M8.6 7.4 4 9.5l-2 4.5 4.5-2 2.1-4.6"/><path d="M4.4 11.6 3 13"/>'),
  play: svg('<path d="M5 3.5v9l7-4.5z"/>'),
  arrow: svg('<path d="M2 7h18M15 2l5 5-5 5"/>', "0 0 22 14", 26),
};

/** S2 One big gauge: a cloud raining into one gauge with the gold pause mark and the mascot. It reacts to status (drizzle, heavier rain and a gold level, a red spill). */
export function heroScene({ status, pct, limit, pauseAt }: { status: string; pct: number | null; limit: number | null; pauseAt: number }) {
  const lvl = Math.min(1, Math.max(0.05, (pct ?? 0) / 100));
  const rain = Array.from({ length: 9 }, (_, i) => `<line x1="${58 + i * 16}" y1="60" x2="${56 + i * 16}" y2="68" class="${i === 4 ? "g" : ""}" style="--d:${(i * 0.37) % 1.3}s;--t:${1.1 + (i % 3) * 0.2}s"/>`).join("");
  const my = (138 - 64 * (pauseAt / 100)).toFixed(1);
  return `<div class="cs-scene cs-scene--s2" data-status="${status}" aria-hidden="true"><svg class="cs-sky" viewBox="0 0 300 150" preserveAspectRatio="xMidYMid meet">
    <path class="cl" d="M48 56H182A20 20 0 0 0 184 16.5A30 30 0 0 0 128 9A34 34 0 0 0 74 14A22 22 0 0 0 48 56Z"/><path class="cl-puff" d="M90 22a20 20 0 0 1 22-9M150 22a14 14 0 0 1 12 8"/>
    <g class="rain">${rain}</g>
    <rect class="glass" x="96" y="70" width="40" height="72" rx="8"/>
    <rect class="lvl" x="100" y="74" width="32" height="64" rx="5" style="--lvl:${lvl}"/>
    <path class="mark" d="M92 ${my}h48"/><text class="hi" x="145" y="${(Number(my) + 3.5).toFixed(1)}">${status === "healthy" ? `PAUSE ${pauseAt}%` : `${pauseAt}%`}</text>
    <path class="tick" d="M100 106h7M100 122h7"/><path class="shine" d="M127 80v44"/>
    ${pct == null ? "" : `<text class="v" x="145" y="112">${Math.round(pct)}%</text>${limit ? `<text x="145" y="124">of ${limit} credits</text>` : ""}`}
    <circle class="spill" cx="134" cy="72" r="2.4"/><circle class="spill" cx="100" cy="72" r="2" style="animation-delay:.5s"/>
  </svg>${mascot()}</div>`;
}
