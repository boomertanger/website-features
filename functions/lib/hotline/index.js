// Hotline Boom, the site's contact service (docs/specs/hotline-boom.md §5 to §8). Everything under sites/boomertanger/hotline/main is written ONLY
// here (Admin SDK); firestore.rules gives the browser read access to what §7 allows and no writes.
//
//   contactSend      anyone (visitors too)   a message on one of six lines: Turnstile, honeypot, idempotency (clientRef), rate limits (visitors 3 an hour
//                                            per ipHash, members 5 a day), minors and Business, lines on/off, the name check, the lane, ref BT-<n>, stats,
//                                            one notifyOutbox contact-new (no message text, no sender name), the owner's email copy (Business/Private,
//                                            only when email is on). -> { ref, lane, replyTime }
//   contactAction    owner + inbox admins    { lane, id, action: status | assign | spam | escalate, value }
//   contactNote      owner + inbox admins    { lane, id, text } an internal note
//   contactReply     owner + inbox admins    { lane, id, text, from, markWaiting, manual } -> { sent: true } | { sent: false, reason: "email-off", to, subject, text, mailto }
//   contactSettings  owner                   updates hotline/main
// Inbox admins = signed in with a crewGrade claim in hotline/main.inboxGrades (default A2, A3). Owner-lane messages: the owner only.
// Errors carry details.reason (rate-limited + retryAt, bad-input + field, check-failed, line-off, not-allowed, gone).
//
// build(deps) is what scripts/check-hotline.js runs against the in-memory Firestore: { db, adminLogEntry, now, fetchFn, secrets: { turnstile(), salt(),
// resend() }, getUserEmail(uid) }.
const crypto = require("crypto");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const admin = require("firebase-admin");
const L = require("./logic");
const M = require("./mail");
const { verifyTurnstile } = require("../security/turnstile");

const SITE_ID = "boomertanger";
const SITE = `sites/${SITE_ID}`;
const BASE = `${SITE}/hotline/main`;
const HOUR_MS = 3600000;
const LIMIT_VISITOR = 3, LIMIT_MEMBER = 5;
const ID_SAFE = /^[A-Za-z0-9_-]{1,100}$/;
const fail = (code, message, reason, extra = {}) => new HttpsError(code, message, { reason, ...extra });
const ms = (t) => (t == null ? null : typeof t === "number" ? t : typeof t.toMillis === "function" ? t.toMillis() : null);
const sha = (s) => crypto.createHash("sha256").update(String(s)).digest("hex");

