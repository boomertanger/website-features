// Game Vault data sources (docs/specs/game-vault.md §3, §5): IGDB and the Steam store
// behind ONE swappable interface. Nothing here touches Firebase, so the clients run in
// check scripts against recorded responses (scripts/fixtures/vault/) with a fake fetch.
//
//   const sources = createSources({ fetchFn, twitchClientId, twitchClientSecret });
//   sources.igdbSearch(name)          -> [candidate]            (up to 8)
//   sources.igdbGet(igdbId)           -> igdb record | null
//   sources.igdbBySlug(slug)          -> igdb record | null     (from an igdb.com link)
//   sources.igdbFindBySteam(appId)    -> igdb record | null     (Steam app id -> IGDB)
//   sources.steamGet(appId)           -> steam record | null    (store appdetails, no key)
//   sources.steamCoverExists(appId)   -> boolean                (library_600x900 portrait)
//
// Anything that implements those six methods can replace this module. Failures throw a
// SourceError with kind "down" (network / 5xx / rate limit), "auth" (IGDB token rejected)
// or "bad" (a response that doesn't look like the API). Members never see the word IGDB.
//
// IGDB: the Twitch app token (client credentials), max 4 requests a second. The growth
// collector fetches the same token inline in lib/growth/collect.js (no shared helper), so
// this module has its own cached copy of that three-line call.

const IGDB_URL = "https://api.igdb.com/v4";
const TOKEN_URL = "https://id.twitch.tv/oauth2/token";
const STEAM_URL = "https://store.steampowered.com/api/appdetails";
const STEAM_COVER = (appId) => `https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/library_600x900.jpg`;
const IGDB_MIN_GAP_MS = 250;   // 4 requests a second
const MAX_ALT_NAMES = 5;

class SourceError extends Error {
  constructor(kind, message) { super(message); this.name = "SourceError"; this.kind = kind; }
}

// IGDB's numeric enums (used when a response carries an id and not an expanded object).
const GAME_TYPES = {
  0: "main_game", 1: "dlc", 2: "expansion", 3: "bundle", 4: "standalone_expansion", 5: "mod", 6: "episode",
  7: "season", 8: "remake", 9: "remaster", 10: "expanded_game", 11: "port", 12: "fork", 13: "pack", 14: "update",
};
const GAME_STATUSES = {
  0: "released", 2: "alpha", 3: "beta", 4: "early_access", 5: "offline", 6: "cancelled", 7: "rumored", 8: "delisted",
};
const EXTERNAL_SOURCES = { 1: "steam", 5: "gog", 14: "twitch", 26: "epic", 30: "itch" };
const WEBSITE_TYPES = { 1: "official", 13: "steam", 15: "itch", 16: "epic", 17: "gog" };

const snake = (s) => String(s).trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
/** An IGDB enum field as a snake_case name: { id, type } / { id, status } / "Main Game" / 0. */
function enumName(v, table) {
  if (v == null) return null;
  if (typeof v === "number") return table[v] || null;
  if (typeof v === "string") return snake(v);
  const name = v.type || v.status || v.name;
  if (name) return snake(name);
  return typeof v.id === "number" ? table[v.id] || null : null;
}

const names = (list) => (Array.isArray(list) ? list.map((x) => x && x.name).filter(Boolean) : []);

const GAME_FIELDS = [
  "name", "slug", "summary", "url", "first_release_date", "version_parent", "parent_game",
  "game_type.type", "game_status.status",
  "alternative_names.name", "cover.image_id",
  "themes.name", "genres.name", "player_perspectives.name", "game_modes.name",
  "involved_companies.developer", "involved_companies.publisher", "involved_companies.company.name",
  "age_ratings.organization", "age_ratings.rating_category", "age_ratings.rating_content_descriptions.description",
  "external_games.uid", "external_games.external_game_source",
  "websites.url", "websites.type",
].join(",");

