// The Trophy Room's level maths for the site (docs/specs/rewards.md §6, §8). A mirror of
// functions/lib/rewards/logic.js (CommonJS, so the browser bundle can't import it);
// functions/scripts/check-rewards.js compares the two, so they can't drift.
//
//   xpForLevel(L)   total XP needed to reach level L: 50 × L × (L − 1)
//   levelForXp(xp)  the level a lifetime XP total gives (level 1 at 0 XP)
//   rankFor(level)  the rank name for a level
//   progress(xp)    { xp, level, rank, levelXp, nextXp }
//   showcaseLimit({ roles, staging })   3 pins, 6 for Sub Club (staging role) and crew
export const XP_BY_RARITY = [0, 10, 25, 50, 100, 250];
export const RANKS = [[1, "Fresh Meat"], [5, "Survivor"], [10, "Night Stalker"], [20, "Nightmare"], [35, "Dread Lord"], [50, "Boomer Legend"]];
export const PERSONAS = ["Gamer", "Viewer", "Lurker", "Streamer", "Creator", "Liker", "Gifter"];
export const LOCKED_PERSONAS = ["Liker", "Gifter"];
export const PERSONA_ICONS = { Gamer: "🎮", Viewer: "👀", Lurker: "🫥", Streamer: "🎙", Creator: "🎨", Liker: "👍", Gifter: "🎁" };
export const SHOWCASE = { base: 3, plus: 6 };

export const xpForLevel = (L) => (L <= 1 ? 0 : 50 * L * (L - 1));

export function levelForXp(xp) {
  const x = Math.max(0, Math.floor(Number(xp) || 0));
  let L = Math.max(1, Math.floor((1 + Math.sqrt(1 + (4 * x) / 50)) / 2));
  while (xpForLevel(L + 1) <= x) L++;
  while (L > 1 && xpForLevel(L) > x) L--;
  return L;
}

export function rankFor(level) {
  let name = RANKS[0][1];
  for (const [min, n] of RANKS) if (level >= min) name = n;
  return name;
}

export function progress(xp) {
  const x = Math.max(0, Math.floor(Number(xp) || 0));
  const level = levelForXp(x);
  return { xp: x, level, rank: rankFor(level), levelXp: xpForLevel(level), nextXp: xpForLevel(level + 1) };
}

export function badgeXp(badge) {
  if (!badge) return 0;
  if (badge.source === "support" || badge.collection === "supporters") return 0;
  if (Number.isInteger(badge.xp) && badge.xp >= 0) return badge.xp;
  return XP_BY_RARITY[badge.rarity] || 0;
}

export function showcaseLimit({ roles = [], isOwner = false, staging = false } = {}) {
  const crew = isOwner || roles.includes("admin") || roles.includes("mod");
  const sub = staging && roles.includes("sub");
  return crew || sub ? SHOWCASE.plus : SHOWCASE.base;
}
