// /crew/games, the Chat Games pool (docs/specs/chat-games.md §10, §11; mod-machina.md §11c; Chat Games part 3; mockup chat-games-batch-1.html "Pool").
// Who sees what (the callables check it all again):
//   owner      the format switches (green admin panel), every pack: New pack, Add a card, Edit, Delete (only cards never used on stream), Approve a draft,
//              Retire; the Suggested lane (Approve, Edit then Approve, Reject with an optional reason; a burst on approve)
//   Warden+    New pack (a draft) and Add / Edit cards in draft packs; Suggest a card and Your suggestions like any Watcher
//   Watcher+   Suggest a card into an approved pack (the format's fields) and Your suggestions (teal Under review, lime Approved · +2 Gears, gray Not used this time)
//   Initiate   reads the pool; suggesting opens at Watcher
// Reads with Firestore Lite (formats, packs, each pack's suggestions: the owner's pending ones, a mod's own); writes through chatGamePackSave,
// chatGameCardSuggest, chatGameCardDecide and chatGameFormatSet. Preview (staging, signed out): ?as=admin (owner), &owner=0 (a Watcher), &grade=3 (a Warden).
import { onAccess } from "./layout";
import { loadCtx, type Ctx } from "./data";
import { crewCall } from "./api";
import { db, collection, getDocs, query, where, SITE_ID } from "../../lib/db";
import { messageFor } from "../../lib/errors";
import { openModal, modalHeader } from "../../../../shared/ui/modal.js";
import { confirmAction } from "../../../../shared/ui/confirm.js";
import { toast } from "../../../../shared/ui/toast.js";
import { burst } from "../../../../shared/ui/burst.js";
import { initSegNavs } from "../../../../shared/ui/seg-nav.js";
import { escapeHtml as esc } from "../../../../shared/ui/dom.js";

type Fmt = "hot-seat" | "would-you-rather" | "predictions";
interface Card { id: string; text: string; options?: string[]; usedOn?: { streamId: string; at: number }[] }
interface Pack { id: string; formatId: Fmt; title: string; vaultGameIds: string[]; status: "draft" | "approved" | "retired"; cards: Card[]; createdByHandle?: string | null }
interface Sug { id: string; packId: string; text: string; options?: string[]; by: string; byHandle: string | null; createdAt: number; status: "pending" | "approved" | "rejected"; reason?: string | null }
interface FormatDoc { id: string; title: string; icon: string; enabled: boolean; order: number }