/** A raw IGDB game object -> the record the checks work on. */
function normalizeIgdb(g) {
  if (!g || typeof g.id !== "number" || typeof g.name !== "string") throw new SourceError("bad", "igdb: not a game record");
  const companies = Array.isArray(g.involved_companies) ? g.involved_companies : [];
  const links = {};
  let steamAppId = null, twitchGameId = null;
  for (const e of Array.isArray(g.external_games) ? g.external_games : []) {
    const kind = EXTERNAL_SOURCES[typeof e.external_game_source === "object" ? e.external_game_source?.id : e.external_game_source];
    if (!kind || e.uid == null) continue;
    if (kind === "steam" && steamAppId == null && /^\d+$/.test(String(e.uid))) steamAppId = String(e.uid);
    if (kind === "twitch" && twitchGameId == null) twitchGameId = String(e.uid);
  }
  for (const w of Array.isArray(g.websites) ? g.websites : []) {
    const kind = WEBSITE_TYPES[typeof w.type === "object" ? w.type?.id : w.type];
    if (kind && w.url && !links[kind]) links[kind] = w.url;
  }
  if (steamAppId && !links.steam) links.steam = `https://store.steampowered.com/app/${steamAppId}/`;
  const ageDescriptors = [];
  for (const a of Array.isArray(g.age_ratings) ? g.age_ratings : []) {
    for (const d of Array.isArray(a.rating_content_descriptions) ? a.rating_content_descriptions : []) {
      if (d && typeof d.description === "string") ageDescriptors.push(d.description);
    }
  }
  const releasedAt = typeof g.first_release_date === "number" ? g.first_release_date * 1000 : null;
  return {
    source: "igdb",
    igdbId: g.id,
    name: g.name,
    slug: g.slug || null,
    altNames: names(g.alternative_names).slice(0, MAX_ALT_NAMES),
    summary: typeof g.summary === "string" ? g.summary : null,
    coverImageId: g.cover?.image_id || null,
    releaseDate: releasedAt,
    releaseStatus: enumName(g.game_status, GAME_STATUSES) || "released",
    gameType: enumName(g.game_type, GAME_TYPES),
    themes: names(g.themes),
    genres: names(g.genres),
    perspectives: names(g.player_perspectives),
    modes: names(g.game_modes),
    ageDescriptors,
    developers: companies.filter((c) => c.developer).map((c) => c.company?.name).filter(Boolean),
    publishers: companies.filter((c) => c.publisher).map((c) => c.company?.name).filter(Boolean),
    steamAppId,
    twitchGameId,
    links,
    versionParent: typeof g.version_parent === "number" ? g.version_parent : (g.version_parent?.id ?? null),
    url: g.url || null,
    timeToBeat: null,
  };
}

/** The Steam store appdetails entry for an app -> the record the checks work on, or null. */
function normalizeSteam(appId, entry) {
  if (!entry || entry.success !== true || !entry.data) return null;
  const d = entry.data;
  const rd = d.release_date || {};
  return {
    source: "steam",
    appId: String(d.steam_appid || appId),
    type: typeof d.type === "string" ? d.type : null,   // game | dlc | demo | mod | music | ...
    name: d.name,
    shortDescription: typeof d.short_description === "string" ? d.short_description : null,
    developers: Array.isArray(d.developers) ? d.developers : [],
    publishers: Array.isArray(d.publishers) ? d.publishers : [],
    descriptorIds: Array.isArray(d.content_descriptors?.ids) ? d.content_descriptors.ids : [],
    comingSoon: !!rd.coming_soon,
    releaseText: rd.date || null,
    website: d.website || null,
    fullGameAppId: d.fullgame?.appid ? String(d.fullgame.appid) : null,
  };
}

/** "Granny" -> {"IGDB search"} string-safe for the apicalypse body. */
const quote = (s) => `"${String(s).replace(/[\\"]/g, " ").replace(/\s+/g, " ").trim()}"`;

/**
 * @param {object} cfg
 * @param {Function} [cfg.fetchFn]   fetch (injected in checks)
 * @param {string} cfg.twitchClientId
 * @param {string} cfg.twitchClientSecret
 * @param {Function} [cfg.sleepFn]   (ms) => Promise, injected in checks
 * @param {Function} [cfg.nowFn]
 */
