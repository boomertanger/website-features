// Chat Games, packs and the pool (docs/specs/chat-games.md §10, §11, §12, §13; part 3; mod-machina.md §11c). Created by the engine (index.js) with its helpers.
//
//   chatGamePackSave({ op, ... })   op create { formatId, title, vaultGameIds } · edit { packId, title?, vaultGameIds? } · addCard { packId, card } ·
//                                   editCard { packId, cardId, card } · deleteCard { packId, cardId } · approve { packId } · retire { packId }
//                                   The owner does everything (a pack the owner creates is approved on save). Wardens and up (and admins) create and edit
//                                   DRAFT packs only. Only the owner deletes a card, and only one that was never used on stream (used cards are edited);
//                                   packs are never deleted, only retired.
//   chatGameCardSuggest({ packId, card })   crew Watcher and up: one card into an approved pack's Suggested lane (10 pending each at most)
//   chatGameCardDecide({ packId, suggestionId, action, card?, reason? })   the owner: approve (optionally edited) adds the card and pays the suggester
//                                   +2 Gears (grantGears source "cardSuggest", ref the new card id: key cardSuggest:{cardId}:{uid}); reject keeps an optional reason
//   chatGameFormatSet({ formatId, enabled })   the owner switches a format on or off (formats/{formatId}.enabled only)
//   draw(packId, { skip }) / markUsed(packId, cardId, streamId)   for Hot Seat, Would You Rather and Predictions (parts 4 and 5)
// Every staff write goes to adminLog under "chatGames". Card limits and the text filter are in plogic.js (the same filter as Questions).
const { onCall } = require("firebase-functions/v2/https");
const L = require("./logic");
const PL = require("./plogic");
const { isProfane } = require("../accounts/validate");

const SITE_ID = "boomertanger";
const BASE = `sites/${SITE_ID}/chatGames/main`;
const CARD_GEARS = 2;

