// Chat Games, packs and the pool: pure rules (docs/specs/chat-games.md §10, §11; mod-machina.md §11c). No Firestore here: packs.js reads, calls these, writes.
//
//   PACK_FORMATS          the formats that use packs: hot-seat, would-you-rather, predictions
//   cardShape(formatId, input, { isProfane })   { ok, card: { text, options? } } | { ok: false, field, reason, message }
//        hot-seat           text up to 140
//        would-you-rather   a lead line up to 80 ("Would you rather…" when empty) plus exactly two options of up to 80
//        predictions        a question up to 120 plus 2 to 4 answers of up to 40
//   canEditPack(who, pack)    the owner edits any pack; Wardens and up (and admins) only drafts
//   isWardenPlus(who) / isWatcherPlus(who)   who: { isOwner, isAdmin, isMod, grade, track, status }
//   recentlyUsed(card, nowMs) a card used on stream in the last 30 days
//   drawCard(pack, { nowMs, skip, rng })   the draw: unused-in-30-days cards first (any of them, at random); when none are left, the least recently used
//   usedOnLabel(card)         the latest use, for the card rows
const PACK_FORMATS = ["hot-seat", "would-you-rather", "predictions"];
const STATUS = ["draft", "approved", "retired"];
const RECENT_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_CARDS = 300, MAX_TITLE = 60, MAX_PENDING = 10;
const LIMITS = {
  "hot-seat": { text: 140 },
  "would-you-rather": { text: 80, options: [2, 2], option: 80, lead: "Would you rather…" },
  predictions: { text: 120, options: [2, 4], option: 40 },
};
const LINK = /(https?:\/\/|www\.|\b[a-z0-9-]{2,}\.(com|net|org|gg|tv|io|ly|me|co|xyz|app|live|info|biz|us|uk)\b)/i;
const clean = (s) => String(s == null ? "" : s).replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim();
const bad = (field, reason, message) => ({ ok: false, field, reason, message });

function part(raw, max, field, label, { isProfane, required = true }) {
  const t = clean(raw);
  if (!t) return required ? bad(field, "empty", `Write the ${label}.`) : { ok: true, text: "" };
  if (t.length > max) return bad(field, "tooLong", `Keep the ${label} under ${max} characters.`);
  if (LINK.test(t)) return bad(field, "link", "Links can't go on a card.");
  if (isProfane(t)) return bad(field, "blocked", "That has words we don't allow. Try it another way.");
  return { ok: true, text: t };
}

function cardShape(formatId, input, { isProfane = () => false } = {}) {
  const lim = LIMITS[formatId];
  if (!lim) return bad("formatId", "badFormat", "That format has no packs.");
  const i = input || {};
  if (formatId === "hot-seat") {
    const t = part(i.text, lim.text, "text", "card", { isProfane });
    return t.ok ? { ok: true, card: { text: t.text } } : t;
  }
  const t = part(i.text, lim.text, "text", formatId === "predictions" ? "question" : "lead line", { isProfane, required: formatId === "predictions" });
  if (!t.ok) return t;
  const opts = Array.isArray(i.options) ? i.options.map(clean).filter(Boolean) : [];
  const [min, max] = lim.options;
  if (opts.length < min || opts.length > max) return bad("options", "options", formatId === "predictions" ? "Give 2 to 4 answers." : "Give two options.");
  for (let n = 0; n < opts.length; n++) {
    const o = part(opts[n], lim.option, `options.${n}`, formatId === "predictions" ? "answer" : "option", { isProfane });
    if (!o.ok) return o;
    opts[n] = o.text;
  }
  if (new Set(opts.map((o) => o.toLowerCase())).size !== opts.length) return bad("options", "duplicate", "Each option needs to be different.");
  return { ok: true, card: { text: t.text || lim.lead, options: opts } };
}

const isWatcherPlus = (w) => !!w && (w.isOwner || w.isAdmin || (w.isMod && w.track !== "admin" && ["active", "checkIn"].includes(w.status) && (w.grade || 0) >= 2));
const isWardenPlus = (w) => !!w && (w.isOwner || w.isAdmin || (w.isMod && w.track !== "admin" && ["active", "checkIn"].includes(w.status) && (w.grade || 0) >= 3));
const canEditPack = (w, pack) => !!w && (w.isOwner || (isWardenPlus(w) && (!pack || pack.status === "draft")));

const lastUse = (card) => Math.max(0, ...((card && card.usedOn) || []).map((u) => Number(u && u.at) || 0));
const recentlyUsed = (card, nowMs) => lastUse(card) > 0 && nowMs - lastUse(card) < RECENT_MS;

function drawCard(pack, { nowMs = Date.now(), skip = [], rng = Math.random } = {}) {
  const avoid = new Set(skip || []);
  const cards = ((pack && pack.cards) || []).filter((c) => c && c.id && !avoid.has(c.id));
  if (!cards.length) return null;
  const fresh = cards.filter((c) => !recentlyUsed(c, nowMs));
  if (fresh.length) return fresh[Math.floor(rng() * fresh.length) % fresh.length];
  return [...cards].sort((a, b) => lastUse(a) - lastUse(b))[0];   // everything was used lately: the one used longest ago
}
const usedOnLabel = (card) => { const t = lastUse(card); return t ? t : null; };
const newCardId = (rng = Math.random) => `c${Date.now().toString(36)}${Math.floor(rng() * 1e9).toString(36)}`;

module.exports = { PACK_FORMATS, STATUS, LIMITS, RECENT_MS, MAX_CARDS, MAX_TITLE, MAX_PENDING, cardShape, isWatcherPlus, isWardenPlus, canEditPack, recentlyUsed, lastUse, drawCard, usedOnLabel, newCardId, clean };
