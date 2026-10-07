#!/usr/bin/env node
// functions/scripts/build-crew-academy.js: generates functions/data/crew-academy.json from
// docs/specs/crew-academy.md (the confirmed Academy text): the module ids, what each is required for, and
// each module's quiz with the correct answers. academySubmitQuiz grades from that JSON on the server, so
// the answers never reach a browser. Re-run after the text changes; check-crew.js fails if the JSON is stale.
//   node scripts/build-crew-academy.js           # write the file
//   node scripts/build-crew-academy.js --check   # exit 1 if the file differs from the spec
const fs = require("fs");
const path = require("path");

const SPEC = path.join(__dirname, "..", "..", "docs", "specs", "crew-academy.md");
const OUT = path.join(__dirname, "..", "data", "crew-academy.json");

const REQUIRED = { Initiate: "initiate", Watcher: "watcher", Warden: "warden", "Stream Captain": "captain" };
const moduleId = (n) => `m${n}`;

function parse(text) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const modules = [];
  let cur = null, inQuiz = false, q = null;
  const push = () => { if (q && cur) cur.quiz.push(q); q = null; };
  for (const raw of lines) {
    const head = raw.match(/^## (\d+)\. (.+)$/);
    if (head) {
      push();
      cur = { id: moduleId(Number(head[1])), n: Number(head[1]), title: head[2].trim(), slug: null, minutes: null, requiredFor: null, optional: false, soon: false, quiz: [] };
      modules.push(cur); inQuiz = false;
      continue;
    }
    if (/^## /.test(raw)) { push(); cur = null; inQuiz = false; continue; }   // the Admin Academy outline and anything after
    if (!cur) continue;
    const meta = raw.match(/^`([a-z-]+)` · (\d+) min · (.+)$/);
    if (meta) {
      cur.slug = meta[1]; cur.minutes = Number(meta[2]);
      const rest = meta[3];
      const req = rest.match(/^Required for ([A-Za-z ]+?)(?: ·|$)/);
      if (req) cur.requiredFor = REQUIRED[req[1].trim()] || null;
      cur.optional = /^Optional/.test(rest);
      cur.soon = /^Unlocks with/.test(rest);
      continue;
    }
    if (/^\*\*Quiz\*\*/.test(raw)) { inQuiz = true; continue; }
    if (/^---\s*$/.test(raw)) { push(); inQuiz = false; continue; }
    if (!inQuiz) continue;
    const item = raw.match(/^(\d+)\. (.+)$/);
    if (item) {
      push();
      const parts = item[2].split(" · ");
      q = parts.length > 1 ? { q: parts[0].trim(), raw: parts.slice(1), say: "" } : { q: item[2].trim(), raw: null, say: "" };
      continue;
    }
    const sub = raw.match(/^\s+- (.+)$/);
    if (sub && q) {
      if (!sub[1].includes(" · ") && sub[1].startsWith('"')) q.say = sub[1].replace(/^"|"$/g, "");
      else q.raw = sub[1].split(" · ");
    }
  }
  push();
  for (const m of modules) {
    m.quiz = m.quiz.map((x) => {
      const options = x.raw.map((o) => o.replace(/^✓ /, "").trim());
      const marks = x.raw.map((o, i) => (o.startsWith("✓ ") ? i : -1)).filter((i) => i >= 0);
      if (marks.length !== 1) throw new Error(`module ${m.n}: "${x.q}" needs exactly one ✓ answer`);
      return { q: x.q, options, answer: marks[0], say: x.say };
    });
  }
  return modules.filter((m) => m.slug);
}

function build() {
  const modules = parse(fs.readFileSync(SPEC, "utf8"));
  for (const m of modules) {
    if (m.quiz.length !== 5) throw new Error(`module ${m.n} (${m.slug}) has ${m.quiz.length} quiz questions, expected 5`);
    if (m.quiz.some((x) => x.options.length !== 3)) throw new Error(`module ${m.n} (${m.slug}) has a question without 3 options`);
  }
  return { passMark: 4, questions: 5, gears: "gearsValues.academyModule", source: "docs/specs/crew-academy.md", modules };
}

if (require.main === module) {
  const json = JSON.stringify(build(), null, 2) + "\n";
  if (process.argv.includes("--check")) {
    const have = fs.existsSync(OUT) ? fs.readFileSync(OUT, "utf8").replace(/\r\n/g, "\n") : "";
    if (have !== json) { console.error("functions/data/crew-academy.json is out of date: run node scripts/build-crew-academy.js"); process.exit(1); }
    console.log("crew-academy.json is current");
  } else {
    fs.writeFileSync(OUT, json);
    console.log(`wrote ${path.relative(process.cwd(), OUT)}: ${build().modules.length} modules`);
  }
}

module.exports = { build, parse, moduleId };