module.exports = function packs(ctx, { gears = null, log, caller, refuse } = {}) {
  const { db, Timestamp, fail, now, ms } = ctx;
  const G = () => gears || (gears = require("../crew/gears").makeGears({ db, now }));
  const packRef = (id) => db.doc(`${BASE}/packs/${id}`);
  const packsCol = () => db.collection(`${BASE}/packs`);
  const sugRef = (packId, id) => db.doc(`${BASE}/packs/${packId}/suggested/${id}`);
  const TS = (m) => Timestamp.fromMillis(m);
  const idOk = (x) => typeof x === "string" && L.ID_SAFE.test(x);
  const bad = (message, reason = "bad-input", extra = {}) => fail("invalid-argument", message, reason, extra);
  const denied = (message, reason = "notAllowed") => fail("permission-denied", message, reason);
  /** who() plus the roster's track and status (the grade rules in plogic need them). */
  const person = (w) => ({ ...w, track: w.roster ? w.roster.track : null, status: w.roster ? w.roster.status : null });
  const shape = (formatId, card) => {
    const s = PL.cardShape(formatId, card, { isProfane });
    if (!s.ok) throw bad(s.message, s.reason, { field: s.field });
    return s.card;
  };
  const asPack = (s) => (s && s.exists ? { id: s.id, ...s.data() } : null);

  // ---------- packs and cards ----------
  async function save(w0, d) {
    const w = person(w0);
    const op = d && d.op;
    const at = now();
    if (op === "create") {
      if (!w.isOwner && !PL.isWardenPlus(w)) throw denied("Wardens and up write packs.", "notWarden");
      if (!PL.PACK_FORMATS.includes(d.formatId)) throw bad("Pick a format that uses packs.", "bad-input", { field: "formatId" });
      const title = PL.clean(d.title);
      if (!title || title.length > PL.MAX_TITLE) throw bad(`Name the pack (up to ${PL.MAX_TITLE} characters).`, "bad-input", { field: "title" });
      const ref = packsCol().doc();
      const doc = { formatId: d.formatId, title, vaultGameIds: vaultIds(d.vaultGameIds), status: w.isOwner ? "approved" : "draft", cards: [], createdBy: w.uid, createdByHandle: w.handle || null, createdAt: TS(at), updatedAt: TS(at) };
      await ref.set(doc);
      await log(w, "pack:create", { title: `Pack: ${title}`, details: { packId: ref.id, formatId: d.formatId, status: doc.status } });
      return { ok: true, packId: ref.id, status: doc.status };
    }
    if (!idOk(d && d.packId)) throw bad("Which pack?", "bad-input", { field: "packId" });
    let out = { ok: true };
    await db.runTransaction(async (tx) => {
      const p = asPack(await tx.get(packRef(d.packId)));
      if (!p) throw fail("not-found", "That pack is gone.", "gone");
      const cards = [...(p.cards || [])];
      const patch = { updatedAt: TS(at), updatedBy: w.uid };
      if (op === "approve" || op === "retire") {
        if (!w.isOwner) throw denied("Only the owner approves and retires packs.", "notOwner");
        if (op === "approve" && p.status !== "draft") throw refuse("already");
        if (op === "retire" && p.status === "retired") throw refuse("already");
        patch.status = op === "approve" ? "approved" : "retired";
      } else {
        if (!PL.canEditPack(w, p)) throw denied(p.status === "draft" ? "Wardens and up edit draft packs." : "Only the owner edits an approved pack. Suggest a card instead.", "notAllowed");
        if (op === "edit") {
          if (d.title !== undefined) { const t = PL.clean(d.title); if (!t || t.length > PL.MAX_TITLE) throw bad(`Name the pack (up to ${PL.MAX_TITLE} characters).`, "bad-input", { field: "title" }); patch.title = t; }
          if (d.vaultGameIds !== undefined) patch.vaultGameIds = vaultIds(d.vaultGameIds);
        } else if (op === "addCard") {
          if (cards.length >= PL.MAX_CARDS) throw fail("resource-exhausted", `A pack holds ${PL.MAX_CARDS} cards. Start a new pack.`, "packFull");
          const c = { id: PL.newCardId(), ...shape(p.formatId, d.card), usedOn: [], addedBy: w.uid, addedAt: at };
          cards.push(c); patch.cards = cards; out = { ok: true, cardId: c.id };
        } else if (op === "editCard" || op === "deleteCard") {
          const n = cards.findIndex((c) => c.id === d.cardId);
          if (n < 0) throw fail("not-found", "That card is gone.", "gone");
          if (op === "editCard") { cards[n] = { ...cards[n], ...shape(p.formatId, d.card), editedBy: w.uid, editedAt: at }; }
          else {
            if (!w.isOwner) throw denied("Only the owner deletes cards.", "notOwner");
            if ((cards[n].usedOn || []).length) throw fail("failed-precondition", "That card was used on stream, so it can only be edited.", "usedCard");
            cards.splice(n, 1);
          }
          patch.cards = cards;
        } else throw bad("Unknown action.", "bad-input", { field: "op" });
      }
      tx.update(packRef(d.packId), patch);
      out.title = p.title;
    });
    await log(w, `pack:${op}`, { title: `Pack: ${out.title}`, details: { packId: d.packId, ...(d.cardId ? { cardId: d.cardId } : {}), ...(out.cardId ? { cardId: out.cardId } : {}) } });
    delete out.title;
    return out;
  }
  const vaultIds = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === "string" && L.ID_SAFE.test(x)).slice(0, 20) : []);

  // ---------- the Suggested lane ----------
  /** asCaptain: Save to pack from a Would You Rather or Predictions run (part 5): the Captain of the stream, any grade, suggests the typed prompt. */
  async function suggest(w0, d, { asCaptain = false } = {}) {
    const w = person(w0);
    if (!asCaptain && !PL.isWatcherPlus(w)) throw denied("Crew Watcher and up suggest cards.", "notWatcher");
    if (!idOk(d && d.packId)) throw bad("Which pack?", "bad-input", { field: "packId" });
    const p = asPack(await packRef(d.packId).get());
    if (!p) throw fail("not-found", "That pack is gone.", "gone");
    if (p.status !== "approved") throw fail("failed-precondition", "Suggest cards into an approved pack.", "notApproved");
    const card = shape(p.formatId, d.card);
    const mine = await packRef(d.packId).collection("suggested").where("by", "==", w.uid).get();
    if (mine.docs.filter((x) => x.get("status") === "pending").length >= PL.MAX_PENDING) throw fail("resource-exhausted", "You have 10 suggestions waiting in this pack. Give the owner a moment.", "limit");
    const ref = packRef(d.packId).collection("suggested").doc();
    await ref.set({ ...card, formatId: p.formatId, packId: d.packId, by: w.uid, byHandle: w.handle || null, createdAt: TS(now()), status: "pending", reason: null });
    return { ok: true, suggestionId: ref.id };
  }
  async function decide(w, d) {
    if (!w.isOwner) throw denied("Only the owner reviews suggestions.", "notOwner");
    if (!idOk(d && d.packId) || !idOk(d && d.suggestionId)) throw bad("Which suggestion?");
    if (!["approve", "reject"].includes(d.action)) throw bad("Approve or reject?", "bad-input", { field: "action" });
    const at = now();
    let res = null;
    await db.runTransaction(async (tx) => {
      const [ps, ss] = await Promise.all([tx.get(packRef(d.packId)), tx.get(sugRef(d.packId, d.suggestionId))]);
      const p = asPack(ps), s = ss.exists ? ss.data() : null;
      if (!p || !s) throw fail("not-found", "That suggestion is gone.", "gone");
      if (s.status !== "pending") throw refuse("already");
      if (d.action === "reject") {
        const reason = PL.clean(d.reason).slice(0, 200) || null;
        tx.update(sugRef(d.packId, d.suggestionId), { status: "rejected", reason, decidedAt: TS(at), decidedBy: w.uid });
        res = { ok: true, status: "rejected", by: s.by };
        return;
      }
      const card = d.card ? shape(p.formatId, d.card) : shape(p.formatId, { text: s.text, options: s.options });
      if ((p.cards || []).length >= PL.MAX_CARDS) throw fail("resource-exhausted", `A pack holds ${PL.MAX_CARDS} cards.`, "packFull");
      const c = { id: PL.newCardId(), ...card, usedOn: [], addedBy: w.uid, addedAt: at, suggestedBy: s.by, suggestedByHandle: s.byHandle || null };
      tx.update(packRef(d.packId), { cards: [...(p.cards || []), c], updatedAt: TS(at) });
      tx.update(sugRef(d.packId, d.suggestionId), { status: "approved", cardId: c.id, edited: !!d.card, decidedAt: TS(at), decidedBy: w.uid });
      res = { ok: true, status: "approved", cardId: c.id, by: s.by, byHandle: s.byHandle || null };
    });
    let gearsPaid = 0;
    if (res.status === "approved") {
      try { const g = await G().grantGears(res.by, "cardSuggest", res.cardId, CARD_GEARS); gearsPaid = g && g.granted ? g.amount : 0; }
      catch (err) { console.error("chatGames: card Gears failed", String((err && err.message) || err).slice(0, 140)); }
    }
    await log(w, `card:${d.action}`, { title: "Chat Games pool", details: { packId: d.packId, suggestionId: d.suggestionId, ...(res.cardId ? { cardId: res.cardId } : {}), gears: gearsPaid } });
    return { ok: true, status: res.status, cardId: res.cardId || null, gears: gearsPaid, byHandle: res.byHandle || null };
  }

  // ---------- format switches ----------
  async function formatSet(w, d) {
    if (!w.isOwner) throw denied("Only the owner switches formats on and off.", "notOwner");
    if (!idOk(d && d.formatId)) throw bad("Which format?", "bad-input", { field: "formatId" });
    if (typeof d.enabled !== "boolean") throw bad("On or off?", "bad-input", { field: "enabled" });
    const ref = db.doc(`${BASE}/formats/${d.formatId}`);
    if (!(await ref.get()).exists) throw fail("not-found", "That format isn't in the registry.", "gone");
    await ref.update({ enabled: d.enabled, updatedAt: TS(now()) });
    await log(w, "format:set", { title: `Format: ${d.formatId}`, details: { formatId: d.formatId, enabled: d.enabled } });
    return { ok: true, enabled: d.enabled };
  }

  // ---------- draw and mark used (Hot Seat, Would You Rather, Predictions) ----------
  async function draw(packId, { skip = [], rng = Math.random } = {}) {
    const p = asPack(await packRef(packId).get());
    if (!p || p.status !== "approved") return null;
    const c = PL.drawCard(p, { nowMs: now(), skip, rng });
    return c ? { packId, formatId: p.formatId, card: c } : null;
  }
  async function markUsed(packId, cardId, streamId) {
    const at = now();
    await db.runTransaction(async (tx) => {
      const p = asPack(await tx.get(packRef(packId)));
      if (!p) return;
      const cards = (p.cards || []).map((c) => (c.id === cardId ? { ...c, usedOn: [...(c.usedOn || []).filter((u) => u && u.streamId !== streamId), { streamId, at }] } : c));
      tx.update(packRef(packId), { cards });
    });
  }

  const wrap = (fn) => async (request) => fn(await caller(request), request.data || {});
  return {
    functions: { chatGamePackSave: onCall(wrap(save)), chatGameCardSuggest: onCall(wrap(suggest)), chatGameCardDecide: onCall(wrap(decide)), chatGameFormatSet: onCall(wrap(formatSet)) },
    ops: { packSave: save, cardSuggest: suggest, suggestAsCaptain: (w, d) => suggest(w, d, { asCaptain: true }), cardDecide: decide, formatSet, draw, markUsed },
  };
};
