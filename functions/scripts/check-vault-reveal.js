#!/usr/bin/env node
// functions/scripts/check-vault-reveal.js: checks for what a Game Vault card says about its game
// (shared/vault-reveal.js): the hover panel, the status line and the meta line follow the game's
// status, so a finished game never reads "Not played yet". ES module, loaded through a data: URL like
// check-vault-search.js. No network.   npm run check
const assert = require("assert/strict");
const fs = require("fs");
const path = require("path");

(async () => {
  const src = fs.readFileSync(path.join(__dirname, "..", "..", "shared", "vault-reveal.js"), "utf8");
  const { reveal, statusLine, metaLine } = await import(`data:text/javascript;base64,${Buffer.from(src).toString("base64")}`);
  const G = (o) => ({ status: "finished", verdict: null, streams: 0, minutes: 0, last: null, wanted: 0, ttb: null, by: null, ...o });

  // 1. a verdict: the verdict, quoted, and the streams (or the status line when there are none)
  assert.deepEqual(reveal(G({ verdict: "The house never lets you settle.", streams: 6, minutes: 840 })), { title: "The house never lets you settle.", quoted: true, line: "6 streams, 14 h on stream" });
  assert.deepEqual(reveal(G({ verdict: "Short and nasty.", ttb: 2 })), { title: "Short and nasty.", quoted: true, line: "Finished · about 2 h to beat" });

  // 2. played, no verdict: "No review yet" and a status line, never "Not played yet"
  for (const status of ["playing", "finished", "abandoned"]) {
    const r = reveal(G({ status }));
    assert.equal(r.title, "No review yet", status);
    assert.equal(r.quoted, false);
    assert.notEqual(r.title, "Not played yet");
  }
  assert.equal(reveal(G({ streams: 3, minutes: 300 })).line, "Finished · 3 streams, 5 h on stream", "streams when there are any");
  assert.equal(reveal(G({ streams: 4, minutes: 540, ttb: 6 })).line, "Finished · 4 streams, 9 h on stream", "streams (including history before the site) beat the time to beat");
  assert.equal(reveal(G({ ttb: 6 })).line, "Finished · about 6 h to beat", "the time to beat when there are no streams");
  assert.equal(reveal(G({})).line, "Finished", "just the status when there's nothing else");
  assert.equal(reveal(G({ status: "abandoned", streams: 1, minutes: 60 })).line, "Abandoned · 1 stream, 1 h on stream");
  assert.equal(reveal(G({ status: "playing", ttb: 12 })).line, "Playing · about 12 h to beat");

  // 3. wishlist: "Not played yet", with "N want it" when N > 0
  assert.deepEqual(reveal(G({ status: "wishlist", wanted: 3 })), { title: "Not played yet", quoted: false, line: "3 want it" });
  assert.equal(reveal(G({ status: "wishlist" })).line, "On the Wishlist", "no wants: no count");
  assert.equal(reveal(G({ status: "wishlist", wanted: 1, by: "gbo" })).line, "1 want it. Community pick by @gbo");

  // statusLine and metaLine
  assert.equal(statusLine(G({ status: "wishlist" })), "On the Wishlist");
  assert.equal(metaLine(G({ streams: 6, last: Date.UTC(2026, 8, 12, 12) })), "6 streams, last Sep 12");
  assert.equal(metaLine(G({ ttb: 6 })), "About 6 h to beat", "a finished game with no streams isn't 'Not streamed yet'");
  assert.equal(metaLine(G({})), "No streams on record yet", "the badge already says Finished");
  assert.equal(metaLine(G({ status: "wishlist", wanted: 2 })), "Not streamed yet, 2 want it");
  assert.equal(metaLine(G({ status: "wishlist" })), "Not streamed yet");

  console.log("check-vault-reveal: ok");
})().catch((err) => { console.error(err); process.exit(1); });
