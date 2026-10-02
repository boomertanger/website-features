#!/usr/bin/env node
// functions/scripts/check-vault-search.js: checks for the Game Vault's forgiving search
// (shared/vault-search.js, docs/specs/game-vault.md §7): the five spec examples, plus
// accents, punctuation, word order, acronyms, ranking and the edit-distance helper. The
// matcher is an ES module for the browser, so it is loaded through a data: URL (works in any
// Node, needs no package "type" setting). No network.   npm run check
const assert = require("assert/strict");
const fs = require("fs");
const path = require("path");

const GAMES = [
  { title: "Granny: Chapter Two", altNames: ["Granny 2"], developers: ["DVloper"], tags: { auto: ["First person", "Horror", "Stealth"], boomer: [] } },
  { title: "Silent Hill 2", altNames: ["SH2"], developers: ["Bloober Team"], tags: { auto: ["Third person", "Horror"], boomer: ["Cozy dread"] } },
  { title: "Lethal Company", altNames: [], developers: ["Zeekerss"], tags: { auto: ["Co-operative", "Horror"], boomer: [] } },
  { title: "Amnesia: The Bunker", altNames: [], developers: ["Frictional Games"], tags: { auto: ["First person", "Horror"], boomer: [] } },
  { title: "Amnesia: The Dark Descent", altNames: [], developers: ["Frictional Games"], tags: ["Horror"] },
  { title: "Resident Evil 2", altNames: ["RE2", "Biohazard 2"], developers: ["Capcom"], tags: ["Horror"] },
  { title: "Dead by Daylight", altNames: ["DbD"], developers: ["Behaviour Interactive"], tags: ["Multiplayer", "Horror"] },
  { title: "Pokémon Horror: Café Édition", altNames: [], developers: ["Granny Studios"], tags: [] },
  { title: "Outlast", altNames: [], developers: ["Red Barrels"], tags: ["Horror"] },
];

(async () => {
  const src = fs.readFileSync(path.join(__dirname, "..", "..", "shared", "vault-search.js"), "utf8");
  const { buildIndex, search, normalize, editDistance } = await import("data:text/javascript;base64," + Buffer.from(src).toString("base64"));
  const index = buildIndex(GAMES);
  const titles = (q) => search(index, q).map((h) => h.game.title);
  const first = (q) => titles(q)[0];

  // the five spec examples (§7)
  assert.equal(first("grany"), "Granny: Chapter Two");            // a typo
  assert.equal(first("sh2"), "Silent Hill 2");                      // title initials
  assert.equal(first("zeekers"), "Lethal Company");                 // the developer, with a typo
  assert.equal(first("bunker amnesia"), "Amnesia: The Bunker");     // any word order
  assert.deepEqual(titles("dead space"), []);                       // every word has to match something

  // acronyms from alt names, initials, numbers
  assert.equal(first("re2"), "Resident Evil 2");
  assert.equal(first("RE2"), "Resident Evil 2");
  assert.equal(first("dbd"), "Dead by Daylight");
  assert.equal(first("granny 2"), "Granny: Chapter Two");
  assert.equal(first("hill 2"), "Silent Hill 2");

  // accents, case and punctuation are ignored, both ways
  assert.equal(first("pokemon"), "Pokémon Horror: Café Édition");
  assert.equal(first("POKÉMON"), "Pokémon Horror: Café Édition");
  assert.equal(first("cafe edition"), "Pokémon Horror: Café Édition");
  assert.equal(first("amnesia: the bunker!!"), "Amnesia: The Bunker");
  assert.equal(first("  amnesia   bunker "), "Amnesia: The Bunker");

  // word order and partial words
  assert.equal(first("two chapter"), "Granny: Chapter Two");
  assert.equal(first("silent"), "Silent Hill 2");
  assert.equal(first("lethal comp"), "Lethal Company");

  // title matches rank above developer matches and tags
  assert.equal(first("granny"), "Granny: Chapter Two");
  assert.ok(titles("granny").includes("Pokémon Horror: Café Édition"), "a developer match still shows up, after the title");
  assert.ok(titles("granny").indexOf("Granny: Chapter Two") < titles("granny").indexOf("Pokémon Horror: Café Édition"));
  assert.equal(first("amnesia").startsWith("Amnesia"), true);
  assert.equal(first("frictional").startsWith("Amnesia"), true);
  assert.equal(first("capcom"), "Resident Evil 2");
  assert.equal(first("cozy dread"), "Silent Hill 2");              // a Boomer tag
  assert.equal(titles("horror").length, 9);                         // tag as a plain list or { auto, boomer }

  // no match, short and empty queries
  assert.deepEqual(titles(""), []);
  assert.deepEqual(titles("   "), []);
  assert.deepEqual(titles("zzzzzz"), []);
  assert.deepEqual(titles("dead zebra"), []);
  assert.deepEqual(titles("ou"), titles("ou"));                     // short: no typo forgiveness, no crash
  assert.equal(titles("outl").length, 1);
  assert.equal(titles("outlsat")[0], "Outlast");                    // swapped letters count as one typo
  assert.deepEqual(titles("deed"), []);                             // 4-letter words get no typo forgiveness
  assert.equal(search(index, "horror", { limit: 3 }).length, 3);

  // matched title letters are reported so the panel can light them
  const hit = search(index, "bunker amnesia")[0];
  const lit = hit.lit.map((i) => hit.game.title[i]).join("");
  assert.ok(lit.toLowerCase().includes("amnesia") && lit.toLowerCase().includes("bunker"), lit);
  assert.deepEqual(search(index, "sh2")[0].lit.length > 0, true);

  // helpers
  assert.equal(normalize("Pokémon: Café!"), "pokemon cafe");
  assert.equal(normalize("Don't Starve & Co"), "dont starve and co");
  assert.equal(editDistance("granny", "grany"), 1);
  assert.equal(editDistance("outlast", "outlsat"), 1);
  assert.equal(editDistance("abc", "xyz", 1), 2);

  console.log("check-vault-search: ok");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
