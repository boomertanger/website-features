#!/usr/bin/env node
// functions/scripts/seed-boomertang.js — Boomertang's Firestore data (docs/specs/boomertang.md §4a, §5, §13). DRY RUN by default (prints what it
// would write); --apply writes. Staging first. Reads the issue list from site/src/data/boomertang/issues.json and No. 1's polls from its Chat's
// Verdict page (site/src/content/boomertang/v1n1/chats-verdict.md), so the polls are defined in one place.
//
//   node functions/scripts/seed-boomertang.js                          # dry run, staging
//   node functions/scripts/seed-boomertang.js --apply                  # staging: tang/main, No. 1 published (the newest issue), No. 1's polls
//   node functions/scripts/seed-boomertang.js --project production     # dry run, production: No. 1 as a DRAFT (publish it from the desk at
//                                                                      # launch) and its polls; tang/main without a newest issue yet
//   node functions/scripts/seed-boomertang.js --samples --apply        # STAGING ONLY: also sample issues No. 2 to 4 from the gitignored text in
//                                                                      # functions/scripts/data/boomertang/<id>/ (No. 2 members-only, No. 3 public,
//                                                                      # No. 4 members-only and the newest), their pages into issues/{id}/pages/{slug}
//   node functions/scripts/seed-boomertang.js --clean --apply          # STAGING ONLY: removes the sample issues (and their pages and polls) and makes
//                                                                      # the newest real published issue the current one again
// Safe to run again: an issue that exists keeps its status, access, publishedAt and edition log; a poll that exists keeps its counts, its
// open / closed state and its votes (only its question and options are refreshed). Members-only text never leaves this machine except into
// Firestore. Needs Application Default Credentials (gcloud auth application-default login).
const fs = require("fs");
const path = require("path");
const admin = require("firebase-admin");

const SITE = "sites/boomertanger", BASE = `${SITE}/tang/main`;
const REPO = path.join(__dirname, "..", "..");
const SAMPLE_ACCESS = { v1n2: "members", v1n3: "public", v1n4: "members" };

