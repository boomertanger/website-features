#!/usr/bin/env node
// functions/scripts/check-vault.js: checks for the Game Vault source clients, the add
// checks and the rolling digest (lib/vault/*). The Steam responses in
// scripts/fixtures/vault/ are recorded from the live store; the IGDB ones are hand-built in
// IGDB's response shape (see igdb.json). Everything runs through the REAL clients with a
// fake fetch: no network, no credentials.   npm run check   (or node scripts/check-vault.js)
const assert = require("assert/strict");
const fs = require("fs");
const path = require("path");
const { createSources, normalizeSteam, SourceError, IGDB_MIN_GAP_MS } = require("../lib/vault/sources");
const C = require("../lib/vault/checks");
const D = require("../lib/vault/digest");

const FIX = path.join(__dirname, "fixtures", "vault");
const readJson = (f) => JSON.parse(fs.readFileSync(path.join(FIX, f), "utf8"));
const IGDB = readJson("igdb.json");
const STEAM = { ...readJson("steam-1205040.json"), ...readJson("steam-dlc.json"), ...readJson("steam-eldenring.json") };
const steamEntry = (appId, over = {}) => ({ success: true, data: { ...STEAM[1205040].data, steam_appid: Number(appId), ...over } });

// ---------- a fake fetch that answers like IGDB, Twitch and Steam ----------
function fakeEnv({ igdbStatus = 200, steam = {}, noSteamLink = false, tokenStatus = 200, rejectFirstToken = false } = {}) {
  const calls = [];
  let tokens = 0, rejected = false;
  const json = (status, body) => ({ ok: status < 400, status, json: async () => body, text: async () => JSON.stringify(body) });
  const fetchFn = async (url, init = {}) => {
    calls.push({ url, method: init.method || "GET", body: init.body ? String(init.body) : "" });
    if (url.startsWith("https://id.twitch.tv/oauth2/token")) {
      tokens++;
      return tokenStatus === 200 ? json(200, { access_token: `tok${tokens}`, expires_in: 5000000 }) : json(tokenStatus, { message: "invalid client" });
    }
    if (url.startsWith("https://api.igdb.com/v4/")) {
      if (rejectFirstToken && !rejected) { rejected = true; return json(401, { message: "Authorization Failure" }); }
      if (igdbStatus !== 200) return json(igdbStatus, { message: "down" });
      const ep = url.split("/v4/")[1], q = String(init.body);
      if (ep === "games") {
        let m;
        if ((m = q.match(/where id = (\d+)/))) return json(200, IGDB.games.filter((g) => g.id === +m[1]));
        if ((m = q.match(/where slug = "([^"]+)"/))) return json(200, IGDB.games.filter((g) => g.slug === m[1]));
        if ((m = q.match(/search "([^"]+)"/))) return json(200, IGDB.games.filter((g) => g.name.toLowerCase().includes(m[1].toLowerCase())).slice(0, 8));
      }
      if (ep === "external_games") {
        const m = q.match(/uid = "(\d+)"/);
        if (noSteamLink) return json(200, []);
        const g = IGDB.games.find((x) => (x.external_games || []).some((e) => e.uid === m[1] && e.external_game_source === 1));
        return json(200, g ? [{ game: g.id }] : []);
      }
      if (ep === "game_time_to_beats") return json(200, IGDB.timeToBeat.filter((t) => t.game_id === +q.match(/game_id = (\d+)/)[1]));
      return json(404, {});
    }
    if (url.startsWith("https://store.steampowered.com/api/appdetails")) {
      const id = new URL(url).searchParams.get("appids");
      if (steam.status) return json(steam.status, {});
      const entry = steam[id] || STEAM[id] || (id === "9999001" || id === "2124490" || id === "1966720" ? steamEntry(id, { name: `app ${id}` }) : { success: false });
      return json(200, { [id]: entry });
    }
    if (url.includes("steamstatic.com/steam/apps/")) {
      const ok = ["1205040", "1245620"].some((id) => url.includes(`/apps/${id}/`));
      return { ok, status: ok ? 200 : 404 };
    }
    return json(404, {});
  };
  const sleeps = [];
  const sources = createSources({ fetchFn, twitchClientId: "id", twitchClientSecret: "secret", sleepFn: async (ms) => { sleeps.push(ms); } });
  return { sources, calls, sleeps, tokens: () => tokens };
}

// duplicate keys already in the Vault
const vaultKeys = (map = {}) => async (key) => map[key] || null;

(async () => {
  // ---------- parseInput ----------
  assert.deepEqual(C.parseInput("https://store.steampowered.com/app/1205040/Granny_Chapter_Two/"), { steamAppId: "1205040" });
  assert.deepEqual(C.parseInput("store.steampowered.com/app/1205040"), { steamAppId: "1205040" });
  assert.deepEqual(C.parseInput("1205040"), { steamAppId: "1205040" });
  assert.deepEqual(C.parseInput("https://www.igdb.com/games/silent-hill-2"), { igdbSlug: "silent-hill-2" });
  assert.deepEqual(C.parseInput("Silent Hill"), { name: "Silent Hill" });
  assert.deepEqual(C.parseInput({ igdbId: 1002 }), { igdbId: 1002 });
  assert.equal(C.parseInput("https://example.com/game"), null);
  assert.equal(C.parseInput(""), null);
  assert.equal(C.parseInput("x".repeat(400)), null);
  assert.equal(C.parseInput({ igdbId: "1; drop" }), null);
  assert.equal(C.parseInput(42), null);

  // ---------- title keys, slugs, sort titles ----------
  assert.equal(C.titleKey("Silent Hill 2: Deluxe Edition"), "silent-hill-2");
  assert.equal(C.titleKey("Silent Hill 2 Game of the Year Edition"), "silent-hill-2");
  assert.equal(C.titleKey("The Bunker"), "bunker");
  assert.equal(C.titleKey("Amnesia: The Bunker"), "amnesia-the-bunker");
  assert.equal(C.titleKey("Pokémon  Horror!"), "pokemon-horror");
  assert.equal(C.slugify("Granny: Chapter Two"), "granny-chapter-two");
  assert.equal(C.slugify("!!!"), "game");
  assert.equal(C.sortTitle("The Long Dark"), "long dark");
  assert.equal(C.sortTitle("A Plague Tale"), "plague tale");
  assert.equal(C.sortTitle("Amnesia"), "amnesia");

  // ---------- Steam normaliser reads the recorded responses ----------
  const granny = normalizeSteam("1205040", STEAM[1205040]);
  assert.equal(granny.type, "game");
  assert.equal(granny.name, "Granny: Chapter Two");
  assert.deepEqual(granny.descriptorIds, [2, 5]);
  const dlc = normalizeSteam("1456361", STEAM[1456361]);
  assert.equal(dlc.type, "dlc");
  assert.equal(normalizeSteam("1", { success: false }), null);

  // ---------- IGDB client: token cache, 4 requests a second, retry on a rejected token ----------
  {
    const env = fakeEnv();
    const a = await env.sources.igdbGet(1001);
    assert.equal(a.name, "Granny: Chapter Two");
    assert.equal(a.gameType, "main_game");
    assert.equal(a.releaseStatus, "released");
    assert.deepEqual(a.altNames, ["Granny 2", "Granny Chapter 2"]);
    assert.equal(a.steamAppId, "1205040");
    assert.equal(a.twitchGameId, "512345");
    assert.equal(a.coverImageId, "co2granny");
    assert.deepEqual(a.developers, ["DVloper"]);
    assert.deepEqual(a.timeToBeat, { hastily: 2, normally: 5 });   // seconds -> hours
    assert.equal(a.links.steam, "https://store.steampowered.com/app/1205040/");
    assert.equal(a.links.official, "https://www.dvloper.com/");
    await env.sources.igdbGet(1002);
    assert.equal(env.tokens(), 1, "the app token is fetched once and reused");
    assert.ok(env.calls.some((c) => c.url.endsWith("/games") && c.body.includes("where id = 1001")));
    const igdbCalls = env.calls.filter((c) => c.url.startsWith("https://api.igdb.com")).length;
    assert.equal(igdbCalls, 4);                       // 2 games + 2 time-to-beat
    assert.ok(env.sleeps.length >= 1 && env.sleeps.every((ms) => ms <= IGDB_MIN_GAP_MS), "calls are spaced 250 ms apart");
    assert.deepEqual((await env.sources.igdbSearch("granny")).map((g) => g.igdbId), [1001]);
    assert.equal(await env.sources.igdbGet(999999), null);
    assert.equal((await env.sources.igdbFindBySteam("1205040")).igdbId, 1001);
    assert.equal(await env.sources.igdbFindBySteam("not-a-number"), null);
    assert.equal((await env.sources.igdbBySlug("silent-hill-2")).igdbId, 1002);
    assert.equal(await env.sources.igdbBySlug("x\"; fields *"), null);          // no query injection through a slug
    assert.equal(await env.sources.steamCoverExists("1205040"), true);
    assert.equal(await env.sources.steamCoverExists("7"), false);
  }
  {
    const env = fakeEnv({ rejectFirstToken: true });
    assert.equal((await env.sources.igdbGet(1001)).igdbId, 1001, "a rejected token is replaced once");
    assert.equal(env.tokens(), 2);
  }
  {
    const env = fakeEnv({ tokenStatus: 400 });
    await assert.rejects(() => env.sources.igdbGet(1001), (e) => e instanceof SourceError && e.kind === "auth");
    const down = fakeEnv({ igdbStatus: 503 });
    await assert.rejects(() => down.sources.igdbGet(1001), (e) => e instanceof SourceError && e.kind === "down");
  }

  // ---------- runChecks: the section 3 rules ----------
  const run = async (input, opts = {}, envOpts = {}) => {
    const env = fakeEnv(envOpts);
    return C.runChecks({ input, sources: env.sources, lookupKey: opts.keys ? vaultKeys(opts.keys) : vaultKeys(), isStaff: !!opts.staff, origin: opts.origin || "community", handle: opts.handle || "viewer1", now: Date.UTC(2026, 9, 2) });
  };
  const states = (r) => Object.fromEntries(r.checks.map((c) => [c.id, c.state]));

  // horror + IGDB: added automatically, with the full set of ticks
  let r = await run("https://store.steampowered.com/app/1205040/Granny_Chapter_Two/");
  assert.equal(r.decision, "added");
  assert.deepEqual(states(r), { found: "pass", notDuplicate: "pass", fullGame: "pass", fits: "pass", safe: "pass" });
  assert.equal(r.game.title, "Granny: Chapter Two");
  assert.equal(r.game.slug, "granny-chapter-two");
  assert.equal(r.game.status, "wishlist");
  assert.equal(r.game.origin, "community");
  assert.deepEqual(r.game.addedBy, { handle: "viewer1" });
  assert.deepEqual(r.game.cover, { source: "igdb", igdbImageId: "co2granny" });
  assert.deepEqual(r.game.ids, { igdb: 1001, steam: "1205040", twitch: "512345" });
  assert.deepEqual(r.game.altNames, ["Granny 2", "Granny Chapter 2"]);
  assert.deepEqual(r.game.tags.auto, ["First person", "Single player", "Horror", "Survival", "Stealth"]);
  assert.deepEqual(r.game.timeToBeat, { hastily: 2, normally: 5 });
  assert.equal(r.game.releaseStatus, "released");
  assert.deepEqual(r.keys.sort(), ["igdb_1001", "steam_1205040", "title_granny-chapter-two"]);
  assert.ok(r.source.themes.includes("Horror"));
  assert.equal(r.message, "Added to the Vault.");

  // Boomer's own add records no handle
  r = await run({ igdbId: 1001 }, { origin: "boomer", staff: true });
  assert.equal(r.decision, "added");
  assert.equal(r.game.origin, "boomer");
  assert.equal(r.game.addedBy, null);

  // violence and gore never block (Hell Carnage: Blood and Gore, Intense Violence)
  r = await run({ igdbId: 3002 });
  assert.equal(r.decision, "added");
  assert.equal(r.game.title, "Hell Carnage");
  // plain "Sexual Content" / "Sexual Themes" descriptors do not block either
  r = await run({ igdbId: 3006 });
  assert.equal(r.decision, "added");

  // non-horror is queued; staff skip that check
  r = await run({ igdbId: 4001 });
  assert.equal(r.decision, "queued");
  assert.equal(r.code, "queuedNoHorror");
  assert.equal(states(r).fits, "review");
  assert.equal(r.message, "Sent for a quick check.");
  assert.equal(r.queueReason, "No horror theme on IGDB");
  assert.ok(r.game && r.keys.includes("igdb_4001"));
  r = await run({ igdbId: 4001 }, { staff: true, origin: "boomer" });
  assert.equal(r.decision, "added");
  // Elden Ring by Steam link: IGDB knows it, no horror theme -> queued
  r = await run("1245620");
  assert.equal(r.decision, "queued");
  assert.deepEqual(r.game.cover, { source: "igdb", igdbImageId: "co2elden" });

  // Steam only (IGDB has no record): queued; the cover comes from Steam's portrait art
  r = await run("1205040", {}, { noSteamLink: true });
  assert.equal(r.decision, "queued");
  assert.equal(r.code, "queuedSteamOnly");
  assert.equal(r.queueReason, "Steam only: no IGDB record");
  assert.equal(r.game.title, "Granny: Chapter Two");
  assert.deepEqual(r.game.cover, { source: "steam", steamAppId: "1205040" });
  assert.equal(r.game.ids.igdb, null);
  // …and with no portrait art there is no cover at all (the mascot shows)
  r = await run("1245620", {}, { noSteamLink: true });
  assert.equal(r.decision, "queued");
  assert.deepEqual(r.game.cover, { source: "steam", steamAppId: "1245620" });
  r = await run("9999001", {}, { noSteamLink: true });
  assert.equal(r.game.cover, null);

  // editions fold into the main game: the Deluxe Edition's Steam link lands on Silent Hill 2
  r = await run("9999001");
  assert.equal(r.decision, "added");
  assert.equal(r.game.title, "Silent Hill 2");
  assert.equal(r.game.ids.igdb, 1002);
  assert.ok(r.keys.includes("steam_9999001") && r.keys.includes("igdb_1002") && r.keys.includes("steam_2124490"));
  // …so it is a duplicate once the main game is in
  r = await run("9999001", { keys: { igdb_1002: "silent-hill-2" } });
  assert.equal(r.decision, "duplicate");
  assert.equal(r.duplicateSlug, "silent-hill-2");
  assert.equal(states(r).notDuplicate, "fail");
  assert.equal(states(r).fullGame, "skipped");

  // duplicates by each key
  r = await run({ igdbId: 1001 }, { keys: { igdb_1001: "granny-chapter-two" } });
  assert.equal(r.decision, "duplicate");
  r = await run("1205040", { keys: { steam_1205040: "granny-chapter-two" } });
  assert.equal(r.decision, "duplicate");
  r = await run({ igdbId: 1004 }, { keys: { "title_silent-hill-2": "silent-hill-2" } });   // "… Game of the Year Edition" folds by title
  assert.equal(r.decision, "duplicate");
  assert.equal(r.duplicateSlug, "silent-hill-2");

  // not a game: DLC, bundle, expansion, mod, update are refused; episode, season, remake, remaster, standalone accepted
  r = await run("1456361");
  assert.equal(r.decision, "refused");
  assert.equal(r.code, "notAGame");
  assert.equal(states(r).fullGame, "fail");
  for (const id of [2001, 2002, 2003, 2004, 2008]) {
    r = await run({ igdbId: id });
    assert.equal(r.decision, "refused", `igdb ${id}`);
    assert.equal(r.code, "notAGame", `igdb ${id}`);
  }
  for (const id of [2005, 2006, 2007, 1002]) {
    r = await run({ igdbId: id });
    assert.equal(r.decision, "added", `igdb ${id}`);
  }
  // a Steam page that says "game" but IGDB says DLC is still refused, and the other way round
  r = await run("1205040", {}, { steam: { 1205040: steamEntry(1205040, { type: "dlc" }) } });
  assert.equal(r.code, "notAGame");

  // not real: cancelled and rumored
  for (const id of [5001, 5002]) {
    r = await run({ igdbId: id });
    assert.equal(r.decision, "refused");
    assert.equal(r.code, "notReleased");
  }
  // an unreleased game is fine (it is marked so)
  r = await run({ igdbId: 5003 });
  assert.equal(r.decision, "added");
  assert.equal(r.game.releaseStatus, "unreleased");
  // early access shows its tag
  r = await run({ igdbId: 1005 });
  assert.equal(r.game.releaseStatus, "early_access");
  assert.deepEqual(r.game.developers, ["Zeekerss"]);

  // adult content: Erotic theme, strong sexual descriptors, Steam descriptors 3 or 4; staff are refused too
  for (const [id, label] of [[3001, "Erotic theme"], [3003, "Strong Sexual Content"], [3005, "PEGI Sex"]]) {
    r = await run({ igdbId: id });
    assert.equal(r.decision, "refused", label);
    assert.equal(r.code, "adult", label);
    assert.equal(r.message, "This game can't be added to the Vault.", "adult refusals stay vague");
    assert.equal(states(r).safe, "fail", label);
  }
  r = await run({ igdbId: 3001 }, { staff: true, origin: "boomer" });
  assert.equal(r.decision, "refused");
  for (const ids of [[3], [4], [2, 4, 5]]) {
    r = await run("1205040", {}, { steam: { 1205040: steamEntry(1205040, { content_descriptors: { ids } }) } });
    assert.equal(r.decision, "refused", `steam descriptors ${ids}`);
    assert.equal(r.code, "adult");
  }
  for (const ids of [[], [1], [2], [2, 5]]) {   // some nudity, violence, general mature: allowed
    r = await run("1205040", {}, { steam: { 1205040: steamEntry(1205040, { content_descriptors: { ids } }) } });
    assert.equal(r.decision, "added", `steam descriptors ${ids}`);
  }

  // profanity in the title
  r = await run({ igdbId: 3004 });
  assert.equal(r.decision, "refused");
  assert.equal(r.code, "profanity");
  assert.equal(r.message, "This game can't be added to the Vault.");

  // not found, names need a pick, other links
  r = await run("9999999");
  assert.equal(r.decision, "refused");
  assert.equal(r.code, "notFound");
  r = await run("silent hill");
  assert.equal(r.code, "pickFromList");
  r = await run("https://example.com/x");
  assert.equal(r.code, "notFound");

  // IGDB down: a Steam link still works (queued); an IGDB link says so; both down says try later
  r = await run("1205040", {}, { igdbStatus: 503 });
  assert.equal(r.decision, "queued");
  assert.equal(r.code, "queuedSteamOnly");
  r = await run({ igdbId: 1001 }, {}, { igdbStatus: 503 });
  assert.equal(r.decision, "error");
  assert.equal(r.code, "igdbDown");
  assert.equal(r.message, "Search is having trouble. Paste a Steam link instead.");
  r = await run("1205040", {}, { igdbStatus: 503, steam: { status: 503 } });
  assert.equal(r.decision, "error");
  assert.equal(r.code, "allDown");
  assert.equal(r.message, "Try again in a few minutes.");
  // a rejected IGDB token behaves the same as IGDB being down for a Steam link
  r = await run("1205040", {}, { tokenStatus: 400 });
  assert.equal(r.decision, "queued");

  // Add it by hand: always queued, after the title checks
  const byHand = (name, link, keys) => C.runByHandChecks({ name, link, lookupKey: vaultKeys(keys), handle: "viewer1" });
  r = await byHand("Obscure Basement Game", "https://example.com/basement");
  assert.equal(r.decision, "queued");
  assert.equal(r.code, "queuedByHand");
  assert.equal(r.game.links.official, "https://example.com/basement");
  assert.equal(r.game.origin, "community");
  assert.deepEqual(r.keys, ["title_obscure-basement-game"]);
  r = await byHand("Silent Hill 2", "https://example.com/x", { "title_silent-hill-2": "silent-hill-2" });
  assert.equal(r.decision, "duplicate");
  r = await byHand("Haunted Shithouse", "https://example.com/x");
  assert.equal(r.code, "profanity");
  assert.equal((await byHand("X", "https://example.com/x")).decision, "refused");
  assert.equal((await byHand("Fine Name", "javascript:alert(1)")).decision, "refused");
  assert.equal((await byHand("Fine Name", "not a link")).decision, "refused");

  // ---------- the rolling digest ----------
  const MIN = 60000;
  let dg = D.applyAdd(null, { id: "a", title: "Granny: Chapter Two", cover: { source: "igdb", igdbImageId: "co2granny" } }, 0);
  assert.equal(dg.action, "open");
  assert.equal(dg.event.type, "games-added");
  assert.equal(dg.event.feature, "game-vault");
  assert.equal(dg.event.summary, "Granny: Chapter Two was added to the Vault");
  assert.equal(dg.event.link, "/games?sort=new");
  assert.equal(dg.pointer.count, 1);
  let p = dg.pointer;
  dg = D.applyAdd(p, { id: "b", title: "Hell Carnage" }, 10 * MIN);
  assert.equal(dg.action, "update");
  assert.equal(dg.event.summary, "2 games added to the Vault: Granny: Chapter Two and Hell Carnage");
  dg = D.applyAdd(dg.pointer, { id: "c", title: "Silent Hill 2" }, 20 * MIN);
  assert.equal(dg.event.summary, "3 games added to the Vault: Granny: Chapter Two, Hell Carnage and Silent Hill 2");
  for (let i = 0; i < 7; i++) dg = D.applyAdd(dg.pointer, { id: `x${i}`, title: `Game ${i}` }, 30 * MIN);
  assert.equal(dg.pointer.count, 10);
  assert.equal(dg.event.summary, "10 games added to the Vault: Granny: Chapter Two, Hell Carnage and 8 more");
  assert.equal(dg.event.titles.length, 3, "up to 3 titles are kept on the event");
  // the same game twice changes nothing
  assert.equal(D.applyAdd(dg.pointer, { id: "a", title: "Granny: Chapter Two" }, 31 * MIN).action, "none");
  // 60 minutes after the first add, the next add opens a new digest
  assert.equal(D.applyAdd(dg.pointer, { id: "y", title: "Later" }, 59 * MIN + 59000).action, "update");
  const fresh = D.applyAdd(dg.pointer, { id: "y", title: "Later" }, 60 * MIN);
  assert.equal(fresh.action, "open");
  assert.equal(fresh.pointer.count, 1);
  assert.equal(fresh.event.summary, "Later was added to the Vault");
  // a hidden or deleted game leaves its digest; at 0 the event is removed
  let left = D.applyRemove(dg.pointer, "b");
  assert.equal(left.action, "update");
  assert.equal(left.pointer.count, 9);
  assert.equal(left.event.summary, "9 games added to the Vault: Granny: Chapter Two, Silent Hill 2 and 7 more");
  assert.equal(D.applyRemove(dg.pointer, "nope").action, "none");
  assert.equal(D.applyRemove(null, "a").action, "none");
  const single = D.applyAdd(null, { id: "z", title: "Solo" }, 0);
  assert.equal(D.applyRemove(single.pointer, "z").action, "delete");
  // separate events
  assert.equal(D.nowPlayingEvent({ title: "Granny: Chapter Two", slug: "granny-chapter-two" }).summary, "Now playing: Granny: Chapter Two");
  assert.equal(D.finishedEvent({ title: "Silent Hill 2", slug: "silent-hill-2" }, 9).summary, "Finished Silent Hill 2. Boomer's score: 9");
  assert.equal(D.finishedEvent({ title: "Silent Hill 2", slug: "silent-hill-2" }).summary, "Finished Silent Hill 2.");

  console.log("check-vault: ok");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
