// Game Vault art (docs/design/mockups/game-vault-round-2.html): the GAMEVAULT wordmark's vault-dial
// icon (it rests; on hover the dial spins a combination and the lamp lights, game-vault.css). Vault-only, so it lives with the feature, not the kit.

const ticks = Array.from({ length: 12 }, (_, i) => {
  const a = (i * 30 * Math.PI) / 180, r1 = 8.9, r2 = 10.1;
  return `<line class="tick" x1="${(20 + r1 * Math.sin(a)).toFixed(2)}" y1="${(20 - r1 * Math.cos(a)).toFixed(2)}" x2="${(20 + r2 * Math.sin(a)).toFixed(2)}" y2="${(20 - r2 * Math.cos(a)).toFixed(2)}"/>`;
}).join("");
const spoke = (deg: number) => `<g transform="rotate(${deg} 20 20)"><line class="spoke" x1="20" y1="20" x2="20" y2="13"/><circle class="knob" cx="20" cy="12.8" r="1.6"/></g>`;

/** The vault-dial icon. `extra` adds classes to the lamp (gv-deadlamp for the error state). */
export function vaultIcon({ size, lamp = "" }: { size?: number; lamp?: string } = {}) {
  const style = size ? ` style="width:${size}px;height:${size}px"` : "";
  return `<svg class="gv-icon" viewBox="0 0 40 40" aria-hidden="true" focusable="false"${style}><rect class="hinge" x="1.4" y="11" width="3.6" height="5" rx="1"/><rect class="hinge" x="1.4" y="24" width="3.6" height="5" rx="1"/><rect class="door" x="4" y="4" width="32" height="32" rx="6"/><circle class="ring" cx="20" cy="20" r="11"/>${ticks}<g class="dial">${spoke(0)}${spoke(120)}${spoke(240)}<circle class="hub" cx="20" cy="20" r="3.3"/></g><circle class="lamp${lamp ? ` ${lamp}` : ""}" cx="31" cy="9" r="1.9"/></svg>`;
}
export const GV_ICON = vaultIcon();

/** The lock scene's ring (the Add dialog's last step): ticks that spin shut and a lamp. */
export function lockRing() {
  const ticksR = Array.from({ length: 24 }, (_, i) => {
    const a = (i * 15 * Math.PI) / 180;
    return `<line class="tk" x1="${(95 + 70 * Math.sin(a)).toFixed(1)}" y1="${(95 - 70 * Math.cos(a)).toFixed(1)}" x2="${(95 + 76 * Math.sin(a)).toFixed(1)}" y2="${(95 - 76 * Math.cos(a)).toFixed(1)}"/>`;
  }).join("");
  return `<svg class="gv-lockring" viewBox="0 0 190 190" aria-hidden="true" focusable="false"><circle class="r" cx="95" cy="95" r="85"/><circle class="rr" cx="95" cy="95" r="85" transform="rotate(-90 95 95)"/><g class="spin">${ticksR}</g><circle class="lamp" cx="95" cy="14" r="5"/></svg>`;
}

const ic = (d: string, size = 18) => `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${d}</svg>`;
export const I = {
  search: ic('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>'),
  plus: ic('<path d="M12 5v14M5 12h14"/>'),
  plusSm: ic('<path d="M12 5v14M5 12h14"/>', 15),
  filter: ic('<path d="M4 6h16M7 12h10M10 18h4"/>', 15),
  people: ic('<circle cx="9" cy="8" r="3"/><path d="M3 20c0-3.3 2.7-5 6-5s6 1.7 6 5"/><path d="M16 11a3 3 0 1 0 0-6M21 20c0-2.6-1.6-4.2-4-4.8"/>', 13),
  heart: ic('<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>', 15),
  pencil: ic('<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>', 15),
  eyeOff: ic('<path d="M3 3l18 18"/><path d="M10.6 5.1A10 10 0 0 1 12 5c5 0 9 4.5 10 7-.4 1-1.3 2.4-2.6 3.7M6.6 6.6C4.4 8 2.9 10.2 2 12c1 2.5 5 7 10 7 1.6 0 3.1-.5 4.4-1.2"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>', 15),
  eye: ic('<path d="M2 12c1-2.5 5-7 10-7s9 4.5 10 7c-1 2.5-5 7-10 7S3 14.5 2 12z"/><circle cx="12" cy="12" r="3"/>', 15),
  globe: ic('<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.7 3.8 5.7 3.8 9s-1.3 6.3-3.8 9c-2.5-2.7-3.8-5.7-3.8-9S9.5 5.7 12 3z"/>', 16),
  image: ic('<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5-9 9"/>', 15),
  queue: ic('<path d="M4 6h16M4 12h16M4 18h10"/>', 15),
  help: ic('<circle cx="12" cy="12" r="9"/><path d="M9.6 9.4a2.5 2.5 0 0 1 4.8.9c0 1.7-2.4 2.1-2.4 3.7"/><path d="M12 17.2h.01"/>', 15),
};
