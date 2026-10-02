#!/usr/bin/env node
// functions/scripts/check-import-vault.js: checks for import-vault.js's CSV reading and row
// rules (quotes, commas and newlines inside quotes, status, score, legacy counts). No network,
// no Firestore, no credentials.   npm run check
const assert = require("assert/strict");
const fs = require("fs");
const path = require("path");
const { parseCsv, readRow } = require("./import-vault");

let rows = parseCsv('title,steam,status\r\n"Granny, Chapter ""Two""",,finished\r\n"Multi\nline",https://store.steampowered.com/app/1/x,\r\n\r\n');
assert.equal(rows.length, 2);
assert.equal(rows[0].title, 'Granny, Chapter "Two"');
assert.equal(rows[0].status, "finished");
assert.equal(rows[1].title, "Multi\nline");
assert.equal(rows[0].line, 2);
assert.equal(parseCsv("﻿Title,STATUS\nX,Playing").length, 1, "a BOM and header case are tolerated");
assert.equal(parseCsv("")[0], undefined);
assert.equal(parseCsv("title\n")[0], undefined);

assert.deepEqual(readRow({ title: "X" }), { status: "wishlist", score: null, verdict: "", legacy: { streamCount: 0, minutes: 0, lastStreamedAt: null }, title: "X", steam: undefined });
const full = readRow({ title: "X", status: "Finished", score: "9", verdict: "  Great   game ", legacy_streams: "12", legacy_minutes: "1800", legacy_last: "2025-11-02" });
assert.equal(full.status, "finished"); assert.equal(full.score, 9); assert.equal(full.verdict, "Great game");
assert.deepEqual(full.legacy, { streamCount: 12, minutes: 1800, lastStreamedAt: Date.UTC(2025, 10, 2, 12) });
for (const bad of [{ title: "X", status: "sideways" }, { title: "X", score: "11" }, { title: "X", score: "0" }, { title: "X", score: "7.5" },
  { title: "X", verdict: "v".repeat(141) }, { title: "X", legacy_streams: "-1" }, { title: "X", legacy_minutes: "abc" },
  { title: "X", legacy_last: "11/02/2025" }, { title: "X", legacy_last: "2999-01-01" }, { status: "playing" }]) {
  assert.ok(readRow(bad).error, JSON.stringify(bad));
}

// the sample CSV in the fixtures reads: 10 rows, 4 of them with problems
const sample = parseCsv(fs.readFileSync(path.join(__dirname, "fixtures", "vault", "import-sample.csv"), "utf8"));
assert.equal(sample.length, 10);
assert.equal(sample.filter((r) => readRow(r).error).length, 2);

console.log("check-import-vault: ok");
