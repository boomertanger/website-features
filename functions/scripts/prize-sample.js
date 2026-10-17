#!/usr/bin/env node
// functions/scripts/prize-sample.js — Prize Box sample data for STAGING (docs/specs/prize-box.md; docs/testing/prize-box-test-plan.md). It refuses any other
// project. Dry run by default (it prints what it would write); --apply writes; --clean --apply removes everything it made (and only that).
//
// What it makes, all marked "(sample)" in its titles and sample: true in its documents, with five sample members (pz-sample-1 … 5, Admin SDK users with
// no password, so nobody can sign in as them; pz-sample-5 is 13-17):
//   Break Wheel (sample)            a live contest, scheduled for Break 1, with Round 1 groups (run it from /live/control on a staging stream)
//   Ghost Story Night (sample)      an online contest taking written entries, open, judged: four entries (submitted, accepted, rejected, submitted)
//   Haunted Postcard (sample)       a mail-in contest, open, random draw: three codes (one received, one late, one not here yet), one unmatched envelope
//   Summer Sketch Night (sample)    a finished judged contest: two winners (a mailed prize claimed and waiting to ship, a code prize waiting to be claimed)
// Nothing is granted (no badges, no XP, no feed posts, no alerts): it writes the documents directly, then rebuilds public/prizeBox. The real
// members, the owner and every non-sample document are never touched.
//
// Needs Application Default Credentials (gcloud auth application-default login). From the repo root or functions/:
//   node functions/scripts/prize-sample.js                     # dry run
//   node functions/scripts/prize-sample.js --apply             # write it
//   node functions/scripts/prize-sample.js --clean             # dry run of the clean-up
//   node functions/scripts/prize-sample.js --clean --apply     # remove everything it made
const fs = require("fs");
const path = require("path");
const admin = require("firebase-admin");

const SITE = "sites/boomertanger", BASE = `${SITE}/prizeBox/main`;
const SAMPLE_UIDS = [1, 2, 3, 4, 5].map((n) => `pz-sample-${n}`);
const HANDLES = ["samplecrypt", "sampleowl", "samplehex", "samplemoth", "sampleteen"];
const DAY = 86400000;