const root = document.querySelector<HTMLElement>("[data-cgp]")!;
const FORMATS: [Fmt, string][] = [["hot-seat", "Hot Seat"], ["would-you-rather", "Would You Rather"], ["predictions", "Predictions"]];
const LIM: Record<Fmt, { text: number; min: number; max: number; option: number; textLabel: string; optLabel: string; placeholder: string }> = {
  "hot-seat": { text: 140, min: 0, max: 0, option: 0, textLabel: "The card", optLabel: "", placeholder: "One question three players can answer in a line" },
  "would-you-rather": { text: 80, min: 2, max: 2, option: 80, textLabel: "Lead line (optional)", optLabel: "Option", placeholder: "Would you rather…" },
  predictions: { text: 120, min: 2, max: 4, option: 40, textLabel: "The question", optLabel: "Answer", placeholder: "Does Boomer use the shotgun before the village bell?" },
};
const q = () => new URLSearchParams(location.search);
const ms = (v: any): number => (v == null ? 0 : typeof v === "number" ? v : typeof v.toMillis === "function" ? v.toMillis() : 0);
const mascot = () => document.getElementById("bt-mascot-tpl")?.innerHTML ?? "";
const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const day = (t: number) => new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric" });
const ago = (t: number) => { const m = Math.round((Date.now() - t) / 60000); return m < 60 ? `${Math.max(1, m)} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : m < 2880 ? "yesterday" : day(t); };

let ctx: Ctx;
const S = {
  owner: false, warden: false, watcher: false, preview: false,
  formats: [] as FormatDoc[], packs: [] as Pack[], pending: [] as Sug[], mine: [] as Sug[],
  tab: "hot-seat" as Fmt, packId: "", newCardId: "",
};

// ---------- the preview ----------
const NOW = Date.now(), DAY = 86400000;
const PREVIEW = {
  formats: [{ id: "questions", title: "Questions", icon: "❓", enabled: true, order: 1 }, { id: "hot-seat", title: "Hot Seat", icon: "🔥", enabled: true, order: 2 }, { id: "would-you-rather", title: "Would You Rather", icon: "⚖️", enabled: false, order: 3 }, { id: "predictions", title: "Predictions", icon: "🔮", enabled: false, order: 4 }] as FormatDoc[],
  packs: [
    { id: "general", formatId: "hot-seat", title: "General", vaultGameIds: [], status: "approved", cards: [
      { id: "g1", text: "What is the worst possible place to hide from a monster?", usedOn: [{ streamId: "s", at: NOW - 4 * DAY }] }, { id: "g2", text: "Which horror villain would be the worst roommate?" },
      { id: "g3", text: "Describe your last nightmare in five words.", usedOn: [{ streamId: "s", at: NOW - 11 * DAY }] }, { id: "g4", text: "What sound would make you leave a haunted house instantly?" }] },
    { id: "re", formatId: "hot-seat", title: "Resident Evil night", vaultGameIds: ["resident-evil-4"], status: "approved", cards: [{ id: "r1", text: "What's the worst thing to hear on a walkie-talkie at 3 a.m.?" }, { id: "r2", text: "Pitch the merchant a new item.", usedOn: [{ streamId: "s", at: NOW - 4 * DAY }] }] },
    { id: "outlast", formatId: "hot-seat", title: "Outlast night", vaultGameIds: ["outlast"], status: "draft", cards: [{ id: "o1", text: "What's on the night-vision camera that you wish you hadn't seen?" }], createdByHandle: "lanternlou" },
    { id: "classics", formatId: "would-you-rather", title: "Classics", vaultGameIds: [], status: "approved", cards: [{ id: "w1", text: "Would you rather…", options: ["Hide in a locker while something breathes outside", "Crawl a vent you can't turn around in"] }] },
    { id: "re4", formatId: "predictions", title: "Resident Evil 4", vaultGameIds: ["resident-evil-4"], status: "approved", cards: [{ id: "p1", text: "How many tries for the lake boss?", options: ["1", "2-3", "4+"] }] },
  ] as Pack[],
  pending: [
    { id: "s1", packId: "general", text: "What's the one item you'd sell your soul for in a horror game?", by: "u1", byHandle: "nyx", createdAt: NOW - 2 * 3600000, status: "pending" },
    { id: "s2", packId: "general", text: "Give the final boss a terrible day job.", by: "u2", byHandle: "deadbolt", createdAt: NOW - DAY, status: "pending" },
    { id: "s3", packId: "classics", text: "Would you rather…", options: ["Always hear footsteps behind you", "Never see your reflection again"], by: "u3", byHandle: "mothgirl", createdAt: NOW - DAY, status: "pending" },
  ] as Sug[],
  mine: [
    { id: "m1", packId: "general", text: "What would you whisper to a ghost to make it leave?", by: "me", byHandle: "mothmanmike", createdAt: NOW - 3 * 3600000, status: "pending" },
    { id: "m2", packId: "general", text: "Worst co-op partner in a horror game, and why?", by: "me", byHandle: "mothmanmike", createdAt: NOW - 3 * DAY, status: "approved" },
    { id: "m3", packId: "general", text: "Name a scary sound that's actually comforting.", by: "me", byHandle: "mothmanmike", createdAt: NOW - 5 * DAY, status: "rejected", reason: "Too close to one we have" },
  ] as Sug[],
};

// ---------- reads ----------
async function load() {
  if (S.preview) {
    if (!S.formats.length) { S.formats = PREVIEW.formats; S.packs = PREVIEW.packs; S.pending = PREVIEW.pending; S.mine = PREVIEW.mine; }
    return;
  }
  const base = ["sites", SITE_ID, "chatGames", "main"] as const;
  const [fs, ps] = await Promise.all([getDocs(collection(db, ...base, "formats")), getDocs(collection(db, ...base, "packs"))]);
  S.formats = fs.docs.map((d) => ({ id: d.id, title: String(d.get("title") || d.id), icon: String(d.get("icon") || "🎲"), enabled: d.get("enabled") === true, order: Number(d.get("order")) || 0 })).sort((a, b) => a.order - b.order);
  S.packs = ps.docs.map((d) => { const x = d.data() as any; return { id: d.id, formatId: x.formatId, title: String(x.title || d.id), vaultGameIds: x.vaultGameIds || [], status: x.status, cards: (x.cards || []).map((c: any) => ({ ...c, usedOn: (c.usedOn || []).map((u: any) => ({ streamId: u.streamId, at: ms(u.at) })) })), createdByHandle: x.createdByHandle || null } as Pack; })
    .sort((a, b) => (a.status === "retired" ? 1 : 0) - (b.status === "retired" ? 1 : 0) || a.title.localeCompare(b.title));
  const sug = (d: any, packId: string): Sug => ({ id: d.id, packId, text: String(d.get("text") || ""), options: d.get("options") || undefined, by: d.get("by"), byHandle: d.get("byHandle") || null, createdAt: ms(d.get("createdAt")), status: d.get("status"), reason: d.get("reason") || null });
  const lanes = await Promise.all(S.packs.filter((p) => p.status === "approved").map(async (p) => {
    const col = collection(db, ...base, "packs", p.id, "suggested");
    const [pend, mine] = await Promise.all([
      S.owner ? getDocs(query(col, where("status", "==", "pending"))) : Promise.resolve(null),
      S.watcher ? getDocs(query(col, where("by", "==", ctx.uid))) : Promise.resolve(null),
    ]);
    return { pend: pend ? pend.docs.map((d) => sug(d, p.id)) : [], mine: mine ? mine.docs.map((d) => sug(d, p.id)) : [] };
  }));
  S.pending = lanes.flatMap((l) => l.pend).sort((a, b) => a.createdAt - b.createdAt);
  S.mine = lanes.flatMap((l) => l.mine).sort((a, b) => b.createdAt - a.createdAt);
}

// ---------- drawing ----------
const packsOf = (f: Fmt) => S.packs.filter((p) => p.formatId === f);
const cur = () => S.packs.find((p) => p.id === S.packId) || null;
const canEdit = (p: Pack | null) => !!p && (S.owner || (S.warden && p.status === "draft"));
const cardLine = (c: { text: string; options?: string[] }, f: Fmt) => f === "hot-seat" ? esc(c.text) : `${esc(c.text)}<span class="cgp-opts">${(c.options || []).map((o) => `<span class="bt-badge bt-badge--gray">${esc(o)}</span>`).join("")}</span>`;
const lastUse = (c: Card) => Math.max(0, ...(c.usedOn || []).map((u) => u.at || 0));
const statusBadge = (p: Pack) => `<span class="bt-badge bt-badge--${p.status === "draft" ? "blue" : p.status === "approved" ? "lime" : "gray"}"><span class="bt-badge-dot"></span>${p.status === "draft" ? "Draft" : p.status === "approved" ? "Approved" : "Retired"}</span>`;
const card = (title: string, body: string, tools = "", cls = "") => `<section class="bt-card${cls ? ` ${cls}` : ""}"><div class="bt-card-head"><h2 class="bt-card-title">${title}</h2>${tools ? `<div class="cgp-acts">${tools}</div>` : ""}</div>${body}</section>`;

function render() {
  const f = S.tab;
  const list = packsOf(f);
  if (!list.some((p) => p.id === S.packId)) S.packId = (list.find((p) => p.status !== "retired") || list[0])?.id || "";
  const pk = cur();
  const totalCards = S.packs.filter((p) => p.status !== "retired").reduce((n, p) => n + p.cards.length, 0);
  const hero = `<section class="cgp-hero"><div><h1 class="bt-title">Chat Games pool</h1><p>Packs of cards and prompts for every game. ${S.owner ? "You write and approve; the crew suggests." : S.watcher ? "Suggest a card. When Boomertanger approves it, you get 2 Gears." : "Suggesting opens at Watcher. Until then, have a look around."}</p>
    <div class="cgp-stats"><span class="bt-badge bt-badge--gray">${S.formats.length} formats</span><span class="bt-badge bt-badge--gray">${totalCards} cards</span>${S.owner ? `<span class="bt-badge bt-badge--teal"><span class="bt-badge-dot"></span>${S.pending.length} to review</span>` : ""}</div></div>
    <div class="cgp-scene" aria-hidden="true"><div class="cgp-fan"><span style="--r:-16deg"></span><span style="--r:-5deg"></span><span style="--r:7deg">Worst place to hide?</span></div>${mascot()}</div></section>`;
  const switches = S.owner ? `<div class="bt-admin-panel"><span class="bt-admin-tag">Owner only</span><div class="cgp-switches">${S.formats.map((x) => `<span class="cgp-switch" id="cgp-sw-${esc(x.id)}">${esc(x.icon)} ${esc(x.title)} <button type="button" class="bt-switch" role="switch" aria-checked="${x.enabled}" aria-labelledby="cgp-sw-${esc(x.id)}" data-fswitch="${esc(x.id)}"></button><small>${x.enabled ? "On" : "Off"}</small></span>`).join("")}</div><p class="cgp-note">A format that's on shows a tile in the launch panel. Switch one on after its first look on staging.</p></div>` : "";
  const tabs = `<nav class="bt-seg-nav" aria-label="Formats" data-cgp-tabs>${FORMATS.map(([k, n]) => `<a href="#${k}" data-tab="${k}"${S.tab === k ? ' aria-current="page"' : ""}>${n} <span class="bt-chip-n">${packsOf(k).filter((p) => p.status !== "retired").length}</span></a>`).join("")}</nav>`;
  const packsHtml = `<div class="cgp-packs">${list.length ? list.map((p) => {
    const used = p.cards.filter((c) => (c.usedOn || []).length).length;
    return `<button type="button" class="cgp-pack" data-pack="${esc(p.id)}" aria-current="${p.id === S.packId}"><b>${esc(p.title)}</b><small>${p.cards.length} ${p.cards.length === 1 ? "card" : "cards"} · ${used} used</small><span class="cgp-tags">${p.vaultGameIds.length ? p.vaultGameIds.map((g) => `<span class="bt-badge bt-badge--gray">${esc(g)}</span>`).join("") : `<span class="bt-badge bt-badge--gray">Any game</span>`}${statusBadge(p)}</span></button>`;
  }).join("") : `<div class="cgp-empty">${mascot()}<b>No packs yet</b><span>${S.warden ? "Start the first one." : "The owner and Wardens write packs."}</span></div>`}${S.warden ? `<button type="button" class="bt-btn bt-btn--secondary" data-newpack>New pack</button>` : ""}</div>`;

  let main = "";
  if (pk) {
    const rows = pk.cards.length ? `<div class="cgp-rows">${[...pk.cards].reverse().map((c) => {
      const t = lastUse(c);
      const tools = canEdit(pk) ? `<button type="button" class="bt-btn bt-btn--ghost bt-btn--sm" data-editcard="${esc(c.id)}">Edit</button>${S.owner && !(c.usedOn || []).length ? `<button type="button" class="bt-btn bt-btn--ghost bt-btn--sm" data-delcard="${esc(c.id)}">Delete</button>` : ""}` : "";
      return `<div class="cgp-row${c.id === S.newCardId ? " is-new" : ""}" data-row="${esc(c.id)}"><p>${cardLine(c, f)}</p><small>${t ? `Used ${day(t)}` : c.id === S.newCardId ? "Just approved · not used yet" : "Not used yet"}</small>${tools ? `<div class="cgp-acts">${tools}</div>` : ""}</div>`;
    }).join("")}</div><p class="cgp-note">Cards used in the last 30 days are skipped when drawing, unless none are left.</p>`
      : `<div class="cgp-empty">${mascot()}<b>No cards yet</b><span>${canEdit(pk) ? "Add the first one." : "Suggest one: the owner reviews every suggestion."}</span></div>`;
    const tools = [
      canEdit(pk) && pk.status !== "retired" ? `<button type="button" class="bt-btn bt-btn--primary bt-btn--sm" data-addcard>Add a card</button>` : "",
      S.owner && pk.status === "draft" ? `<button type="button" class="bt-btn bt-btn--admin bt-btn--sm" data-approvepack>Approve pack</button>` : "",
      S.owner && pk.status !== "retired" ? `<button type="button" class="bt-btn bt-btn--ghost bt-btn--sm" data-retire>Retire</button>` : "",
    ].join("");
    main = card(`${esc(pk.title)} ${statusBadge(pk)}`, rows, tools);
  } else main = card("Cards", `<div class="cgp-empty">${mascot()}<b>Pick a pack</b><span>Or start one.</span></div>`);

  let side = "";
  if (S.owner) {
    const lane = S.pending.length ? `<div class="cgp-sug">${S.pending.map((s) => { const p = S.packs.find((x) => x.id === s.packId); return `<div class="cgp-sug-card" data-sugcard="${esc(s.id)}"><p>${cardLine(s, (p?.formatId || "hot-seat") as Fmt)}</p><small>@${esc(s.byHandle || "someone")} · ${esc(ago(s.createdAt))} · ${esc(p?.title || "")}</small><div class="cgp-acts"><button type="button" class="bt-btn bt-btn--admin bt-btn--sm" data-approve="${esc(s.id)}">Approve</button><button type="button" class="bt-btn bt-btn--secondary bt-btn--sm" data-editapprove="${esc(s.id)}">Edit</button><button type="button" class="bt-btn bt-btn--secondary bt-btn--sm" data-reject="${esc(s.id)}">Reject</button></div></div>`; }).join("")}</div>`
      : `<div class="cgp-empty">${mascot()}<b>Nothing to review</b><span>New suggestions from the crew land here.</span></div>`;
    side += card("Suggested", lane, S.pending.length ? `<span class="bt-badge bt-badge--teal">${S.pending.length}</span>` : "");
  }
  if (!S.owner) {
    if (S.watcher && pk && pk.status === "approved") side += card("Suggest a card", `<form class="cgp-form" data-suggest novalidate>${fieldsHtml(f, { label: `For ${esc(pk.title)}` })}<div class="cgp-acts"><button type="submit" class="bt-btn bt-btn--primary">Send suggestion</button></div></form>`);
    else if (S.watcher) side += card("Suggest a card", `<div class="cgp-empty">${mascot()}<b>Pick an approved pack</b><span>Suggestions go into approved packs.</span></div>`);
    else side += card("Suggest a card", `<div class="cgp-empty">${mascot()}<b>Opens at Watcher</b><span>Keep going: suggesting cards unlocks at Watcher.</span></div>`);
    if (S.watcher) side += card("Your suggestions", S.mine.length ? `<div class="cgp-mine">${S.mine.map((m) => `<div><span>${esc(m.text)}${m.options?.length ? ` (${m.options.map(esc).join(" / ")})` : ""}</span>${m.status === "pending" ? `<span class="bt-badge bt-badge--teal"><span class="bt-badge-dot"></span>Under review</span>` : m.status === "approved" ? `<span class="bt-badge bt-badge--lime"><span class="bt-badge-dot"></span>Approved · +2 Gears</span>` : `<span class="bt-badge bt-badge--gray" title="${esc(m.reason || "")}"><span class="bt-badge-dot"></span>Not used this time</span>`}</div>`).join("")}</div>`
      : `<div class="cgp-empty">${mascot()}<b>No suggestions yet</b><span>Approved cards pay 2 Gears.</span></div>`);
  }
  root.innerHTML = `${hero}${switches}${tabs}<div class="cgp-pool">${packsHtml}<div class="cgp-main">${main}<div class="cgp-col">${side}</div></div></div>`;
  root.removeAttribute("aria-busy");
  initSegNavs(root as unknown as Document);
  const ta = root.querySelector<HTMLTextAreaElement>("[data-suggest] textarea");
  if (ta) ta.addEventListener("input", () => { const n = root.querySelector<HTMLElement>("[data-suggest] [data-count]"); if (n) n.textContent = `${ta.value.length} / ${LIM[f].text}`; });
}

