#!/usr/bin/env node
// functions/scripts/inbox-sample.js: two weeks of SAMPLE Hotline Boom inbox work on staging (Talk Back Part B, docs/specs/talk-back.md §9), so
// /admin/inbox's credit lines, the This month strip, the Clear desk pips, /crew/board's Inbox column and Operator of the Month have something to
// show. STAGING ONLY: it refuses any production project, even named deliberately. Application Default Credentials and the Admin SDK.
//
// It writes team-lane messages (sample: true, sample senders) and then runs the REAL code (lib/hotline build(): contactReply, contactAction,
// lib/hotline/credit.js spamHold and deskCheck) on a moved clock, in time order, as the inbox admins on the roster (grade in inboxGrades, not the
// owner): fast and slow first replies, the oldest first, a close with no reply needed, spam that held, a reply reversed as spam, an escalation,
// 04:15 spam-hold runs and 21:00 desk checks (a 7-day clear run pays Clear desk). Today ends with three waiting messages, one picked up.
// The Gears it pays are real ledger rows on staging (the boards rebuild); what it created is listed in hotline/main/inboxStats/sample so
// --clean can take it all back: the sample messages (and their history, and an escalated copy), those ledger rows, the inboxStats months it
// touched (marked sample: true), its adminLog entries (sample: true); then the boards rebuild.
// Usage (from the repo root or functions/):
//   node functions/scripts/inbox-sample.js                          # dry run: the plan
//   node functions/scripts/inbox-sample.js --apply                  # write it (as of today, America/Chicago)
//   node functions/scripts/inbox-sample.js --as-of 2026-10-31 --apply
//   node functions/scripts/inbox-sample.js --clean --apply          # remove it
//   --project <name|id>  default staging
const fs = require("fs");
const path = require("path");

const DAY = 86400000, H = 3600000;
const BODIES = ["Love the streams, keep it up!", "How do I join the crew?", "The arcade froze on my phone.", "Can you play Phasmophobia again?", "Is there a schedule for next week?",
  "My badge didn't show up.", "Thanks for the shout-out last night!", "Where do I find the VOD?", "Quick question about the Discord.", "The sound was low on Tuesday's stream."];
const LINES = ["hi", "feedback", "help"];

function parseArgs(argv) {
  const a = { project: "staging", apply: false, clean: false, asOf: null };
  for (let i = 0; i < argv.length; i++) {
    const x = argv[i];
    if (x === "--project") a.project = argv[++i];
    else if (x.startsWith("--project=")) a.project = x.slice(10);
    else if (x === "--as-of") a.asOf = argv[++i];
    else if (x.startsWith("--as-of=")) a.asOf = x.slice(8);
    else if (x === "--apply") a.apply = true;
    else if (x === "--clean") a.clean = true;
    else throw new Error(`Unknown argument: ${x}`);
  }
  if (a.asOf && !/^\d{4}-\d{2}-\d{2}$/.test(a.asOf)) throw new Error("--as-of is a date: YYYY-MM-DD");
  return a;
}
function resolveProjectId(nameOrId) {
  try { const rc = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "..", ".firebaserc"), "utf8")); return rc.projects?.[nameOrId] ?? nameOrId; }
  catch { return nameOrId; }
}
const chicagoDay = (ms) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago" }).format(new Date(ms));
const chicagoHour = (ms) => Number(new Intl.DateTimeFormat("en-GB", { timeZone: "America/Chicago", hour: "2-digit", hour12: false }).format(new Date(ms)));
/** day hh:mm in Chicago, as UTC milliseconds (CDT or CST). */
function chicago(day, hh, mm = 0) {
  for (const off of [5, 6]) { const t = Date.parse(`${day}T00:00:00Z`) + (hh + off) * H + mm * 60000; if (chicagoDay(t) === day && chicagoHour(t) === hh % 24) return t; }
  throw new Error(`no Chicago time for ${day} ${hh}:${mm}`);
}
const addDay = (day, n) => new Date(Date.parse(`${day}T12:00:00Z`) + n * DAY).toISOString().slice(0, 10);