function parseArgs(argv) {
  const a = { project: "staging", apply: false, clean: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--apply") a.apply = true;
    else if (argv[i] === "--clean") a.clean = true;
    else if (argv[i] === "--project") a.project = argv[++i];
    else throw new Error(`Unknown argument: ${argv[i]}`);
  }
  return a;
}
function resolveProjectId(name) {
  try { return JSON.parse(fs.readFileSync(path.join(__dirname, "..", "..", ".firebaserc"), "utf8")).projects?.[name] ?? name; } catch { return name; }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const projectId = resolveProjectId(args.project);
  if (!/staging/.test(projectId)) throw new Error(`Staging only: refusing to run against "${projectId}".`);
  admin.initializeApp({ projectId });
  const db = admin.firestore();
  const { Timestamp, FieldValue } = admin.firestore;
  console.log(`Project: ${projectId} (${args.apply ? "writing" : "dry run: nothing is written"})${args.clean ? " · CLEAN-UP" : ""}\n`);
  if (args.clean) return clean(db, args.apply);

  const now = Date.now(), ts = (m) => Timestamp.fromMillis(m);
  const writes = [];
  const set = (p, d) => writes.push([p, d]);
  // the sample members
  SAMPLE_UIDS.forEach((uid, i) => {
    set(`users/${uid}`, { ageBand: i === 4 ? "13-17" : "18+", signedUpAt: ts(now - 120 * DAY), prefs: {}, sample: true });
    set(`${SITE}/profiles/${uid}`, { handle: HANDLES[i], displayName: `${HANDLES[i]} (sample)`, avatar: { type: "initials", initials: "S" + (i + 1) }, joinedAt: ts(now - 120 * DAY), xp: 0, sample: true });
    set(`${SITE}/members/${uid}`, { roles: [], joinedAt: ts(now - 120 * DAY), rolesChangedBy: { uid: null, name: "prize-sample.js" }, sample: true });
  });
  const by = { uid: "prize-sample", handle: "prize-sample.js" };
  const contest = (id, d) => set(`${BASE}/contests/${id}`, { audience: "members", eligibility: [], round1: [], rulesMd: "", blurb: "", announce: { banner: true, alerts: false, feed: false, plannerTag: null }, counts: { entries: 0, accepted: 0, received: 0 }, createdBy: by, createdAt: ts(now), updatedAt: ts(now), sample: true, ...d });
  contest("sample-break-wheel", { slug: "sample-break-wheel", title: "Break Wheel (sample)", blurb: "Check in on the stream and you're on the wheel. Sample contest.", type: "live", status: "scheduled", method: "wheel", winnersCount: 1,
    prizes: [{ place: 1, title: "A horror game on Steam (sample)", kind: "digital", xp: 0 }], opensAt: null, closesAt: null, draw: { beat: "break1", streamId: null }, entryKind: null,
    round1: [{ group: "Everyone", filter: { kind: "everyone" } }, { group: "Every beat tonight", filter: { kind: "everyBeat" } }, { group: "Members 30 days", filter: { kind: "memberDays", n: 30 } }, { group: "Everyone", filter: { kind: "everyone" } }] });
  contest("sample-ghost-story", { slug: "sample-ghost-story", title: "Ghost Story Night (sample)", blurb: "Write the shortest ghost story that still gets Boomer. Sample contest.", type: "online", status: "open", method: "judge", winnersCount: 2,
    prizes: [{ place: 1, title: "A horror game on Steam (sample)", kind: "digital", xp: 0 }, { place: 2, title: "The Prize Box Winner badge and 150 XP (sample)", kind: "badgeXp", xp: 150 }], opensAt: ts(now - 2 * DAY), closesAt: ts(now + 12 * DAY), draw: null, entryKind: "text",
    counts: { entries: 4, accepted: 1, received: 0 } });
  const text = (uid, i, status, extra = {}) => set(`${BASE}/contests/sample-ghost-story/entries/${uid}`, { uid, handle: HANDLES[i], kind: "text", assetId: null, text: ["The mirror blinked first.", "I heard the stairs walk up to me.", "A copy of a ghost story from a book.", "The baby monitor said goodnight in my voice."][i], title: ["Blink", "Stairs", "Borrowed", "Goodnight"][i], showIfWin: i !== 1, status, rejectReason: null, createdAt: ts(now - (4 - i) * 3600000), updatedAt: ts(now - (4 - i) * 3600000), sample: true, ...extra });
  text(SAMPLE_UIDS[0], 0, "submitted"); text(SAMPLE_UIDS[1], 1, "accepted"); text(SAMPLE_UIDS[2], 2, "rejected", { rejectReason: "It's from a book, and entries must be your own (sample)." }); text(SAMPLE_UIDS[3], 3, "submitted");
  contest("sample-haunted-postcard", { slug: "sample-haunted-postcard", title: "Haunted Postcard (sample)", blurb: "Draw a postcard from a haunted place and mail it in with your code. Sample contest.", type: "mail", status: "open", method: "random", winnersCount: 1,
    prizes: [{ place: 1, title: "A merch store code (sample)", kind: "storeCode", xp: 0 }], opensAt: ts(now - 5 * DAY), closesAt: ts(now + 20 * DAY), draw: null, entryKind: null, counts: { entries: 3, accepted: 0, received: 1 } });
  const codes = [["PB-SAM1", 0, "received", "2026-10-10"], ["PB-SAM2", 1, "rejected", "2026-12-30"], ["PB-SAM3", 4, "submitted", null]];
  for (const [code, i, status, pm] of codes) {
    set(`${BASE}/codes/${code}`, { contestId: "sample-haunted-postcard", uid: SAMPLE_UIDS[i], createdAt: ts(now - 4 * DAY), sample: true });
    set(`${BASE}/contests/sample-haunted-postcard/entries/${SAMPLE_UIDS[i]}`, { uid: SAMPLE_UIDS[i], handle: HANDLES[i], kind: "mail", code, status, showIfWin: true, receivedAt: status === "submitted" ? null : ts(now - DAY), postmarkedOn: pm, rejectReason: status === "rejected" ? "Postmarked after the deadline." : null, createdAt: ts(now - 4 * DAY), updatedAt: ts(now - DAY), sample: true });
    set(`${BASE}/my/${SAMPLE_UIDS[i]}`, { contestIds: FieldValue.arrayUnion("sample-haunted-postcard"), sample: true });
  }
  set(`${BASE}/mailLog/sample-received`, { kind: "received", contestId: "sample-haunted-postcard", code: "PB-SAM1", postmarkedOn: "2026-10-10", by, at: ts(now - DAY), sample: true });
  set(`${BASE}/mailLog/sample-late`, { kind: "late", contestId: "sample-haunted-postcard", code: "PB-SAM2", postmarkedOn: "2026-12-30", by, at: ts(now - DAY), sample: true });
  set(`${BASE}/mailLog/sample-unmatched`, { kind: "unmatched", contestId: "sample-haunted-postcard", code: null, note: "A drawing of a lighthouse, no code on it (sample).", postmarkedOn: "2026-10-12", resolved: false, by, at: ts(now - 2 * DAY), sample: true });
  for (let i = 0; i < 4; i++) set(`${BASE}/my/${SAMPLE_UIDS[i]}`, { contestIds: FieldValue.arrayUnion("sample-ghost-story"), sample: true });
  contest("sample-summer-sketch", { slug: "sample-summer-sketch", title: "Summer Sketch Night (sample)", blurb: "A finished sample contest with its winners.", type: "online", status: "won", method: "judge", winnersCount: 2,
    prizes: [{ place: 1, title: "Your drawing framed for the stream room (sample)", kind: "mailed", xp: 0 }, { place: 2, title: "A horror game on Steam (sample)", kind: "digital", xp: 0 }], opensAt: ts(now - 60 * DAY), closesAt: ts(now - 40 * DAY), draw: null, entryKind: "upload", counts: { entries: 2, accepted: 2, received: 0 }, wonAt: ts(now - 3 * DAY) });
  const winner = (id, i, place, kind, prizeTitle, status, extra = {}) => set(`${BASE}/winners/${id}`, { contestId: "sample-summer-sketch", contestTitle: "Summer Sketch Night (sample)", contestSlug: "sample-summer-sketch", uid: SAMPLE_UIDS[i], handle: HANDLES[i], place, prizeTitle, kind, status, claimBy: ts(now + 4 * DAY), claimedAt: status === "claimed" ? ts(now - DAY) : null, shippedAt: null, showIfWin: true, drawId: null, by, at: ts(now - 3 * DAY), sample: true, ...extra });
  winner("sample-summer-sketch_1", 2, 1, "mailed", "Your drawing framed for the stream room (sample)", "claimed");
  set(`${BASE}/winners/sample-summer-sketch_1/private/claim`, { address: { name: "Sample Person", line1: "1 Sample Street", line2: "", city: "Sample City", state: "MN", zip: "00000", country: "US" }, parentOk: null, ageBand: "18+", claimedAt: ts(now - DAY), sample: true });
  winner("sample-summer-sketch_2", 4, 2, "digital", "A horror game on Steam (sample)", "pending");
  for (const i of [2, 4]) set(`${BASE}/my/${SAMPLE_UIDS[i]}`, { contestIds: FieldValue.arrayUnion("sample-summer-sketch"), sample: true });

  for (const [p] of writes) console.log(`WRITE  ${p}`);
  console.log(`\n${writes.length} documents, 5 sample members (no passwords), 4 sample contests.`);
  if (!args.apply) { console.log("\nDry run: nothing written. Add --apply to write it."); return; }
  for (const uid of SAMPLE_UIDS) await admin.auth().createUser({ uid, email: `${uid}@example.com`, emailVerified: true, disabled: true }).catch((e) => { if (e.code !== "auth/uid-already-exists") throw e; });
  for (const [p, d] of writes) await db.doc(p).set(d, { merge: true });
  await rebuild(db);
  console.log(`\nWritten: ${writes.length} documents. public/prizeBox rebuilt. Remove it all with --clean --apply.`);
}