function build(deps = {}) {
  const db = deps.db || admin.firestore();
  const { FieldValue, Timestamp } = admin.firestore;
  const now = deps.now || Date.now;
  const fetchFn = deps.fetchFn || ((...a) => fetch(...a));
  const secrets = deps.secrets || {};
  const getUserEmail = deps.getUserEmail || (async (uid) => { try { return (await admin.auth().getUser(uid)).email || null; } catch { return null; } });
  const mainRef = db.doc(BASE);
  const col = (lane) => db.collection(`${BASE}/${lane}Messages`);
  const msgRef = (lane, id) => db.doc(`${BASE}/${lane}Messages/${id}`);
  const notesOf = (lane, id) => db.collection(`${BASE}/${lane}Messages/${id}/hotlineNotes`);
  const limitRef = (key) => db.doc(`${BASE}/limits/${key}`);
  const TS = (m) => Timestamp.fromMillis(m);

  /** hotline/main merged over the defaults; written with the defaults the first time it's read. */
  async function loadMain() {
    const snap = await mainRef.get();
    if (!snap.exists) { await mainRef.set(L.DEFAULT_MAIN); return L.mergeMain({}); }
    return L.mergeMain(snap.data());
  }
  const ownerUid = async () => ((await db.doc(SITE).get()).get("ownerUid")) || null;
  /** The caller and what they may read: { uid, owner, inbox, name }. */
  async function who(request, main) {
    const uid = request.auth && request.auth.uid;
    if (!uid) throw fail("unauthenticated", "Sign in first.", "signedOut");
    const owner = (await ownerUid()) === uid;
    const grade = request.auth.token && request.auth.token.crewGrade;
    const inbox = owner || (typeof grade === "string" && main.inboxGrades.includes(grade));
    const p = await db.doc(`${SITE}/profiles/${uid}`).get();
    return { uid, owner, inbox, name: p.exists && p.get("handle") ? `@${p.get("handle")}` : "Staff" };
  }
  const laneOk = (w, lane) => (lane === "owner" ? w.owner : lane === "team" ? w.inbox : false);
  async function staff(request, lane) {
    const main = await loadMain();
    const w = await who(request, main);
    if (!w.inbox) throw fail("permission-denied", "The inbox is for the owner and the admins who help with it.", "not-allowed");
    if (lane !== undefined && !["team", "owner"].includes(lane)) throw fail("invalid-argument", "Which lane?", "bad-input", { field: "lane" });
    if (lane !== undefined && !laneOk(w, lane)) throw fail("permission-denied", "That message is for the owner only.", "not-allowed");
    return { w, main };
  }
  async function log(w, action, { lane, id, ref, details }) {
    await db.collection("adminLog").add(await deps.adminLogEntry(db, {
      feature: "hotline", action, itemPath: lane && id ? `${BASE}/${lane}Messages/${id}` : BASE, itemTitle: ref ? L.refLabel(ref) : "Hotline Boom",
      actorUid: w.uid, actorName: w.name, details,
    }));
  }
  /** The inbox admins today (uids): admins on the roster whose grade (A1..A3) is in inboxGrades. */
  async function inboxAdmins(main) {
    const snap = await db.collection(`${SITE}/crew/main/roster`).where("track", "==", "admin").get();
    return snap.docs.filter((d) => main.inboxGrades.includes(`A${d.get("grade")}`) && !["alumni", "paused"].includes(d.get("status"))).map((d) => d.id);
  }
  /** Crew for the name check: every roster member but the owner, with their current handle and display name. */
  async function crewNames(owner) {
    const roster = (await db.collection(`${SITE}/crew/main/roster`).get()).docs.filter((d) => d.id !== owner && d.get("status") !== "alumni");
    if (!roster.length) return [];
    const profiles = await db.getAll(...roster.map((d) => db.doc(`${SITE}/profiles/${d.id}`)));
    return roster.map((d, i) => ({ uid: d.id, handle: (profiles[i].exists && profiles[i].get("handle")) || d.get("handle") || null,
      name: profiles[i].exists ? profiles[i].get("displayName") || null : null, grade: d.get("track") === "admin" ? `A${d.get("grade")}` : d.get("grade") ?? null }));
  }
  async function outbox(id, doc) {
    try { await db.doc(`${SITE}/notifyOutbox/${id}`).create({ ...doc, status: "pending", createdAt: FieldValue.serverTimestamp(), expireAt: TS(now() + 30 * L.DAY_MS) }); }
    catch (err) { if (!(err.code === 6 || /ALREADY_EXISTS/.test(String(err.message)))) console.error("hotline: outbox failed", String(err.message).slice(0, 120)); }
  }
  const ipOf = (request) => (request.rawRequest && (request.rawRequest.ip || (request.rawRequest.headers && String(request.rawRequest.headers["x-forwarded-for"] || "").split(",")[0].trim()))) || "unknown";

  // ---------- contactSend ----------
  async function send(request) {
    const d = request.data || {};
    const at = now();
    const main = await loadMain();
    if (typeof d.hp === "string" && d.hp.trim()) throw fail("invalid-argument", "That didn't go through. Try again.", "check-failed");   // the honeypot
    if (typeof d.clientRef !== "string" || !/^[A-Za-z0-9_-]{8,64}$/.test(d.clientRef)) throw fail("invalid-argument", "Reload the page and try again.", "bad-input", { field: "clientRef" });
    // member or visitor
    const uid = request.auth && request.auth.uid ? request.auth.uid : null;
    let member = false, ageBand = null, handle = null;
    if (uid) {
      const [u, p] = await Promise.all([db.doc(`users/${uid}`).get(), db.doc(`${SITE}/profiles/${uid}`).get()]);
      if (u.exists && u.get("signedUpAt") && p.exists) { member = true; ageBand = u.get("ageBand") || null; handle = p.get("handle") || null; }
    }
    const v = L.validateSend(d, { member, ageBand, main });
    if (!v.ok) throw fail(v.reason === "line-off" ? "failed-precondition" : "invalid-argument", v.message, v.reason, { field: v.field });
    // Turnstile
    const ip = ipOf(request);
    const tv = await verifyTurnstile({ token: d.turnstile, secret: secrets.turnstile ? secrets.turnstile() : "", ip, fetchFn });
    if (!tv.ok) throw fail("permission-denied", tv.reason === "timeout" ? "The check timed out. Try again." : "The check didn't pass. Try again.", "check-failed");
    const salt = secrets.salt ? secrets.salt() : "";
    if (!salt) throw fail("internal", "The contact form isn't set up yet.", "check-failed");
    const ipHash = crypto.createHmac("sha256", salt).update(ip).digest("hex");
    // the idempotency key and the rate-limit bucket
    const who0 = member ? `u:${uid}` : `ip:${ipHash}`;
    const idemRef = limitRef(`idem_${sha(`${who0}|${d.clientRef}`).slice(0, 40)}`);
    const win = member ? Math.floor(at / L.DAY_MS) : Math.floor(at / HOUR_MS);
    const rlRef = limitRef(`rl_${sha(`${who0}|${member ? "d" : "h"}|${win}`).slice(0, 40)}`);
    const retryAt = member ? (win + 1) * L.DAY_MS : (win + 1) * HOUR_MS;
    const limit = member ? LIMIT_MEMBER : LIMIT_VISITOR;
    // the name check (team lines; never the owner)
    let namecheck = null;
    if (v.value.line.lane === "team" && !v.value.onlyOwner && main.nameCheck) {
      namecheck = L.nameCheck(`${v.value.body}\n${Object.values(v.value.fields).join("\n")}`, await crewNames(await ownerUid()));
    }
    const lane = L.pickLane(v.value.line, { onlyOwner: v.value.onlyOwner, namecheck });
    const status = L.countLinks(v.value.body) > L.MAX_LINKS ? "spam" : "new";
    const via = L.cleanVia(d.via);
    const ref0 = col(lane).doc();
    let out = null;
    await db.runTransaction(async (tx) => {
      const [idem, rl, mainSnap] = await Promise.all([tx.get(idemRef), tx.get(rlRef), tx.get(mainRef)]);
      if (idem.exists) { out = { ...idem.data().result, repeat: true }; return; }
      const count = rl.exists ? rl.get("count") || 0 : 0;
      if (count >= limit) throw fail("resource-exhausted", "That's a lot of messages. Try again later.", "rate-limited", { retryAt });
      const nextRef = mainSnap.exists && Number.isInteger(mainSnap.get("nextRef")) ? mainSnap.get("nextRef") : L.REF_START;
      const msg = {
        ref: nextRef, line: v.value.line.id, lane, status, assignee: null,
        sender: member ? { uid, handle } : v.value.sender, fields: v.value.fields, body: v.value.body,
        source: v.value.source, via, onlyOwner: v.value.onlyOwner, namecheck, escalatedBy: null, ipHash,
        createdAt: TS(at), updatedAt: TS(at), firstReplyAt: null, expireAt: TS(at + (status === "spam" ? L.SPAM_KEEP_MS : L.KEEP_MS)),
      };
      const result = { ref: nextRef, lane, replyTime: main.replyTime, id: ref0.id };
      tx.set(mainRef, { nextRef: nextRef + 1 }, { merge: true });
      tx.set(ref0, msg);
      tx.set(ref0.collection("hotlineNotes").doc(), { kind: "event", by: null, text: "received", at: TS(at), expireAt: msg.expireAt, ...(namecheck ? { event: "namecheck" } : {}) });
      tx.set(rlRef, { count: count + 1, expireAt: TS(at + 2 * L.DAY_MS) });
      tx.set(idemRef, { result, expireAt: TS(at + 2 * L.DAY_MS) });
      const inc = FieldValue.increment(1);
      const stat = { total: inc, lines: { [msg.line]: inc }, ...(msg.source ? { source: { [msg.source]: inc } } : {}), ...(via ? { via: { [via.replace(/\./g, "_")]: inc } } : {}) };
      tx.set(db.doc(`${BASE}/stats/${L.monthKey(at)}`), stat, { merge: true });
      if (lane === "team") tx.set(db.doc(`${BASE}/statsTeam/${L.monthKey(at)}`), stat, { merge: true });
      out = result;
    });
    if (out.repeat) return { ref: out.ref, lane: out.lane, replyTime: out.replyTime };
    if (member && (v.value.source || d.askedSource === true)) { try { await db.doc(`users/${uid}`).set({ hotlineAskedSource: true }, { merge: true }); } catch { /* not worth failing a send */ } }
    const owner = await ownerUid();
    await outbox(`hotline-${out.id}`, { type: "contact-new", audience: "uids", uids: L.audienceFor(lane, owner, lane === "team" ? await inboxAdmins(main) : []),
      subject: { kind: "hotline", id: out.id, lane }, payload: { ref: out.ref, line: v.value.line.id }, dedupeKey: `hotline:${out.id}`, streamId: null, week: null });
    // the owner's own copy (Business, Private), only when email is on
    const line = v.value.line;
    if (["business", "private"].includes(line.id) && main.emailOwner[line.id] && M.emailOn(secrets.resend ? secrets.resend() : "")) {
      const from = member ? `@${handle}` : `${v.value.sender.name} <${v.value.sender.email}>`;
      await M.sendMail({ key: secrets.resend(), to: M.replyFrom(line.from), replyTo: member ? undefined : v.value.sender.email, fetchFn,
        subject: `${line.title} (${L.refLabel(out.ref)})`, text: `From: ${from}\n\n${v.value.body}\n\n${Object.entries(v.value.fields).map(([k, x]) => `${k}: ${x}`).join("\n")}` });
    }
    return { ref: out.ref, lane, replyTime: main.replyTime };
  }

  // ---------- staff actions ----------
  async function loadMsg(lane, id) {
    if (typeof id !== "string" || !ID_SAFE.test(id)) throw fail("invalid-argument", "Which message?", "bad-input", { field: "id" });
    const snap = await msgRef(lane, id).get();
    if (!snap.exists) throw fail("not-found", "That message is gone.", "gone");
    return snap.data();
  }
  const event = (lane, id, by, text, extra, msg) => notesOf(lane, id).add({ kind: "event", by, text, at: TS(now()), expireAt: msg.expireAt, ...extra });

  async function action(request) {
    const d = request.data || {};
    const { w, main } = await staff(request, d.lane);
    const lane = d.lane, id = d.id;
    const msg = await loadMsg(lane, id);
    const at = now();
    if (d.action === "status" || d.action === "spam") {
      const value = d.action === "spam" ? "spam" : d.value;
      if (!L.STATUSES.includes(value)) throw fail("invalid-argument", "Pick a status.", "bad-input", { field: "value" });
      const expireAt = TS(value === "spam" ? at + L.SPAM_KEEP_MS : ms(msg.createdAt) + L.KEEP_MS);
      await msgRef(lane, id).update({ status: value, updatedAt: TS(at), expireAt });
      await event(lane, id, w.uid, `status ${value}`, { event: "status", value }, { expireAt });
      await log(w, "status", { lane, id, ref: msg.ref, details: { from: msg.status, to: value } });
      return { ok: true, status: value };
    }
    if (d.action === "assign") {
      if (lane !== "team") throw fail("failed-precondition", "Owner-only messages can't be assigned.", "not-allowed");
      const to = d.value == null ? null : String(d.value);
      if (to) {
        const owner = await ownerUid();
        if (to !== owner && !(await inboxAdmins(main)).includes(to)) throw fail("invalid-argument", "They don't have the inbox.", "bad-input", { field: "value" });
      }
      await msgRef(lane, id).update({ assignee: to, updatedAt: TS(at) });
      await event(lane, id, w.uid, to ? "assigned" : "unassigned", { event: "assign", value: to }, msg);
      await log(w, "assign", { lane, id, ref: msg.ref, details: { to } });
      return { ok: true, assignee: to };
    }
    if (d.action === "escalate") {
      if (lane !== "team") throw fail("failed-precondition", "It's already owner only.", "not-allowed");
      const notes = await notesOf("team", id).get();
      const batch = db.batch();
      const moved = { ...msg, lane: "owner", assignee: null, escalatedBy: w.uid, updatedAt: TS(at) };
      batch.set(msgRef("owner", id), moved);
      for (const n of notes.docs) { batch.set(notesOf("owner", id).doc(n.id), n.data()); batch.delete(n.ref); }
      batch.set(notesOf("owner", id).doc(), { kind: "event", by: w.uid, text: "escalated to owner only", event: "escalate", at: TS(at), expireAt: msg.expireAt });
      batch.delete(msgRef("team", id));
      await batch.commit();
      await log(w, "escalate", { lane: "owner", id, ref: msg.ref });
      return { ok: true, lane: "owner" };
    }
    throw fail("invalid-argument", "Unknown action.", "bad-input", { field: "action" });
  }

  async function note(request) {
    const d = request.data || {};
    const { w } = await staff(request, d.lane);
    const msg = await loadMsg(d.lane, d.id);
    const text = typeof d.text === "string" ? d.text.trim() : "";
    if (!text || text.length > 2000) throw fail("invalid-argument", "Write a note of up to 2,000 characters.", "bad-input", { field: "text" });
    await notesOf(d.lane, d.id).add({ kind: "note", by: w.uid, text, at: TS(now()), expireAt: msg.expireAt });
    await msgRef(d.lane, d.id).update({ updatedAt: TS(now()) });
    await log(w, "note", { lane: d.lane, id: d.id, ref: msg.ref });
    return { ok: true };
  }

  async function reply(request) {
    const d = request.data || {};
    const { w } = await staff(request, d.lane);
    const msg = await loadMsg(d.lane, d.id);
    const text = typeof d.text === "string" ? d.text.trim() : "";
    if (!text || text.length > L.MAX_BODY) throw fail("invalid-argument", "Write a reply.", "bad-input", { field: "text" });
    if (!L.FROM.includes(d.from)) throw fail("invalid-argument", "Pick the address it comes from.", "bad-input", { field: "from" });
    const line = L.lineById(msg.line) || { title: "Message" };
    const subject = `Re: ${line.title} (${L.refLabel(msg.ref)})`;
    const to = msg.sender && msg.sender.uid ? await getUserEmail(msg.sender.uid) : (msg.sender && msg.sender.email) || null;
    const body = M.signed(text);
    if (d.manual !== true) {
      const key = secrets.resend ? secrets.resend() : "";
      const r = await M.sendMail({ key, to, replyTo: M.replyFrom(d.from), subject, text: body, fetchFn });
      if (!r.sent && r.reason === "email-off") return { sent: false, reason: "email-off", to, subject, text: body, mailto: M.mailtoUrl({ to, subject, text: body }) };
      if (!r.sent) throw fail("unavailable", r.reason === "bad-address" ? "There's no email address to reply to." : "The email didn't send. Try again in a moment.", r.reason === "bad-address" ? "no-address" : "provider");
    }
    const at = now();
    await notesOf(d.lane, d.id).add({ kind: "reply", by: w.uid, from: M.replyFrom(d.from), text, at: TS(at), expireAt: msg.expireAt, ...(d.manual === true ? { manual: true } : {}) });
    const first = msg.firstReplyAt == null;
    await msgRef(d.lane, d.id).update({ status: d.markWaiting === true ? "waiting" : "open", updatedAt: TS(at), ...(first ? { firstReplyAt: TS(at) } : {}) });
    if (first) {
      const k = L.monthKey(ms(msg.createdAt) || at);
      await db.doc(`${BASE}/stats/${k}`).set({ answered: FieldValue.increment(1) }, { merge: true });
      if (d.lane === "team") await db.doc(`${BASE}/statsTeam/${k}`).set({ answered: FieldValue.increment(1) }, { merge: true });
    }
    if (msg.sender && msg.sender.uid) await outbox(`hotline-reply-${d.id}-${at}`, { type: "contact-reply", audience: "uids", uids: [msg.sender.uid], subject: { kind: "hotline", id: d.id, lane: d.lane }, payload: { ref: msg.ref }, streamId: null, week: null });
    await log(w, "reply", { lane: d.lane, id: d.id, ref: msg.ref, details: { from: d.from, manual: d.manual === true } });
    return { sent: true, manual: d.manual === true };
  }

  async function settings(request) {
    const main = await loadMain();
    const w = await who(request, main);
    if (!w.owner) throw fail("permission-denied", "Only the owner changes the Hotline Boom settings.", "not-allowed");
    const d = request.data || {}, patch = {};
    if (d.inboxGrades !== undefined) {
      if (!Array.isArray(d.inboxGrades) || d.inboxGrades.some((g) => !L.GRADES.includes(g))) throw fail("invalid-argument", "Pick admin grades.", "bad-input", { field: "inboxGrades" });
      patch.inboxGrades = [...new Set(d.inboxGrades)].sort();
    }
    if (d.replyTime !== undefined) { const t = typeof d.replyTime === "string" ? d.replyTime.trim() : ""; if (!t || t.length > 40) throw fail("invalid-argument", "Write the reply time (up to 40 characters).", "bad-input", { field: "replyTime" }); patch.replyTime = t; }
    if (d.nameCheck !== undefined) { if (typeof d.nameCheck !== "boolean") throw fail("invalid-argument", "On or off.", "bad-input", { field: "nameCheck" }); patch.nameCheck = d.nameCheck; }
    if (d.emailOwner !== undefined) {
      const e = d.emailOwner || {};
      for (const k of ["business", "private"]) if (e[k] !== undefined) { if (typeof e[k] !== "boolean") throw fail("invalid-argument", "On or off.", "bad-input", { field: `emailOwner.${k}` }); patch[`emailOwner.${k}`] = e[k]; }
    }
    if (d.lines !== undefined) {
      for (const [k, x] of Object.entries(d.lines || {})) { if (!L.LINE_IDS.includes(k) || typeof x !== "boolean") throw fail("invalid-argument", "Lines are on or off.", "bad-input", { field: `lines.${k}` }); patch[`lines.${k}`] = x; }
    }
    if (!Object.keys(patch).length) throw fail("invalid-argument", "Nothing to save.", "bad-input");
    await mainRef.update(patch);
    await log(w, "settings", { details: { changed: Object.keys(patch) } });
    return { ok: true, settings: L.mergeMain((await mainRef.get()).data()) };
  }

  return { loadMain, send, action, note, reply, settings };
}