/** The format's fields: the text (and its counter) plus the options (two for Would You Rather, 2 to 4 for Predictions). */
function fieldsHtml(f: Fmt, { label = "", text = "", options = [] as string[] } = {}) {
  const l = LIM[f];
  const opts = f === "hot-seat" ? "" : Array.from({ length: Math.max(l.min, Math.min(l.max, options.length || l.min)) }, (_, i) => options[i] || "")
    .concat(f === "predictions" ? Array.from({ length: Math.max(0, l.max - Math.max(l.min, options.length)) }, () => "") : [])
    .map((o, i) => `<div class="bt-field"><label class="bt-label" for="cgp-o${i}">${l.optLabel} ${i + 1}${f === "predictions" && i >= l.min ? " (optional)" : ""}</label><input class="bt-input" id="cgp-o${i}" data-opt maxlength="${l.option}" value="${esc(o)}"></div>`).join("");
  return `<div class="bt-field"><label class="bt-label" for="cgp-t">${label || l.textLabel}</label><textarea class="bt-textarea" id="cgp-t" data-text rows="2" maxlength="${l.text}" placeholder="${esc(l.placeholder)}">${esc(text)}</textarea><span class="cgp-count" data-count>${text.length} / ${l.text}</span></div>${opts}`;
}
const readFields = (box: Element) => ({ text: (box.querySelector<HTMLTextAreaElement>("[data-text]")?.value || "").trim(), options: [...box.querySelectorAll<HTMLInputElement>("[data-opt]")].map((i) => i.value.trim()).filter(Boolean) });