async function rebuild(db) {
  const pb = require("../lib/prizeBox").build({ db, adminLogEntry: async (_d, f) => f, cloudSecrets: [] });
  await pb.ops.rebuildSummary();
}

async function clean(db, apply) {
  const found = [];
  const add = (ref) => found.push(ref);
  for (const col of ["contests", "winners"]) for (const d of (await db.collection(`${BASE}/${col}`).where("sample", "==", true).get()).docs) add({ ref: d.ref, deep: true });
  for (const col of ["codes", "mailLog", "my"]) for (const d of (await db.collection(`${BASE}/${col}`).where("sample", "==", true).get()).docs) add({ ref: d.ref });
  for (const uid of SAMPLE_UIDS) for (const p of [`${SITE}/members/${uid}`, `${SITE}/profiles/${uid}`, `users/${uid}`]) { const s = await db.doc(p).get(); if (s.exists && s.get("sample") === true) add({ ref: s.ref, member: p.includes("/members/") }); }
  // only sample-made documents are matched: a uid or doc without sample: true is never removed
  for (const f of found) console.log(`DELETE ${f.ref.path}${f.deep ? " (and its subcollections)" : ""}`);
  console.log(`\n${found.length} documents and ${SAMPLE_UIDS.length} sample users.`);
  if (!apply) { console.log("\nDry run: nothing deleted. Add --apply to remove them."); return; }
  for (const f of found.filter((x) => x.member)) await f.ref.delete();   // the member docs first: mirrorMemberRoles runs on that delete
  await new Promise((r) => setTimeout(r, 5000));
  for (const f of found.filter((x) => !x.member)) { if (f.deep) await db.recursiveDelete(f.ref); else await f.ref.delete(); }
  for (const uid of SAMPLE_UIDS) {
    await db.doc(`users/${uid}`).delete().catch(() => {});   // re-written by the role mirror after the member delete (claimsUpdatedAt)
    const logs = await db.collection("adminLog").where("itemPath", "==", `${SITE}/members/${uid}`).get();
    for (const d of logs.docs) await d.ref.delete();
    await admin.auth().deleteUser(uid).catch(() => {});
  }
  await rebuild(db);
  const left = (await db.collection(`${BASE}/contests`).where("sample", "==", true).get()).size + (await db.collection(`${BASE}/winners`).where("sample", "==", true).get()).size;
  console.log(`\nRemoved. Sample contests and winners left: ${left} (should be 0). public/prizeBox rebuilt.`);
}

main().catch((err) => { console.error(err.message || err); process.exit(1); });