// The deployed callables. RESEND_API_KEY is bound only when functions/.env says HOTLINE_EMAIL=on (a secret that doesn't exist yet would stop the
// deploy); without it every reply falls back to "Open in my email".
module.exports = function hotline({ adminLogEntry }) {
  const TURNSTILE = defineSecret("TURNSTILE_SECRET_KEY");
  const SALT = defineSecret("CONTACT_HASH_SALT");
  const emailOnAtDeploy = process.env.HOTLINE_EMAIL === "on";
  const RESEND = emailOnAtDeploy ? defineSecret("RESEND_API_KEY") : null;
  const resend = () => (RESEND ? RESEND.value() : "");
  let core = null;
  const H = () => (core ||= build({ adminLogEntry, secrets: { turnstile: () => TURNSTILE.value(), salt: () => SALT.value(), resend } }));
  const mail = RESEND ? [RESEND] : [];
  return {
    contactSend: onCall({ secrets: [TURNSTILE, SALT, ...mail] }, (request) => H().send(request)),
    contactAction: onCall((request) => H().action(request)),
    contactNote: onCall((request) => H().note(request)),
    contactReply: onCall({ secrets: mail }, (request) => H().reply(request)),
    contactSettings: onCall((request) => H().settings(request)),
  };
};
module.exports.build = build;