// ---------- actions ----------
async function run<T = any>(name: string, data: unknown, local?: () => void): Promise<T> {
  if (S.preview) { await new Promise((r) => setTimeout(r, 200)); local?.(); return {} as T; }
  return crewCall<T>(name, data);
}
async function refresh() { try { await load(); } catch (err) { console.warn("pool: reload failed", err); } render(); }

function cardDialog(title: string, f: Fmt, init: { text?: string; options?: string[] }, onSave: (v: { text: string; options: string[] }) => Promise<void>) {
  const m = openModal({ title, feature: "chat-games", content: modalHeader(esc(title), FORMATS.find(([k]) => k === f)?.[1] || "")
    + `<form class="cgp-form" novalidate data-cardform>${fieldsHtml(f, init as any)}<p class="bt-notice bt-notice--error" data-err hidden></p></form>`
    + `<div class="bt-modal-actions"><button type="button" class="bt-btn bt-btn--secondary" data-bt-close>Cancel</button><button type="button" class="bt-btn bt-btn--primary" data-save>Save</button></div>` });
  const ta = m.modal.querySelector<HTMLTextAreaElement>("[data-text]")!;
  ta.addEventListener("input", () => { m.modal.querySelector<HTMLElement>("[data-count]")!.textContent = `${ta.value.length} / ${LIM[f].text}`; });
  setTimeout(() => ta.focus(), 50);
  m.modal.querySelector<HTMLButtonElement>("[data-save]")!.addEventListener("click", async (e) => {
    const b = e.currentTarget as HTMLButtonElement, err = m.modal.querySelector<HTMLElement>("[data-err]")!;
    b.disabled = true;
    try { await onSave(readFields(m.modal.querySelector("[data-cardform]")!)); m.close(); }
    catch (ex) { err.textContent = messageFor(ex, "That didn't save. Try again."); err.hidden = false; b.disabled = false; }
  });
}

