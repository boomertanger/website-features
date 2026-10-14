#!/usr/bin/env node
// functions/scripts/check-import-vault.js: checks for import-vault.js's CSV reading and row
// rules (quotes, commas and newlines inside quotes, status, score, legacy counts, boomerTags,
// hint, note) and the title matching that never guesses. No network, no Firestore, no
// credentials.   npm run check
const assert = require("assert/strict");
const fs = require("fs");
const path = require("path");
const { parseCsv, readRow, matchTitle, applyTitleAs, byHandDraft } = require("./import-vault");
const C = require("../lib/vault/checks");
const { titleKey } = C;

let rows = parseCsv('title,steam,status\r\n"Granny, Chapter ""Two""",,finished\r\n"Multi\nline",https://store.steampowered.com/app/1/x,\r\n\r\n');
assert.equal(rows.length, 2);
assert.equal(rows[0].title, 'Granny, Chapter "Two"');
assert.equal(rows[0].status, "finished");
assert.equal(rows[1].title, "Multi\nline");
assert.equal(rows[0].line, 2);
assert.equal(parseCsv("﻿Title,STATUS\nX,Playing").length, 1, "a BOM and header case are tolerated");
assert.equal(parseCsv("")[0], undefined);
assert.equal(parseCsv("title\n")[0], undefined);

assert.deepEqual(readRow({ title: "X" }), { status: "wishlist", score: null, verdict: "", legacy: { streamCount: 0, minutes: 0, lastStreamedAt: null }, title: "X", steam: undefined, boomerTags: [], hint: "", titleAs: null, steamOnly: false, episode: false, allowAdult: false, link: null, developer: null });
const full = readRow({ title: "X", status: "Finished", score: "9", verdict: "  Great   game ", legacy_streams: "12", legacy_minutes: "1800", legacy_last: "2025-11-02" });
assert.equal(full.status, "finished"); assert.equal(full.score, 9); assert.equal(full.verdict, "Great game");
assert.deepEqual(full.legacy, { streamCount: 12, minutes: 1800, lastStreamedAt: Date.UTC(2025, 10, 2, 12) });
for (const bad of [{ title: "X", status: "sideways" }, { title: "X", score: "11" }, { title: "X", score: "0" }, { title: "X", score: "7.5" },
  { title: "X", verdict: "v".repeat(141) }, { title: "X", legacy_streams: "-1" }, { title: "X", legacy_minutes: "abc" },
  { title: "X", legacy_last: "11/02/2025" }, { title: "X", legacy_last: "2999-01-01" }, { status: "playing" }]) {
  assert.ok(readRow(bad).error, JSON.stringify(bad));
}

// boomerTags: semicolon-separated, trimmed, deduplicated, the editor's limits (12 tags, 30 characters)
assert.deepEqual(readRow({ title: "X", boomertags: "VR" }).boomerTags, ["VR"]);
assert.deepEqual(readRow({ title: "X", boomertags: " VR ; Co-op;;VR " }).boomerTags, ["VR", "Co-op"]);
assert.ok(readRow({ title: "X", boomertags: Array.from({ length: 13 }, (_, i) => `t${i}`).join(";") }).error, "13 tags");
assert.ok(readRow({ title: "X", boomertags: "x".repeat(31) }).error, "a 31-character tag");
// the header is read case-insensitively, so the CSV's "boomerTags" column lands in boomertags
assert.deepEqual(readRow(parseCsv("title,status,boomerTags,hint,note\nAlien: Isolation,finished,VR,,played in VR")[0]).boomerTags, ["VR"]);
// hint: kept, whitespace tidied; note: ignored
assert.equal(readRow({ title: "X", hint: "  Chilla's   Art " }).hint, "Chilla's Art");
assert.equal("note" in readRow({ title: "X", note: "ask" }), false, "note is ignored");

