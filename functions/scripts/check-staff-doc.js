#!/usr/bin/env node
// functions/scripts/check-staff-doc.js: checks for the staff-doc text format (shared/staff-doc.js): "# "
// headings become sections; paragraphs, "- " bullets, **bold** and [A]-style keys survive; anything else is
// refused, not guessed at. A made-up sample here; the real guide stays out of the repo. No network.
//   npm run check
const assert = require("assert/strict");
const fs = require("fs");
const path = require("path");

(async () => {
  const src = fs.readFileSync(path.join(__dirname, "..", "..", "shared", "staff-doc.js"), "utf8");
  const { parseDoc, toBlocks, runsOf } = await import(`data:text/javascript;base64,${Buffer.from(src).toString("base64")}`);

  const md = "﻿# First part\r\n- **One**: a bullet.\r\n- Two\r\n\r\n# Second part\r\nA paragraph that\r\nwraps.\r\n\r\nAnother one.   \r\n\r\n\r\n\r\n# Keys\r\nClick, then [A] yes, [R] no.\r\n";
  const doc = parseDoc(md);
  assert.deepEqual(doc.sections.map((s) => s.title), ["First part", "Second part", "Keys"]);
  assert.equal(doc.sections[0].body, "- **One**: a bullet.\n- Two");
  assert.equal(doc.sections[1].body, "A paragraph that\nwraps.\n\nAnother one.", "blank lines collapse, trailing spaces go");

  // the body -> blocks with text runs
  assert.deepEqual(toBlocks(doc.sections[0].body), [{ type: "ul", items: [[{ t: "b", v: "One" }, { t: "text", v: ": a bullet." }], [{ t: "text", v: "Two" }]] }]);
  assert.deepEqual(toBlocks(doc.sections[1].body), [{ type: "p", runs: [{ t: "text", v: "A paragraph that wraps." }] }, { type: "p", runs: [{ t: "text", v: "Another one." }] }]);
  assert.deepEqual(runsOf("Click, then [A] yes, [R] no."), [{ t: "text", v: "Click, then " }, { t: "kbd", v: "A" }, { t: "text", v: " yes, " }, { t: "kbd", v: "R" }, { t: "text", v: " no." }]);
  assert.deepEqual(toBlocks("Intro line\n- a\n- b\nAfter"), [{ type: "p", runs: [{ t: "text", v: "Intro line" }] }, { type: "ul", items: [[{ t: "text", v: "a" }], [{ t: "text", v: "b" }]] }, { type: "p", runs: [{ t: "text", v: "After" }] }]);
  assert.deepEqual(runsOf("plain [not a key!] and **"), [{ t: "text", v: "plain [not a key!] and **" }], "only short keys and closed bold");
  // "* " bullets are read as "- "
  assert.equal(parseDoc("# T\n* x").sections[0].body, "- x");

  // refused, never guessed
  for (const [bad, why] of [["No heading here", "text before"], ["## Sub\ntext", "only"], ["# T\n<script>x</script>", "HTML"], ["# T\n```\ncode\n```", "code"], ["# Empty", "no text"], ["", "no"], [`# ${"x".repeat(81)}\ny`, "heading"], [`# T\n${"y".repeat(2001)}`, "longer"]]) {
    assert.throws(() => parseDoc(bad), new RegExp(why), JSON.stringify(bad).slice(0, 40));
  }
  console.log("check-staff-doc: ok");
})().catch((err) => { console.error(err); process.exit(1); });
