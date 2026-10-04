// Trophy Room (rewards) pure logic (docs/specs/rewards.md §3, §6, §8). No Firestore here, so
// scripts/check-rewards.js can check every rule.
//
//   xpForLevel(L)        total XP needed to reach level L: 50 × L × (L − 1)
//   levelForXp(xp)       the level a lifetime XP total gives (level 1 at 0 XP)
//   rankFor(level)       the rank name for a level
//   progress(xp)         { level, rank, xp, levelXp, nextXp } for a profile
//   badgeXp(badge)       a badge's XP (its own xp, else by rarity; supporter badges 0)
//   trophyXp(place)      1st 150, 2nd 100, 3rd 75, else 0
//   showcaseLimit(who)   3 pins, 6 for Sub Club and crew
//   checkShowcase(ids, { held, limit })   -> { ok, ids } | { ok: false, reason }
//   ledgerKey(feature, ref, uid)          the rewardLedger doc id (idempotency key)
const XP_BY_RARITY = [0, 10, 25, 50, 100, 250];
const RANKS = [[1, "Fresh Meat"], [5, "Survivor"], [10, "Night Stalker"], [20, "Nightmare"], [35, "Dread Lord"], [50, "Boomer Legend"]];
const TROPHY_XP = { 1: 150, 2: 100, 3: 75 };
const PERSONAS = ["Gamer", "Viewer", "Lurker", "Streamer", "Creator", "Liker", "Gifter"];
const LOCKED_PERSONAS = ["Liker", "Gifter"];      // unlocked later (likes and gifts don't exist yet)
const SHOWCASE = { base: 3, plus: 6 };
const RARITY_NAMES = [null, "Common", "Uncommon", "Rare", "Epic", "Legendary"];

const xpForLevel = (L) => (L <= 1 ? 0 : 50 * L * (L - 1));

function levelForXp(xp) {
  const x = Math.max(0, Math.floor(Number(xp) || 0));
  // Solve 50L(L−1) <= x for the largest whole L, then fix any rounding.
  let L = Math.max(1, Math.floor((1 + Math.sqrt(1 + (4 * x) / 50)) / 2));
  while (xpForLevel(L + 1) <= x) L++;
  while (L > 1 && xpForLevel(L) > x) L--;
  return L;
}

function rankFor(level) {
  let name = RANKS[0][1];
  for (const [min, n] of RANKS) if (level >= min) name = n;
  return name;
}

function progress(xp) {
  const x = Math.max(0, Math.floor(Number(xp) || 0));
  const level = levelForXp(x);
  return { xp: x, level, rank: rankFor(level), levelXp: xpForLevel(level), nextXp: xpForLevel(level + 1) };
}

function badgeXp(badge) {
  if (!badge) return 0;
  if (badge.source === "support" || badge.collection === "supporters") return 0;
  if (Number.isInteger(badge.xp) && badge.xp >= 0) return badge.xp;
  return XP_BY_RARITY[badge.rarity] || 0;
}

const trophyXp = (place) => TROPHY_XP[place] || 0;

/** who: { roles: [], isOwner, staging } — Sub Club and crew get 6 pins; "sub" is a staging-only role until billing. */
function showcaseLimit({ roles = [], isOwner = false, staging = false } = {}) {
  const crew = isOwner || roles.includes("admin") || roles.includes("mod");
  const sub = staging && roles.includes("sub");
  return crew || sub ? SHOWCASE.plus : SHOWCASE.base;
}

function checkShowcase(ids, { held, limit }) {
  if (!Array.isArray(ids) || ids.some((x) => typeof x !== "string" || !x || x.length > 80)) return { ok: false, reason: "args" };
  const uniq = [...new Set(ids)];
  if (uniq.length !== ids.length) return { ok: false, reason: "duplicate" };
  if (uniq.length > limit) return { ok: false, reason: "tooMany" };
  if (uniq.some((x) => !held.has(x))) return { ok: false, reason: "notHeld" };
  return { ok: true, ids: uniq };
}

function checkPersona(p) {
  if (p === null) return { ok: true, persona: null };
  if (!PERSONAS.includes(p)) return { ok: false, reason: "args" };
  if (LOCKED_PERSONAS.includes(p)) return { ok: false, reason: "locked" };
  return { ok: true, persona: p };
}

/** A reason for a crew award or a revoke: 10 to 300 characters once trimmed. */
function checkReason(r) {
  const t = typeof r === "string" ? r.replace(/\s+/g, " ").trim() : "";
  return t.length >= 10 && t.length <= 300 ? t : null;
}

/** Who may award a badge: awardableBy null = earned, never awarded; "owner" needs the owner. */
function canAward(badge, { isOwner, isAdmin }) {
  if (!badge || badge.status !== "active") return "notActive";
  if (!badge.awardableBy) return "notAwardable";
  if (badge.awardableBy === "owner" && !isOwner) return "ownerOnly";
  if (!isAdmin && !isOwner) return "notAdmin";
  return null;
}

const ledgerKey = (feature, ref, uid) => `${feature}:${ref}:${uid}`.replace(/\//g, "_").slice(0, 1400);

/** A badge is open to grant: active, and a limited one inside its window. */
function badgeOpen(badge, now) {
  if (!badge || badge.status !== "active") return false;
  const l = badge.limited;
  if (l && l.closesAt != null && now > l.closesAt) return false;
  if (l && l.opensAt != null && now < l.opensAt) return false;
  return true;
}

/** Days a member has been here (for The Pilgrim and The Elder). */
const memberDays = (joinedAt, now) => (joinedAt ? Math.floor((now - joinedAt) / 86400000) : 0);
const MEMBERSHIP_BADGES = [["pilgrim", 365], ["elder", 365 * 3]];
const FOUNDER_WINDOW_DAYS = 90;
const isFounder = (joinedAt, founderStart) => !!founderStart && !!joinedAt && joinedAt >= founderStart && joinedAt < founderStart + FOUNDER_WINDOW_DAYS * 86400000;

module.exports = {
  XP_BY_RARITY, RANKS, TROPHY_XP, PERSONAS, LOCKED_PERSONAS, SHOWCASE, RARITY_NAMES, MEMBERSHIP_BADGES, FOUNDER_WINDOW_DAYS,
  xpForLevel, levelForXp, rankFor, progress, badgeXp, trophyXp, showcaseLimit, checkShowcase, checkPersona, checkReason,
  canAward, ledgerKey, badgeOpen, memberDays, isFounder,
};
