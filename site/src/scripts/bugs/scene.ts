// The hero's porch-light scene (docs/specs/bug-zapper.md §7; mockup Hero H1): the hanging lamp, moths drifting to it (one doomed), the real mascot, "N zapped so far"
// (the all-time Fixed count; hidden when it can't be read) and four counter buttons (Open, Confirmed, In progress, Fixed) that filter the board. On How it works the same
// scene is shown large with no counters (the page's own links do that job).
import { bzLamp, mascot, mothSvg } from "./art";
import { STATUS, type Status } from "./status";

const KEYS: Status[] = ["open", "confirmed", "in_progress", "fixed"];

export function meters(c: Record<string, number>, active: string) {
  return `<div class="bz-meters" role="group" aria-label="Reports by status">${KEYS.map((k) => `<button type="button" class="bz-meter bz-meter--${k}" data-fstatus="${k}" aria-pressed="${active === k}" aria-label="${STATUS[k].label}: ${c[k] ?? 0} reports. Show only these."><b>${c[k] ?? 0}</b><span>${STATUS[k].label}</span></button>`).join("")}</div>`;
}

export function sceneHtml({ counts, active = "all", zapped, big = false }: { counts?: Record<string, number>; active?: string; zapped: number | null; big?: boolean }) {
  const moth = `<span class="bz-moth">${mothSvg()}</span>`;
  return `<div class="bz-scene bz-scene--porch" data-scene><div class="bz-porch" aria-hidden="true"><span class="bz-porch-glow"></span>${bzLamp()}<div class="bz-moths">${moth}${moth}${moth}${moth}<span class="bz-moth is-doomed">${mothSvg()}</span></div><svg class="bz-zapfx" viewBox="0 0 26 30" focusable="false"><path d="M4 2L16 11L8 15L22 28"/></svg>${mascot()}${zapped == null ? "" : `<div class="bz-zapcount"><b>${zapped}</b><span>zapped so far</span></div>`}</div>${big || !counts ? "" : meters(counts, active)}</div>`;
}

/** Pressing a counter makes the lamp zap once. */
export function zap(scene: Element | null) {
  if (!scene) return;
  scene.classList.add("is-zapping");
  setTimeout(() => scene.classList.remove("is-zapping"), 700);
}