/** The plan: messages and what happens to them, as time-ordered events (pure). */
function plan(today, staff) {
  const msgs = [], ev = [];
  let n = 0;
  const who = (i) => staff[i % staff.length];
  const add = (day, hh, mm) => { const k = n++; const at = chicago(day, hh, mm); msgs.push({ k, at, line: LINES[k % 3], body: BODIES[k % BODIES.length] }); ev.push({ at, kind: "create", k }); return k; };
  for (let d = 13; d >= 1; d--) {
    const day = addDay(today, -d);
    const a = add(day, 9, 10 + d), b = add(day, 11, 40);
    ev.push({ at: chicago(day, 9, 10 + d) + 2 * H, kind: "reply", k: a, by: who(d) });                     // fast
    if (d === 10) { ev.push({ at: chicago(day, 11, 40) + 3 * H, kind: "reply", k: b, by: who(d + 1) }); ev.push({ at: chicago(day, 11, 40) + 5 * H, kind: "spam", k: b, by: who(d + 1) }); }   // reversed
    else if (d === 12 || d === 9) ev.push({ at: chicago(day, 11, 40) + H, kind: "spam", k: b, by: who(0) });   // spam that holds
    else if (d === 6) ev.push({ at: chicago(day, 11, 40) + 4 * H, kind: "close", k: b, by: who(0) });          // no reply needed
    else if (d === 3) { ev.push({ at: chicago(day, 11, 40) + H, kind: "reply", k: b, by: who(1) }); ev.push({ at: chicago(day, 11, 40) + 2 * H, kind: "escalate", k: b, by: who(1) }); }
    else ev.push({ at: chicago(day, 11, 40) + 30 * H, kind: "reply", k: b, by: who(d + 1) });              // slow, next day
    ev.push({ at: chicago(day, 4, 15), kind: "spamHold" });
    ev.push({ at: chicago(day, 21, 0), kind: "deskCheck" });
  }
  const c1 = add(today, 7, 30), c2 = add(today, 8, 5), c3 = add(today, 8, 45);
  ev.push({ at: chicago(today, 9, 0), kind: "pickUp", k: c1, by: who(0) });
  ev.push({ at: chicago(today, 4, 15), kind: "spamHold" });
  void c2; void c3;
  ev.sort((x, y) => x.at - y.at || (x.kind === "create" ? -1 : 0));
  return { msgs, ev };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const projectId = resolveProjectId(args.project);
  if (/prod/i.test(String(projectId)) || /prod/i.test(String(args.project)) || !/staging/i.test(String(projectId))) throw new Error(`Refusing ${projectId}: inbox-sample.js runs on staging only.`);
  const admin = require("firebase-admin");
  admin.initializeApp({ projectId });
  const db = admin.firestore();
  const { Timestamp, FieldValue } = admin.firestore;
  const SITE = "sites/boomertanger", B = `${SITE}/hotline/main`, sampleRef = db.doc(`${B}/inboxStats/sample`);
  const gears = require("../lib/crew/gears").makeGears({ db });

  if (args.clean) {
    const rec = (await sampleRef.get()).data() || { ledgerIds: [], months: [] };
    const refs = [];
    for (const lane of ["teamMessages", "ownerMessages"]) for (const d of (await db.collection(`${B}/${lane}`).where("sample", "==", true).get()).docs) {
      refs.push(...(await d.ref.collection("hotlineNotes").listDocuments()), d.ref);
    }
    if (!rec.ledgerIds && rec.ledgerBefore) {
      const before = new Set(rec.ledgerBefore), { INBOX_SOURCES } = require("../lib/crew/gears");
      rec.ledgerIds = (await db.collection(`${SITE}/crew/main/gears`).get()).docs.filter((d) => !before.has(d.id) && (INBOX_SOURCES.includes(d.get("source")) || (d.get("source") === "adjust" && d.get("reason") === "Marked as spam"))).map((d) => d.id);
    }
    for (const id of rec.ledgerIds || []) refs.push(db.doc(`${SITE}/crew/main/gears/${id}`));
    for (const m of rec.months || []) { const r = db.doc(`${B}/inboxStats/${m}`), s = await r.get(); if (s.exists && s.get("sample")) refs.push(r); }
    refs.push(...(await db.collection("adminLog").where("sample", "==", true).get()).docs.filter((d) => d.get("feature") === "hotline").map((d) => d.ref));
    console.log(`${projectId} · --clean · ${refs.length} docs (${(rec.ledgerIds || []).length} Gears rows, months ${(rec.months || []).join(", ") || "none"})${args.apply ? "" : " · DRY RUN (add --apply)"}`);
    if (!args.apply) return;
    const w = db.bulkWriter();
    refs.forEach((r) => w.delete(r));
    w.delete(sampleRef);
    await w.close();
    await gears.rebuildBoards();
    console.log(`  deleted ${refs.length} docs; boards rebuilt.`);
    return;
  }

  const today = args.asOf || chicagoDay(Date.now());
  if (today > chicagoDay(Date.now())) throw new Error("--as-of can't be in the future.");
  if ((await sampleRef.get()).exists) throw new Error("Sample inbox data is already there. Run --clean --apply first.");
  const owner = (await db.doc(SITE).get()).get("ownerUid") || null;
  const main0 = (await db.doc(B).get()).data() || {};
  const grades = main0.inboxGrades || ["A2", "A3"];
  const roster = (await db.collection(`${SITE}/crew/main/roster`).where("track", "==", "admin").get()).docs
    .filter((d) => d.id !== owner && grades.includes(`A${d.get("grade")}`) && !["alumni", "paused"].includes(d.get("status")));
  if (!roster.length) throw new Error(`No inbox admins on the roster (grades ${grades.join(", ")}, not the owner). Promote one first.`);
  const staff = roster.map((d) => ({ uid: d.id, grade: `A${d.get("grade")}`, handle: d.get("handle") || d.id }));
  const { msgs, ev } = plan(today, staff.map((s) => s.uid));
  console.log(`${projectId} · as of ${today} (America/Chicago) · ${msgs.length} sample messages, ${ev.length} events${args.apply ? "" : " · DRY RUN (add --apply)"}`);
  console.log(`  inbox admins: ${staff.map((s) => `@${s.handle} (${s.grade})`).join(", ")}`);
  const kinds = ev.reduce((m, e) => ((m[e.kind] = (m[e.kind] || 0) + 1), m), {});
  console.log(`  ${Object.entries(kinds).map(([k, v]) => `${k} ${v}`).join(" · ")}`);
  if (!args.apply) return;

  let clock = ev[0].at;
  const core = require("../lib/hotline").build({ db, now: () => clock, secrets: {}, getUserEmail: async () => null,
    adminLogEntry: async (_d, f) => ({ ...Object.fromEntries(Object.entries(f).filter(([, v]) => v !== undefined)), sample: true, createdAt: Timestamp.fromMillis(clock) }) });
  const gradeOf = new Map(staff.map((s) => [s.uid, s.grade]));
  const req = (uid, data) => ({ auth: { uid, token: uid === owner ? {} : { crewGrade: gradeOf.get(uid) } }, data, rawRequest: { ip: "sample" } });
  const ledgerBefore = new Set((await db.collection(`${SITE}/crew/main/gears`).listDocuments()).map((r) => r.id));
  const planMonths = [...new Set(ev.map((e) => chicagoDay(e.at).slice(0, 7)))];
  await sampleRef.set({ sample: true, partial: true, asOf: today, ledgerBefore: [...ledgerBefore], months: planMonths, at: FieldValue.serverTimestamp() });
  for (const m of planMonths) await db.doc(`${B}/inboxStats/${m}`).set({ sample: true }, { merge: true });
  const ids = new Map(), months = new Set();
  let nextRef = Number.isInteger(main0.nextRef) ? main0.nextRef : 4800;
  await db.doc(B).set({ nextRef: nextRef + msgs.length }, { merge: true });   // reserved, so real messages never reuse a sample ref
  for (const e of ev) {
    clock = e.at;
    months.add(chicagoDay(clock).slice(0, 7));
    if (e.kind === "create") {
      const m = msgs[e.k], ref = db.collection(`${B}/teamMessages`).doc();
      const expireAt = Timestamp.fromMillis(m.at + 120 * DAY);
      await ref.set({ ref: nextRef++, line: m.line, lane: "team", status: "new", assignee: null, sender: { name: `Sample fan ${m.k + 1}`, email: `sample+${m.k + 1}@example.com` },
        fields: {}, body: `${m.body} (sample)`, source: null, via: null, onlyOwner: false, namecheck: null, escalatedBy: null, ipHash: null,
        createdAt: Timestamp.fromMillis(m.at), updatedAt: Timestamp.fromMillis(m.at), firstReplyAt: null, expireAt, sample: true,
        ...(m.line === "feedback" ? { kind: "feedback", context: null, boombotShown: null } : {}) });
      await ref.collection("hotlineNotes").add({ kind: "event", by: null, text: "received", at: Timestamp.fromMillis(m.at), expireAt });
      ids.set(e.k, ref.id);
    } else if (e.kind === "reply") await core.reply(req(e.by, { lane: "team", id: ids.get(e.k), text: "Thanks for writing in! (sample reply)", from: "fanmail", markWaiting: true, manual: true }));
    else if (e.kind === "spam") await core.action(req(e.by, { lane: "team", id: ids.get(e.k), action: "spam" }));
    else if (e.kind === "close") await core.action(req(e.by, { lane: "team", id: ids.get(e.k), action: "status", value: "done" }));
    else if (e.kind === "escalate") await core.action(req(e.by, { lane: "team", id: ids.get(e.k), action: "escalate" }));
    else if (e.kind === "pickUp") await core.action(req(e.by, { lane: "team", id: ids.get(e.k), action: "pickUp" }));
    else if (e.kind === "spamHold") { const r = await core.credit.spamHold(clock); if (r.paid) console.log(`  ${chicagoDay(clock)} spam hold: ${r.paid} paid`); }
    else if (e.kind === "deskCheck") { const r = await core.credit.deskCheck(clock); console.log(`  ${r.day} desk: ${r.clear ? "clear" : `${r.waiting} waiting`}, streak ${r.streak}${r.bonus ? `, Clear desk paid to ${r.bonus.paid.length}` : ""}`); }
  }
  for (const m of months) await db.doc(`${B}/inboxStats/${m}`).set({ sample: true }, { merge: true });
  const ledgerIds = (await db.collection(`${SITE}/crew/main/gears`).listDocuments()).map((r) => r.id).filter((id) => !ledgerBefore.has(id));
  await sampleRef.set({ sample: true, asOf: today, ledgerIds, months: [...new Set([...planMonths, ...months])], messageIds: [...ids.values()], at: FieldValue.serverTimestamp() });
  await gears.rebuildBoards();
  const paid = (await Promise.all(ledgerIds.map((id) => db.doc(`${SITE}/crew/main/gears/${id}`).get()))).reduce((t, s) => t + (s.get("amount") || 0), 0);
  console.log(`  wrote ${msgs.length} messages; ${ledgerIds.length} Gears rows (net ${paid}); months ${[...months].join(", ")}; boards rebuilt.`);
}

if (require.main === module) main().catch((e) => { console.error(e.message || e); process.exit(1); });
module.exports = { plan, chicago };
