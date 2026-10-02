// Game Vault add checks (docs/specs/game-vault.md §3). Pure apart from the injected
// sources and key lookup, so scripts/check-vault.js can run every rule against recorded
// responses. runChecks() never trusts anything the browser sent except which game to look up:
// it re-fetches the details itself and returns a decision, a reason, the check list the
// Add dialog ticks off, and the draft documents the wiring writes.
//
//   runChecks({ input, sources, lookupKey, isStaff, origin, handle, now }) -> {   (origin: "boomer" | "community")
//     decision: "added" | "duplicate" | "queued" | "refused" | "error",
//     code, message,                  // code is stable; message is member-facing
//     checks: [{ id, label, state: "pass" | "fail" | "review" | "skipped" }],
//     game, source, keys,             // drafts for vaultGames/{slug}, …/private/source, vaultKeys
//     duplicateSlug,                  // when decision is "duplicate"
//   }
//
// Order (first that decides wins): 1 resolve, 2 duplicate, 3 not a game, 4 not real,
// 5 adult content, 6 title profanity, 7 horror theme (auto-add) or queue.

const { isProfane } = require("../accounts/validate");
const { SourceError } = require("./sources");

const CHECK_LABELS = [
  ["found", "Found it"],
  ["notDuplicate", "Not already in the Vault"],
  ["fullGame", "A full game"],
  ["fits", "Fits the Vault"],
  ["safe", "Safe for the channel"],
];

const MESSAGES = {
  notFound: "We couldn't find that game. Try pasting its Steam link, or add it by hand.",
  pickFromList: "Pick the game from the list, or paste its Steam link.",
  notAGame: "That isn't a full game. DLC, bundles, mods and add-ons can't be added.",
  notReleased: "That game isn't confirmed (it's cancelled or only a rumour).",
  adult: "This game can't be added to the Vault.",
  profanity: "This game can't be added to the Vault.",
  duplicate: "Already in the Vault.",
  igdbDown: "Search is having trouble. Paste a Steam link instead.",
  allDown: "Try again in a few minutes.",
  queuedNoHorror: "Sent for a quick check.",
  queuedSteamOnly: "Sent for a quick check.",
  queuedByHand: "Sent for a quick check.",
  queuedUnknownType: "Sent for a quick check.",
  added: "Added to the Vault.",
};

// IGDB game types that count as a game in their own right (§3 step 3). Everything else
// (dlc, expansion, bundle, mod, port, fork, pack, update) is refused.
const ACCEPTED_TYPES = new Set(["main_game", "remake", "remaster", "expanded_game", "standalone_expansion", "episode", "season"]);
const REFUSED_STATUSES = new Set(["cancelled", "rumored"]);
const STEAM_ADULT_DESCRIPTORS = [3, 4];   // adult-only sexual content; frequent nudity or sexual content
// IGDB age-rating descriptors for strong or explicit sexual content. Plain "Sexual Content"
// or "Violence" never blocks; "Strong Sexual Content", PEGI's "Sex" and the like do.
const STRONG_SEX_RE = /(strong|explicit|graphic|intense|extreme)[^.]*\bsex|\bsex[a-z]*\b[^.]*(strong|explicit|graphic|intense|extreme)|^\s*sex\s*$|sexual intercourse|full nudity/i;

// Words that make an edition fold into its main game when comparing titles.
const EDITION_RE = /\b(?:(?:digital\s+)?deluxe|ultimate|gold|complete|collector'?s|premium|anniversary|director'?s\s+cut|game\s+of\s+the\s+year|goty)(?:\s+edition)?\b|\bedition\b/gi;