// matchTitle: never guesses
const H = (igdbId, name, year, dev, o = {}) => ({ igdbId, name, releaseDate: year ? Date.UTC(year, 5, 1) : null, developers: dev ? [dev] : [], versionParent: null, parentGame: null, gameType: "main_game", ...o });
assert.equal(matchTitle("Visage", "", [H(1, "Visage", 2020, "SadSquare"), H(2, "Visage of Fear", 2019, "X")], titleKey).pick.igdbId, 1, "one exact match");
assert.equal(matchTitle("The Mortuary Assistant", "", [H(3, "Mortuary Assistant", 2022, "DarkStone")], titleKey).pick.igdbId, 3, '"the" and case don\'t matter');
assert.equal(matchTitle("Visage", "", [H(1, "Visage", 2020, "SadSquare"), H(4, "Visage: Deluxe Edition", 2020, "SadSquare", { versionParent: 1 })], titleKey).pick.igdbId, 1, "an edition folds into the main game");
assert.equal(matchTitle("Visage", "", [H(1, "Visage", 2020, "SadSquare"), H(5, "Visage", 2021, "SadSquare", { gameType: "port", parentGame: 1 })], titleKey).pick.igdbId, 1, "a port folds into the main game");
const ds = [H(10, "Dead Space", 2008, "EA Redwood Studios"), H(11, "Dead Space", 2023, "Motive Studio", { gameType: "remake" })];
assert.equal(matchTitle("Dead Space", "", ds, titleKey).ambiguous.length, 2, "two plausible games, no hint: ambiguous");
assert.equal(matchTitle("Dead Space", "2008", ds, titleKey).pick.igdbId, 10, "a year hint picks");
assert.equal(matchTitle("Dead Space", "motive", ds, titleKey).pick.igdbId, 11, "a developer hint picks (part of the name, any case)");
assert.equal(matchTitle("Dead Space", "2015", ds, titleKey).ambiguous.length, 2, "a hint that matches neither: still ambiguous");
const gr = [H(20, "Granny", 2017, "DVloper"), H(21, "Granny", 2019, "DVloper")];
assert.ok(matchTitle("Granny", "DVloper", gr, titleKey).ambiguous, "a hint that matches both: still ambiguous");
assert.equal(matchTitle("Granny", "2014", [H(20, "Granny", 2017, "DVloper")], titleKey).pick.igdbId, 20, "the hint never decides when there's only one");
const nf = matchTitle("Granny Legacy", "", [H(30, "Granny", 2017, "DVloper"), H(31, "Granny: Chapter Two", 2019, "DVloper")], titleKey);
assert.ok(nf.notFound && nf.notFound.length === 2 && !nf.pick, "no exact title: not found, with the closest names");
assert.deepEqual(matchTitle("Anything", "", [], titleKey).notFound, [], "nothing on IGDB: not found");

// the sample CSV in the fixtures reads: 10 rows, 4 of them with problems
const sample = parseCsv(fs.readFileSync(path.join(__dirname, "fixtures", "vault", "import-sample.csv"), "utf8"));
assert.equal(sample.length, 10);
assert.equal(sample.filter((r) => readRow(r).error).length, 2);

// import-only columns: title_as, steam_only, episode, owner_override, link + developer
const ext = readRow({ title: "X", steam: "3076240", title_as: "  True Nightmare:  Roadside Cafe ", steam_only: "yes", episode: "Yes", owner_override: "Adult" });
assert.equal(ext.titleAs, "True Nightmare: Roadside Cafe");
assert.equal(ext.steamOnly, true); assert.equal(ext.episode, true); assert.equal(ext.allowAdult, true);
assert.ok(readRow({ title: "X", steam_only: "yes" }).error, "steam_only needs a steam id");
assert.ok(readRow({ title: "X", owner_override: "profanity" }).error, "only the adult override exists");
assert.ok(readRow({ title: "X", link: "http://x.example" }).error, "a by-hand link is https");
assert.ok(readRow({ title: "X", steam: "1", link: "https://x.example" }).error, "a by-hand row has no steam id");
assert.equal(readRow({ title: "Granny VR", link: "https://mihappyl.itch.io/granny-vr-unofficial", developer: " MihappyL " }).developer, "MihappyL");

// title_as: the Latin title and its slug; the source's Cyrillic spelling kept as an alternative name; both title keys claimed
const cyr = "True Nightmare: Roadside \u0421afe";
const t = applyTitleAs({ title: cyr, sortTitle: "x", slug: C.slugify(cyr), altNames: ["TN"] }, [`title_${titleKey(cyr)}`, "steam_3076240"], "True Nightmare: Roadside Cafe", C);
assert.equal(t.draft.title, "True Nightmare: Roadside Cafe");
assert.equal(t.draft.slug, "true-nightmare-roadside-cafe");
assert.deepEqual(t.draft.altNames, [cyr, "TN"]);
assert.ok(t.keys.includes(`title_${titleKey("True Nightmare: Roadside Cafe")}`) && t.keys.includes("steam_3076240"));
assert.equal(applyTitleAs({ title: "Same" }, ["k"], "Same", C).draft.title, "Same", "the same title changes nothing");

// by hand: Boomer's pick, no cover, the developer, an itch.io link as the itch link (anything else as official)
const hand = byHandDraft({ title: "Granny VR", origin: "community", addedBy: { handle: null }, cover: null, links: { official: "x" }, tags: { auto: [], boomer: [] } },
  readRow({ title: "Granny VR", status: "finished", link: "https://mihappyl.itch.io/granny-vr-unofficial", developer: "MihappyL", boomertags: "VR" }));
assert.equal(hand.origin, "boomer"); assert.equal(hand.addedBy, null); assert.equal(hand.cover, null); assert.equal(hand.status, "finished");
assert.deepEqual(hand.developers, ["MihappyL"]);
assert.deepEqual(hand.links, { itch: "https://mihappyl.itch.io/granny-vr-unofficial" });
assert.deepEqual(hand.tags.boomer, ["VR"]);
assert.deepEqual(byHandDraft({ tags: {} }, readRow({ title: "Granny Legacy", link: "https://gamejolt.com/games/grannylegacy/1011593" })).links, { official: "https://gamejolt.com/games/grannylegacy/1011593" });

console.log("check-import-vault: ok");