function wire() {
  root.addEventListener("click", async (e) => {
    const t = e.target as Element;
    const tab = t.closest<HTMLAnchorElement>("[data-tab]");
    if (tab) { e.preventDefault(); S.tab = tab.dataset.tab as Fmt; S.packId = ""; render(); return; }
    const pb = t.closest<HTMLElement>("[data-pack]"); if (pb) { S.packId = pb.dataset.pack!; render(); return; }
    const pk = cur();
    const sw = t.closest<HTMLButtonElement>("[data-fswitch]");
    if (sw) {
      const id = sw.dataset.fswitch!, on = sw.getAttribute("aria-checked") !== "true";
      sw.disabled = true;
      try { await run("chatGameFormatSet", { formatId: id, enabled: on }, () => { const x = S.formats.find((y) => y.id === id); if (x) x.enabled = on; }); toast(`${S.formats.find((y) => y.id === id)?.title || id} is ${on ? "on" : "off"}`); await refresh(); }
      catch (err) { toast(messageFor(err, "That didn't switch. Try again."), { kind: "error" }); sw.disabled = false; }
      return;
    }
    if (t.closest("[data-newpack]")) {
      const f = S.tab;
      const m = openModal({ title: "New pack", feature: "chat-games", content: modalHeader("New pack", FORMATS.find(([k]) => k === f)![1])
        + `<form class="cgp-form" novalidate><div class="bt-field"><label class="bt-label" for="cgp-pt">Pack name</label><input class="bt-input" id="cgp-pt" maxlength="60" placeholder="e.g. Outlast night"></div>`
        + `<div class="bt-field"><label class="bt-label" for="cgp-pv">Game Vault games (optional)</label><input class="bt-input" id="cgp-pv" placeholder="Game ids, comma separated, e.g. outlast"><span class="bt-hint">A tagged pack is suggested when that game is on stream.</span></div>`
        + `${S.owner ? "" : `<p class="bt-notice">Your pack starts as a draft. The owner approves it before it can be played.</p>`}<p class="bt-notice bt-notice--error" data-err hidden></p></form>`
        + `<div class="bt-modal-actions"><button type="button" class="bt-btn bt-btn--secondary" data-bt-close>Cancel</button><button type="button" class="bt-btn bt-btn--primary" data-create>Create pack</button></div>` });
      m.modal.querySelector("[data-create]")!.addEventListener("click", async (ev) => {
        const b = ev.currentTarget as HTMLButtonElement, title = (m.modal.querySelector<HTMLInputElement>("#cgp-pt")!.value || "").trim();
        const vault = (m.modal.querySelector<HTMLInputElement>("#cgp-pv")!.value || "").split(",").map((x) => x.trim()).filter(Boolean);
        b.disabled = true;
        try {
          const r = await run<{ packId: string }>("chatGamePackSave", { op: "create", formatId: f, title, vaultGameIds: vault }, () => { const id = `new${Date.now()}`; S.packs.push({ id, formatId: f, title: title || "New pack", vaultGameIds: vault, status: S.owner ? "approved" : "draft", cards: [] }); S.packId = id; });
          if (r && r.packId) S.packId = r.packId;
          m.close(); toast(S.owner ? "Pack created" : "Draft pack created"); await refresh();
        } catch (ex) { const er = m.modal.querySelector<HTMLElement>("[data-err]")!; er.textContent = messageFor(ex, "That didn't save."); er.hidden = false; b.disabled = false; }
      });
      return;
    }
    if (t.closest("[data-addcard]") && pk) {
      cardDialog("Add a card", pk.formatId, {}, async (v) => { await run("chatGamePackSave", { op: "addCard", packId: pk.id, card: v }, () => { pk.cards.push({ id: `c${Date.now()}`, text: v.text || "Would you rather…", options: v.options }); }); toast("Card added"); await refresh(); });
      return;
    }
    const ec = t.closest<HTMLElement>("[data-editcard]");
    if (ec && pk) {
      const c = pk.cards.find((x) => x.id === ec.dataset.editcard)!;
      cardDialog("Edit card", pk.formatId, { text: c.text, options: c.options }, async (v) => { await run("chatGamePackSave", { op: "editCard", packId: pk.id, cardId: c.id, card: v }, () => { c.text = v.text; c.options = v.options; }); toast("Card saved"); await refresh(); });
      return;
    }
    const dc = t.closest<HTMLElement>("[data-delcard]");
    if (dc && pk) {
      const id = dc.dataset.delcard!;
      const ok = await confirmAction({ title: "Delete this card?", message: "It was never used on stream, so it can go. This can't be undone.", confirmLabel: "Delete card", feature: "chat-games",
        onConfirm: async () => { await run("chatGamePackSave", { op: "deleteCard", packId: pk.id, cardId: id }, () => { pk.cards = pk.cards.filter((c) => c.id !== id); }); } });
      if (ok) { toast("Card deleted"); await refresh(); }
      return;
    }
    if (t.closest("[data-approvepack]") && pk) { try { await run("chatGamePackSave", { op: "approve", packId: pk.id }, () => { pk.status = "approved"; }); toast("Pack approved. It can be played now."); await refresh(); } catch (err) { toast(messageFor(err), { kind: "error" }); } return; }
    if (t.closest("[data-retire]") && pk) {
      const ok = await confirmAction({ title: `Retire ${pk.title}?`, message: "It won't be drawn or offered any more. Its cards and history stay; packs are never deleted.", confirmLabel: "Retire pack", danger: false, feature: "chat-games",
        onConfirm: async () => { await run("chatGamePackSave", { op: "retire", packId: pk.id }, () => { pk.status = "retired"; }); } });
      if (ok) { toast("Pack retired"); await refresh(); }
      return;
    }
    const ap = t.closest<HTMLElement>("[data-approve]"), ea = t.closest<HTMLElement>("[data-editapprove]");
    if (ap || ea) {
      const s = S.pending.find((x) => x.id === (ap || ea)!.dataset[ap ? "approve" : "editapprove"])!;
      const p = S.packs.find((x) => x.id === s.packId)!;
      const approve = async (edited?: { text: string; options: string[] }) => {
        const r = await run<{ cardId: string; gears: number }>("chatGameCardDecide", { packId: s.packId, suggestionId: s.id, action: "approve", ...(edited ? { card: edited } : {}) },
          () => { const id = `c${Date.now()}`; p.cards.push({ id, text: edited?.text || s.text, options: edited?.options || s.options }); S.pending = S.pending.filter((x) => x.id !== s.id); S.newCardId = id; });
        if (r && r.cardId) S.newCardId = r.cardId;
        S.tab = p.formatId; S.packId = p.id;
        await refresh();
        const row = root.querySelector<HTMLElement>(`[data-row="${S.newCardId}"]`);
        if (row && !reduced()) burst(row, { n: 20 });
        toast(`Approved into ${p.title}. @${s.byHandle || "the suggester"} gets 2 Gears.`);
      };
      if (ea) { cardDialog("Edit, then approve", p.formatId, { text: s.text, options: s.options }, async (v) => { await approve(v); }); return; }
      ap!.setAttribute("disabled", "");
      try { await approve(); } catch (err) { toast(messageFor(err, "That didn't approve."), { kind: "error" }); ap!.removeAttribute("disabled"); }
      return;
    }
    const rj = t.closest<HTMLElement>("[data-reject]");
    if (rj) {
      const s = S.pending.find((x) => x.id === rj.dataset.reject)!;
      const m = openModal({ title: "Not this time", feature: "chat-games", content: modalHeader("Not this time", `@${esc(s.byHandle || "someone")} sees "Not used this time"`)
        + `<form class="cgp-form" novalidate><div class="bt-field"><label class="bt-label" for="cgp-rr">Reason (optional)</label><input class="bt-input" id="cgp-rr" maxlength="200" placeholder="e.g. Too close to one we have"></div></form>`
        + `<div class="bt-modal-actions"><button type="button" class="bt-btn bt-btn--secondary" data-bt-close>Cancel</button><button type="button" class="bt-btn bt-btn--primary" data-rj>Reject</button></div>` });
      m.modal.querySelector("[data-rj]")!.addEventListener("click", async (ev) => {
        const b = ev.currentTarget as HTMLButtonElement; b.disabled = true;
        try { await run("chatGameCardDecide", { packId: s.packId, suggestionId: s.id, action: "reject", reason: m.modal.querySelector<HTMLInputElement>("#cgp-rr")!.value }, () => { S.pending = S.pending.filter((x) => x.id !== s.id); }); m.close(); toast("Not used this time"); await refresh(); }
        catch (ex) { toast(messageFor(ex), { kind: "error" }); b.disabled = false; }
      });
    }
  });
  root.addEventListener("submit", async (e) => {
    const form = (e.target as Element).closest<HTMLFormElement>("[data-suggest]");
    const pk = cur();
    if (!form || !pk) return;
    e.preventDefault();
    const v = readFields(form), b = form.querySelector<HTMLButtonElement>("[type=submit]")!;
    b.disabled = true;
    try {
      await run("chatGameCardSuggest", { packId: pk.id, card: v }, () => { S.mine.unshift({ id: `m${Date.now()}`, packId: pk.id, text: v.text || "Would you rather…", options: v.options, by: ctx.uid, byHandle: ctx.handle, createdAt: Date.now(), status: "pending" }); });
      toast("Sent. Boomertanger reviews suggestions in the Suggested lane.");
      await refresh();
    } catch (err) { toast(messageFor(err, "That didn't send. Try again."), { kind: "error" }); b.disabled = false; }
  });
}

onAccess(async (s) => {
  ctx = await loadCtx(s);
  S.preview = ctx.preview;
  const grade = ctx.me.crew?.track === "mod" ? ctx.me.crew.grade || 0 : 0;
  S.owner = ctx.owner && !(S.preview && q().get("owner") === "0");
  const g = S.preview && q().get("grade") ? Number(q().get("grade")) : grade;
  S.warden = S.owner || (ctx.admin && !S.preview) || g >= 3;
  S.watcher = S.owner || ctx.watcherPlus || g >= 2;
  if (location.hash && FORMATS.some(([k]) => `#${k}` === location.hash)) S.tab = location.hash.slice(1) as Fmt;
  wire();
  await refresh();
});