function parseArgs(argv) {
  const a = { project: "staging", apply: false, samples: false, clean: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--apply") a.apply = true;
    else if (argv[i] === "--samples") a.samples = true;
    else if (argv[i] === "--clean") a.clean = true;
    else if (argv[i] === "--project") a.project = argv[++i];
    else throw new Error(`Unknown argument: ${argv[i]}`);
  }
  if (a.samples && a.clean) throw new Error("Use --samples or --clean, not both.");
  return a;
}
function resolveProjectId(name) {
  try { return JSON.parse(fs.readFileSync(path.join(REPO, ".firebaserc"), "utf8")).projects?.[name] ?? name; } catch { return name; }
}
const readIssues = () => JSON.parse(fs.readFileSync(path.join(REPO, "site/src/data/boomertang/issues.json"), "utf8")).issues;
/** The polls block of an issue's Chat's Verdict page. */
function pollsOf(file) {
  if (!fs.existsSync(file)) return [];
  const m = /^```polls\n([\s\S]*?)^```/m.exec(fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n"));
  return m ? JSON.parse(m[1]) : [];
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const projectId = resolveProjectId(args.project);
  const staging = /staging/.test(projectId);
  if ((args.samples || args.clean) && !staging) throw new Error(`--samples and --clean are staging only: refusing to run against "${projectId}".`);
  admin.initializeApp({ projectId });
  const db = admin.firestore();
  const { FieldValue } = admin.firestore;
  console.log(`Project: ${projectId} (${args.apply ? "writing" : "dry run: nothing is written"})${args.samples ? " · with sample issues" : ""}${args.clean ? " · CLEAN-UP of the sample issues" : ""}\n`);
  const issues = readIssues();
  const real = issues.filter((i) => !i.sample), samples = issues.filter((i) => i.sample);
  const plan = [];
  const say = (line) => console.log(`  ${line}`);

  if (args.clean) {
    for (const s of samples) {
      const ref = db.doc(`${BASE}/issues/${s.id}`);
      const pages = await ref.collection("pages").listDocuments();
      const polls = await db.collection(`${BASE}/polls`).where("issueId", "==", s.id).get();
      const votes = (await Promise.all(polls.docs.map((p) => db.collection(`${BASE}/pollVotes`).where("pollId", "==", p.id).get()))).flatMap((q) => q.docs);
      say(`delete issues/${s.id}${pages.length ? ` and its ${pages.length} page(s)` : ""}${polls.size ? `, ${polls.size} poll(s) and ${votes.length} vote(s)` : ""}`);
      plan.push(async () => { for (const p of pages) await p.delete(); for (const v of votes) await v.ref.delete(); for (const p of polls.docs) await db.recursiveDelete(p.ref); await ref.delete(); });
    }
    // the newest real published issue becomes the current one again
    const docs = await Promise.all(real.map((i) => db.doc(`${BASE}/issues/${i.id}`).get()));
    const published = real.filter((_, k) => docs[k].exists && docs[k].get("status") === "published").sort((a, b) => (a.vol - b.vol) || (a.no - b.no));
    const current = published.length ? published.at(-1).id : null;
    say(`set tang/main.currentIssueId = ${current ?? "(none)"}`);
    plan.push(() => db.doc(BASE).set({ currentIssueId: current }, { merge: true }));
    return run(plan, args.apply);
  }

  // ---- the issues ----
  const list = args.samples ? [...real, ...samples] : real;
  let newest = null;
  for (const i of list) {
    const ref = db.doc(`${BASE}/issues/${i.id}`);
    const snap = await ref.get();
    const textInRepo = i.textInRepo === true;
    // staging: everything published (No. 1 at go-live, the samples to test with); production: drafts, published from the desk at launch
    const status = staging ? "published" : "draft";
    const access = textInRepo ? "public" : SAMPLE_ACCESS[i.id] || "members";
    if (snap.exists) {
      say(`issues/${i.id}: exists (${snap.get("status")}, ${snap.get("access")}); refresh vol, no, title and textInRepo only`);
      plan.push(() => ref.set({ vol: i.vol, no: i.no, title: i.title, textInRepo, ...(i.sample ? { sample: true } : {}) }, { merge: true }));
      if (snap.get("status") === "published") newest = !newest || i.vol > newest.vol || (i.vol === newest.vol && i.no > newest.no) ? i : newest;
    } else {
      say(`issues/${i.id}: create "${i.title}" (${status}, ${access}${textInRepo ? ", text in the repo" : ""})`);
      plan.push(() => ref.set({ vol: i.vol, no: i.no, title: i.title, status, access, textInRepo, publishedAt: status === "published" ? FieldValue.serverTimestamp() : null, editions: [], ...(i.sample ? { sample: true } : {}) }));
      if (status === "published") newest = !newest || i.vol > newest.vol || (i.vol === newest.vol && i.no > newest.no) ? i : newest;
    }
    // members-only text (the sample issues here; real members-only issues the same way, once they exist): pages from the gitignored folder
    if (!textInRepo) {
      const dir = path.join(__dirname, "data", "boomertang", i.id);
      if (!fs.existsSync(dir)) { say(`  ! ${path.relative(REPO, dir)} isn't on this machine: no pages for ${i.id}`); continue; }
      for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".md"))) {
        const body = fs.readFileSync(path.join(dir, f), "utf8").replace(/\r\n/g, "\n");
        say(`  issues/${i.id}/pages/${f.slice(0, -3)}: ${body.length} characters`);
        plan.push(() => ref.collection("pages").doc(f.slice(0, -3)).set({ body, updatedAt: FieldValue.serverTimestamp() }));
      }
    }
  }
  // ---- tang/main ----
  const main = await db.doc(BASE).get();
  const current = main.exists ? main.get("currentIssueId") || null : null;
  const want = newest ? newest.id : current;
  if (!main.exists || current !== want) {
    say(`tang/main: currentIssueId ${current ?? "(none)"} -> ${want ?? "(none: publish No. 1 from the desk)"}`);
    plan.push(() => db.doc(BASE).set({ currentIssueId: want ?? null }, { merge: true }));
  } else say(`tang/main: currentIssueId stays ${current}`);

  // ---- the polls (from each issue's Chat's Verdict page) ----
  for (const i of list.filter((x) => x.textInRepo)) {
    for (const p of pollsOf(path.join(REPO, `site/src/content/boomertang/${i.id}/chats-verdict.md`))) {
      const ref = db.doc(`${BASE}/polls/${p.id}`);
      const snap = await ref.get();
      const options = p.options.map((o) => ({ id: o.id, label: o.label }));
      if (snap.exists) {
        say(`polls/${p.id}: exists (${snap.get("open") ? "open" : "closed"}); refresh the question and options, keep the counts`);
        const counts = { ...Object.fromEntries(options.map((o) => [o.id, 0])), ...(snap.get("counts") || {}) };
        plan.push(() => ref.set({ question: p.question, options, counts }, { merge: true }));
      } else {
        say(`polls/${p.id}: create "${p.question}" (${options.length} options, open, no votes)`);
        plan.push(() => ref.set({ issueId: i.id, question: p.question, options, counts: Object.fromEntries(options.map((o) => [o.id, 0])), open: true, closesAt: null, closedAt: null, ...(p.sample ? { sample: true } : {}) }));
      }
    }
  }
  // ---- the cover QR's ref tag in Traffic Pulse (spec §9), the same shape /admin/pulse's refSave writes; kept if it's there ----
  const tagRef = db.doc(`${SITE}/pulse/main/refs/tang-cover`);
  if ((await tagRef.get()).exists) say("pulse refs/tang-cover: exists, kept");
  else {
    say("pulse refs/tang-cover: create (Boomertang cover QR, /boomertang)");
    plan.push(() => tagRef.set({ tag: "tang-cover", label: "Boomertang cover QR", path: "/boomertang", by: { uid: null, name: "seed-boomertang" }, updatedAt: FieldValue.serverTimestamp() }));
  }
  return run(plan, args.apply);
}

async function run(plan, apply) {
  if (!apply) { console.log(`\nDry run: ${plan.length} write(s) planned. Add --apply to write them.`); return; }
  for (const step of plan) await step();
  console.log(`\nDone: ${plan.length} write(s).`);
}

main().catch((e) => { console.error(`seed-boomertang: ${e.message}`); process.exit(1); });