function createSources({ fetchFn = fetch, twitchClientId, twitchClientSecret, sleepFn = (ms) => new Promise((r) => setTimeout(r, ms)), nowFn = Date.now } = {}) {
  let token = null;       // { value, expiresAt }
  let lastIgdbAt = 0;
  let chain = Promise.resolve();   // serialises IGDB calls so the gap holds across concurrent callers

  async function appToken(force = false) {
    if (!twitchClientId || !twitchClientSecret) throw new SourceError("auth", "igdb: no Twitch app credentials");
    if (!force && token && token.expiresAt - 60000 > nowFn()) return token.value;
    let res;
    try {
      res = await fetchFn(TOKEN_URL, {
        method: "POST",
        body: new URLSearchParams({ client_id: twitchClientId, client_secret: twitchClientSecret, grant_type: "client_credentials" }),
      });
    } catch (err) { throw new SourceError("down", `igdb token: ${err.message}`); }
    if (res.status === 400 || res.status === 401 || res.status === 403) throw new SourceError("auth", `igdb token rejected (HTTP ${res.status})`);
    if (!res.ok) throw new SourceError("down", `igdb token: HTTP ${res.status}`);
    const body = await res.json().catch(() => null);
    if (!body?.access_token) throw new SourceError("bad", "igdb token: no access_token");
    token = { value: body.access_token, expiresAt: nowFn() + (body.expires_in || 0) * 1000 };
    return token.value;
  }

  async function igdbPost(endpoint, query, retried = false) {
    const run = async () => {
      const wait = lastIgdbAt + IGDB_MIN_GAP_MS - nowFn();
      if (wait > 0) await sleepFn(wait);
      lastIgdbAt = nowFn();
      const bearer = await appToken(retried);
      let res;
      try {
        res = await fetchFn(`${IGDB_URL}/${endpoint}`, {
          method: "POST",
          headers: { "Client-ID": twitchClientId, Authorization: `Bearer ${bearer}`, Accept: "application/json", "Content-Type": "text/plain" },
          body: query,
        });
      } catch (err) { throw new SourceError("down", `igdb ${endpoint}: ${err.message}`); }
      return res;
    };
    const next = chain.then(run, run);
    chain = next.then(() => undefined, () => undefined);
    const res = await next;
    if (res.status === 401 || res.status === 403) {
      if (!retried) { token = null; return igdbPost(endpoint, query, true); }   // expired or revoked: one fresh token
      throw new SourceError("auth", `igdb ${endpoint}: token rejected (HTTP ${res.status})`);
    }
    if (res.status === 429 || res.status >= 500) throw new SourceError("down", `igdb ${endpoint}: HTTP ${res.status}`);
    if (!res.ok) throw new SourceError("bad", `igdb ${endpoint}: HTTP ${res.status}`);
    const body = await res.json().catch(() => null);
    if (!Array.isArray(body)) throw new SourceError("bad", `igdb ${endpoint}: expected a list`);
    return body;
  }

  async function igdbTimeToBeat(igdbId) {
    try {
      const rows = await igdbPost("game_time_to_beats", `fields hastily,normally; where game_id = ${Number(igdbId)}; limit 1;`);
      const r = rows[0];
      if (!r) return null;
      const hours = (secs) => (typeof secs === "number" && secs > 0 ? Math.round(secs / 360) / 10 : null);
      const t = { hastily: hours(r.hastily), normally: hours(r.normally) };
      return t.hastily == null && t.normally == null ? null : t;
    } catch (err) {
      if (err instanceof SourceError && err.kind === "auth") throw err;
      return null;   // time to beat is a nicety; never fail an add over it
    }
  }

  async function igdbGet(igdbId, { withTimeToBeat = true } = {}) {
    const rows = await igdbPost("games", `fields ${GAME_FIELDS}; where id = ${Number(igdbId)}; limit 1;`);
    if (!rows.length) return null;
    const rec = normalizeIgdb(rows[0]);
    if (withTimeToBeat) rec.timeToBeat = await igdbTimeToBeat(rec.igdbId);
    return rec;
  }

  return {
    async igdbSearch(name) {
      const rows = await igdbPost("games", `search ${quote(name)}; fields ${GAME_FIELDS}; limit 8;`);
      return rows.map(normalizeIgdb);
    },
    igdbGet,
    async igdbBySlug(slug) {
      if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) return null;
      const rows = await igdbPost("games", `fields ${GAME_FIELDS}; where slug = "${slug}"; limit 1;`);
      if (!rows.length) return null;
      const rec = normalizeIgdb(rows[0]);
      rec.timeToBeat = await igdbTimeToBeat(rec.igdbId);
      return rec;
    },
    async igdbFindBySteam(appId) {
      if (!/^\d+$/.test(String(appId))) return null;
      const rows = await igdbPost("external_games", `fields game; where uid = "${appId}" & external_game_source = 1; limit 1;`);
      const gameId = rows[0]?.game;
      return typeof gameId === "number" ? igdbGet(gameId) : null;
    },
    async steamGet(appId) {
      if (!/^\d+$/.test(String(appId))) return null;
      let res;
      try { res = await fetchFn(`${STEAM_URL}?appids=${appId}&l=english`); } catch (err) { throw new SourceError("down", `steam: ${err.message}`); }
      if (res.status === 429 || res.status >= 500) throw new SourceError("down", `steam: HTTP ${res.status}`);
      if (!res.ok) throw new SourceError("bad", `steam: HTTP ${res.status}`);
      const body = await res.json().catch(() => null);
      if (!body || typeof body !== "object") throw new SourceError("bad", "steam: not JSON");
      return normalizeSteam(appId, body[String(appId)]);
    },
    async steamCoverExists(appId) {
      try { return (await fetchFn(STEAM_COVER(appId), { method: "HEAD" })).ok; } catch { return false; }
    },
  };
}

module.exports = { createSources, normalizeIgdb, normalizeSteam, SourceError, GAME_FIELDS, STEAM_COVER, IGDB_MIN_GAP_MS, MAX_ALT_NAMES };