const stripAccents = (s) => String(s).normalize("NFKD").replace(/[̀-ͯ]/g, "");
const words = (s) => stripAccents(s).toLowerCase().replace(/&/g, " and ").replace(/['’]/g, "").split(/[^a-z0-9]+/).filter(Boolean);

/** Duplicate-key form of a title: accents, punctuation, edition words and a leading "the" dropped. */
function titleKey(name) {
  const base = stripAccents(name).replace(EDITION_RE, " ");
  let w = words(base);
  if (w[0] === "the" && w.length > 1) w = w.slice(1);
  return w.join("-").slice(0, 120);
}

/** URL slug for a title (editions folded, "the" kept). */
function slugify(name) {
  const w = words(stripAccents(name).replace(EDITION_RE, " "));
  return (w.join("-").slice(0, 60).replace(/-$/, "")) || "game";
}

/** Sort form: leading "The", "A", "An" dropped. */
function sortTitle(name) {
  const t = String(name).trim().replace(/^(the|an?)\s+(?=\S)/i, "");
  return t.toLocaleLowerCase("en-US");
}

/**
 * What the member typed or pasted -> { steamAppId } | { igdbSlug } | { igdbId } | { name }.
 * Accepts a store.steampowered.com/app/ID link, a bare app id, an igdb.com/games/slug link,
 * or a game's name. An object that already has steamAppId / igdbId / igdbSlug passes through.
 */
function parseInput(raw) {
  if (raw && typeof raw === "object") {
    if (raw.steamAppId != null && /^\d{1,10}$/.test(String(raw.steamAppId))) return { steamAppId: String(raw.steamAppId) };
    if (Number.isInteger(raw.igdbId) && raw.igdbId > 0) return { igdbId: raw.igdbId };
    if (typeof raw.igdbSlug === "string" && /^[a-z0-9][a-z0-9-]{0,100}$/.test(raw.igdbSlug)) return { igdbSlug: raw.igdbSlug };
    if (typeof raw.text === "string") return parseInput(raw.text);
    return null;
  }
  if (typeof raw !== "string") return null;
  const text = raw.trim();
  if (!text || text.length > 300) return null;
  const steam = text.match(/store\.steampowered\.com\/app\/(\d{1,10})(?:[/?#]|$)/i);
  if (steam) return { steamAppId: steam[1] };
  if (/^\d{1,10}$/.test(text)) return { steamAppId: text };
  const igdb = text.match(/igdb\.com\/games\/([a-z0-9][a-z0-9-]*)/i);
  if (igdb) return { igdbSlug: igdb[1].toLowerCase() };
  if (/^https?:\/\//i.test(text)) return null;   // some other link: not something we can look up
  return { name: text };
}

function makeChecks() {
  return CHECK_LABELS.map(([id, label]) => ({ id, label, state: "skipped" }));
}
function setState(checks, id, state) {
  checks.find((c) => c.id === id).state = state;
}
function allPass(checks, ids) {
  for (const id of ids) setState(checks, id, "pass");
}

function result(decision, code, checks, extra = {}) {
  return { decision, code, message: MESSAGES[code] || "", checks, ...extra };
}

const isHorror = (igdb) => !!igdb && igdb.themes.some((t) => t.toLowerCase() === "horror");
const hasErotic = (igdb) => !!igdb && igdb.themes.some((t) => t.toLowerCase() === "erotic");
const strongSexDescriptor = (igdb) => !!igdb && igdb.ageDescriptors.some((d) => STRONG_SEX_RE.test(d));
const steamAdult = (steam) => !!steam && steam.descriptorIds.some((id) => STEAM_ADULT_DESCRIPTORS.includes(id));

/** "released" | "early_access" | "unreleased" for the game doc. */
function releaseStatusOf(igdb, steam, now) {
  if (igdb?.releaseStatus === "early_access") return "early_access";
  if (steam?.comingSoon) return "unreleased";
  if (igdb?.releaseDate && igdb.releaseDate > now) return "unreleased";
  return "released";
}

function dedupe(list, max) {
  return [...new Set(list.filter(Boolean))].slice(0, max);
}

/** The draft documents for an allowed or queued game. cover is resolved by the caller. */
function buildDrafts({ igdb, steam, cover, origin, handle, now, inputSteamAppId }) {
  const title = igdb ? igdb.name : steam.name;
  const steamAppId = igdb?.steamAppId || steam?.appId || null;
  const game = {
    title,
    sortTitle: sortTitle(title),
    slug: slugify(title),
    altNames: igdb ? igdb.altNames : [],
    status: "wishlist",
    origin,
    addedBy: origin === "community" ? { handle: handle || null } : null,
    wantedCount: 0,
    summary: igdb?.summary || steam?.shortDescription || null,
    cover: cover || null,
    releaseDate: igdb?.releaseDate ?? null,
    releaseStatus: releaseStatusOf(igdb, steam, now),
    timeToBeat: igdb?.timeToBeat || null,
    developers: dedupe([...(igdb?.developers || []), ...(igdb ? [] : steam?.developers || [])], 5),
    publishers: dedupe([...(igdb?.publishers || []), ...(igdb ? [] : steam?.publishers || [])], 5),
    tags: { auto: dedupe([...(igdb?.perspectives || []), ...(igdb?.modes || []), ...(igdb?.themes || [])], 12), boomer: [] },
    ids: { igdb: igdb?.igdbId ?? null, steam: steamAppId, twitch: igdb?.twitchGameId ?? null },
    links: {
      ...(igdb?.links || {}),
      ...(steamAppId && !igdb?.links?.steam ? { steam: `https://store.steampowered.com/app/${steamAppId}/` } : {}),
      ...(steam?.website && !igdb?.links?.official ? { official: steam.website } : {}),
    },
    hidden: false,
  };
  const keys = [`title_${titleKey(title)}`];
  if (igdb) keys.push(`igdb_${igdb.igdbId}`);
  for (const id of new Set([steamAppId, inputSteamAppId].filter(Boolean))) keys.push(`steam_${id}`);
  const source = {
    gameType: igdb?.gameType ?? steam?.type ?? null,
    themes: igdb?.themes || [],
    ageDescriptors: igdb?.ageDescriptors || [],
    steamDescriptorIds: steam?.descriptorIds || [],
    igdbId: igdb?.igdbId ?? null,
    steamAppId,
  };
  return { game, source, keys };
}

/** Looks the game up, folding an edition into its main game. Throws SourceError. */
async function resolve(parsed, sources) {
  let igdb = null, steam = null, igdbFailed = null, steamFailed = null;
  const safe = async (fn, onErr) => { try { return await fn(); } catch (err) { if (err instanceof SourceError && err.kind !== "bad") { onErr(err); return null; } throw err; } };

  if (parsed.steamAppId) {
    steam = await safe(() => sources.steamGet(parsed.steamAppId), (e) => { steamFailed = e; });
    igdb = await safe(() => sources.igdbFindBySteam(parsed.steamAppId), (e) => { igdbFailed = e; });
  } else if (parsed.igdbId) {
    igdb = await safe(() => sources.igdbGet(parsed.igdbId), (e) => { igdbFailed = e; });
  } else if (parsed.igdbSlug) {
    igdb = await safe(() => sources.igdbBySlug(parsed.igdbSlug), (e) => { igdbFailed = e; });
  }
  // An edition (Deluxe, GOTY) folds into its main game.
  if (igdb?.versionParent) {
    const parent = await safe(() => sources.igdbGet(igdb.versionParent), (e) => { igdbFailed = e; });
    if (parent) igdb = parent;
  }
  // Steam details (content descriptors) for an IGDB-first lookup.
  if (igdb && !steam && igdb.steamAppId) {
    steam = await safe(() => sources.steamGet(igdb.steamAppId), (e) => { steamFailed = e; });
  }
  return { igdb, steam, igdbFailed, steamFailed };
}

async function runChecks({ input, sources, lookupKey, isStaff = false, origin = "community", handle = null, now = Date.now() }) {
  const checks = makeChecks();
  const parsed = parseInput(input);
  if (!parsed) { setState(checks, "found", "fail"); return result("refused", "notFound", checks); }
  if (parsed.name) { setState(checks, "found", "fail"); return result("refused", "pickFromList", checks); }

  // 1. Resolve.
  const { igdb, steam, igdbFailed, steamFailed } = await resolve(parsed, sources);
  if (!igdb && !steam) {
    setState(checks, "found", "fail");
    if (igdbFailed && (parsed.igdbId || parsed.igdbSlug)) return result("error", steamFailed ? "allDown" : "igdbDown", checks);
    if (igdbFailed && steamFailed) return result("error", "allDown", checks);
    if (steamFailed) return result("error", "allDown", checks);
    return result("refused", "notFound", checks);
  }
  setState(checks, "found", "pass");
  const title = igdb ? igdb.name : steam.name;
  const inputSteamAppId = parsed.steamAppId || null;

  // 2. Duplicate: igdb_{id}, steam_{appid}, then the normalised title.
  const keys = [];
  if (igdb) keys.push(`igdb_${igdb.igdbId}`);
  for (const id of new Set([inputSteamAppId, igdb?.steamAppId, steam?.appId].filter(Boolean))) keys.push(`steam_${id}`);
  keys.push(`title_${titleKey(title)}`);
  for (const key of keys) {
    const slug = await lookupKey(key);
    if (slug) { setState(checks, "notDuplicate", "fail"); return result("duplicate", "duplicate", checks, { duplicateSlug: slug }); }
  }
  setState(checks, "notDuplicate", "pass");

  // 3. Not a game: DLC, expansion, bundle, pack, update, mod, fork, or a Steam type other than game.
  if ((igdb?.gameType && !ACCEPTED_TYPES.has(igdb.gameType)) || (steam?.type && steam.type !== "game")) {
    setState(checks, "fullGame", "fail");
    return result("refused", "notAGame", checks);
  }
  // 4. Not real: cancelled or rumored.
  if (igdb && REFUSED_STATUSES.has(igdb.releaseStatus)) {
    setState(checks, "fullGame", "fail");
    return result("refused", "notReleased", checks);
  }
  setState(checks, "fullGame", "pass");

  // 5. Adult content (violence and gore never block) and 6. profanity in the title.
  if (hasErotic(igdb) || strongSexDescriptor(igdb) || steamAdult(steam)) {
    setState(checks, "safe", "fail");
    return result("refused", "adult", checks);
  }
  if (isProfane(title)) {
    setState(checks, "safe", "fail");
    return result("refused", "profanity", checks);
  }
  setState(checks, "safe", "pass");

  // 7. Horror theme on IGDB -> added; otherwise queued. Staff skip this check.
  const autoAdd = isHorror(igdb) || isStaff;
  setState(checks, "fits", autoAdd ? "pass" : "review");

  let cover = null;
  if (igdb?.coverImageId) cover = { source: "igdb", igdbImageId: igdb.coverImageId };
  else if (igdb?.steamAppId || steam) {
    const appId = igdb?.steamAppId || steam.appId;
    if (await sources.steamCoverExists(appId)) cover = { source: "steam", steamAppId: appId };
  }
  const drafts = buildDrafts({ igdb, steam, cover, origin, handle, now, inputSteamAppId });
  drafts.keys = [...new Set([...drafts.keys, ...keys.filter((k) => k.startsWith("steam_"))])];

  if (autoAdd) return result("added", "added", checks, drafts);
  const code = !igdb ? "queuedSteamOnly" : "queuedNoHorror";
  return result("queued", code, checks, { ...drafts, queueReason: !igdb ? "Steam only: no IGDB record" : "No horror theme on IGDB" });
}

/**
 * Add it by hand: a name and a link when neither source knows the game. Always queued,
 * after the same title checks (duplicate by title, profanity).
 */
async function runByHandChecks({ name, link, lookupKey, handle = null, now = Date.now() }) {
  const checks = makeChecks();
  const title = typeof name === "string" ? name.replace(/\s+/g, " ").trim() : "";
  if (title.length < 2 || title.length > 100 || /[\p{Cc}\p{Cf}<>]/u.test(title)) { setState(checks, "found", "fail"); return result("refused", "notFound", checks); }
  let url = null;
  try { const u = new URL(link); if (u.protocol === "https:" || u.protocol === "http:") url = u.href.slice(0, 300); } catch { /* no link */ }
  if (!url) { setState(checks, "found", "fail"); return result("refused", "notFound", checks); }
  setState(checks, "found", "pass");
  const key = `title_${titleKey(title)}`;
  const slug = await lookupKey(key);
  if (slug) { setState(checks, "notDuplicate", "fail"); return result("duplicate", "duplicate", checks, { duplicateSlug: slug }); }
  setState(checks, "notDuplicate", "pass");
  if (isProfane(title)) { setState(checks, "safe", "fail"); return result("refused", "profanity", checks); }
  setState(checks, "fullGame", "review");
  setState(checks, "safe", "review");
  setState(checks, "fits", "review");
  const game = {
    title, sortTitle: sortTitle(title), slug: slugify(title), altNames: [], status: "wishlist", origin: "community",
    addedBy: { handle }, wantedCount: 0, summary: null, cover: null, releaseDate: null, releaseStatus: "released",
    timeToBeat: null, developers: [], publishers: [], tags: { auto: [], boomer: [] },
    ids: { igdb: null, steam: null, twitch: null }, links: { official: url }, hidden: false,
  };
  return result("queued", "queuedByHand", checks, {
    game, keys: [key], queueReason: "Added by hand", source: { gameType: null, themes: [], ageDescriptors: [], steamDescriptorIds: [], igdbId: null, steamAppId: null },
  });
}

module.exports = {
  runChecks, runByHandChecks, parseInput, titleKey, slugify, sortTitle, buildDrafts,
  MESSAGES, CHECK_LABELS, ACCEPTED_TYPES, STEAM_ADULT_DESCRIPTORS,
};
