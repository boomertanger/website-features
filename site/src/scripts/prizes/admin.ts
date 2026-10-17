// /admin/prize-box (docs/specs/prize-box.md §5 "/admin/prize-box"; mockup prize-box-pages.html, the admin page): a tool page (design-system §8m) for admins.
// The hero header with the box scene; four counters that jump to their tab (open contests, entries to review, envelopes not here yet, prizes to ship);
// the tabs Contests / Entries / Mail log / Draws / Claims (owner only) / Settings (owner only), in ?tab=.
//   Contests   every contest with its actions: View page, Edit, Publish, Open, Close, Pick winners / Draw winners (owner), Cancel, Delete (owner),
//              and New contest: the builder (openModal), 1 Template (Break Wheel, Online art, Mail-in art, Blank), 2 Details, 3 Rules and announcements.
//   Entries    a contest's entries: See the file (a 10-minute link), Accept, Reject with a reason.
//   Mail log   a code and the postmark date → Mark received (late postmarks are refused under the rules); unmatched envelopes, with the mascot when none.
//   Draws      the record of each live draw: the pool, Round 1, Round 2, respins with their reasons, the result.
//   Claims     owner only: the address hidden until Show address (logged on the server), codes, Mark shipped (the stamp and a toast), forfeit and redraw.
//   Settings   owner only: the live cooldown, the claim window, the I'm here seconds, the mailing address for mail-in contests (private/settings).
// Reads: Firestore Lite, as the rules allow admins (contests with drafts, entries, draws, the mail log, winners) and the owner (private/settings).
// Writes: the prize* callables only; the server checks every role again. Display gating only.
import { whenReady, type AuthState } from "../../lib/auth";
import { messageFor } from "../../lib/errors";
import { db, doc, getDoc, collection, getDocs, query, where, orderBy, limit, SITE_ID } from "../../lib/db";
import { openModal, modalHeader } from "../../../../shared/ui/modal.js";
import { confirmAction } from "../../../../shared/ui/confirm.js";
import { toast } from "../../../../shared/ui/toast.js";
import { stampHtml } from "../../../../shared/ui/stamp.js";
import { escapeHtml as esc } from "../../../../shared/ui/dom.js";
import { call, toContest, STATUS, TYPE_WORD, METHOD_WORD, ENTRY_WORD, BEAT_WORD, placeWord, dateWord, dateTimeWord, contestHref, type Contest } from "./data";
import { boxScene } from "./icons";
import TEMPLATE from "../../data/prize-box/rules-template.md?raw";

type Tab = "contests" | "entries" | "mail" | "draws" | "claims" | "settings";
const TABS: [Tab, string, boolean][] = [["contests", "Contests", false], ["entries", "Entries", false], ["mail", "Mail log", false], ["draws", "Draws", false], ["claims", "Claims 🔒", true], ["settings", "Settings 🔒", true]];
const ms = (v: any): number | null => (v == null ? null : typeof v === "number" ? v : typeof v.toMillis === "function" ? v.toMillis() : null);
const BASE = () => ["sites", SITE_ID, "prizeBox", "main"] as const;
const mascot = () => document.getElementById("bt-mascot-tpl")?.innerHTML ?? "";
const empty = (title: string, text: string) => `<div class="pz-empty">${mascot()}<div><b>${esc(title)}</b><p>${esc(text)}</p></div></div>`;
const KIND_WORD: Record<string, string> = { digital: "Digital code", storeCode: "Store code", mailed: "Mailed by Boomer (US)", badgeXp: "Badge or XP only" };
const toLocal = (t: number | null) => { if (!t) return ""; const d = new Date(t); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };
const fromLocal = (v: string) => (v ? new Date(v).getTime() : null);

interface Entry { uid: string; handle: string | null; kind: string; status: string; title: string | null; text: string | null; assetId: string | null; code: string | null; receivedAt: number | null; postmarkedOn: string | null; rejectReason: string | null; createdAt: number | null }
interface Winner { id: string; contestId: string; contestTitle: string; uid: string; handle: string | null; place: number; prizeTitle: string; kind: string; status: string; claimBy: number | null; claimedAt: number | null; shippedAt: number | null; at: number | null }
interface MailRow { id: string; kind: string; contestId: string | null; code: string | null; note?: string; postmarkedOn: string | null; resolved?: boolean; at: number | null }

const root = document.querySelector<HTMLElement>("[data-pz-admin]");
const params = new URLSearchParams(location.search);
let tab: Tab = (TABS.some(([t]) => t === params.get("tab")) ? params.get("tab") : "contests") as Tab;
let auth: AuthState | null = null;
let contests: Contest[] = [], raw: Record<string, any> = {}, winners: Winner[] = [], mail: MailRow[] = [];
let entryContest = params.get("contest") || "";
let entries: Entry[] = [];
const isOwner = () => !!auth && !!auth.isOwner;

async function loadAll() {
  const [cs, ws, ml] = await Promise.all([
    getDocs(collection(db, ...BASE(), "contests")),
    getDocs(query(collection(db, ...BASE(), "winners"), orderBy("at", "desc"), limit(200))),
    getDocs(query(collection(db, ...BASE(), "mailLog"), orderBy("at", "desc"), limit(200))),
  ]);
  raw = {}; contests = cs.docs.map((d) => { raw[d.id] = d.data(); return toContest(d.id, d.data()); });
  contests.sort((a, b) => (order(a) - order(b)) || ((b.closesAt || 0) - (a.closesAt || 0)));
  winners = ws.docs.map((d) => ({ id: d.id, ...(d.data() as any), claimBy: ms(d.get("claimBy")), claimedAt: ms(d.get("claimedAt")), shippedAt: ms(d.get("shippedAt")), at: ms(d.get("at")) }));
  mail = ml.docs.map((d) => ({ id: d.id, ...(d.data() as any), at: ms(d.get("at")) }));
}
const order = (c: Contest) => ({ drawing: 0, open: 1, judging: 2, closed: 3, scheduled: 4, draft: 5, won: 6, done: 7, cancelled: 8 } as Record<string, number>)[c.status] ?? 9;
async function loadEntries(cid: string) {
  entries = cid ? (await getDocs(collection(db, ...BASE(), "contests", cid, "entries"))).docs.map((d) => { const x = d.data() as any; return { uid: d.id, ...x, receivedAt: ms(x.receivedAt), createdAt: ms(x.createdAt) }; }) : [];
  entries.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}
async function counters() {
  const open = contests.filter((c) => c.status === "open" || c.status === "drawing").length;
  let toReview = 0, notHere = 0;
  for (const c of contests.filter((x) => ["open", "closed", "judging"].includes(x.status) && x.type !== "live")) {
    const es = await getDocs(collection(db, ...BASE(), "contests", c.id, "entries"));
    es.docs.forEach((d) => { const s = d.get("status"); if (c.type === "online" && s === "submitted") toReview++; if (c.type === "mail" && s === "submitted" && !d.get("receivedAt")) notHere++; });
  }
  const toShip = winners.filter((w) => w.kind === "mailed" && w.status === "claimed").length;
  return { open, toReview, notHere, toShip };
}

// ------------------------------------------------------------------------------------------------ the page
async function draw() {
  if (!root) return;
  const n = await counters().catch(() => ({ open: 0, toReview: 0, notHere: 0, toShip: 0 }));
  const stat = (v: number, label: string, t: Tab) => `<button type="button" class="pz-ad-stat${tab === t ? " is-on" : ""}" data-pz-gotab="${t}"><b>${v}</b><span>${esc(label)}</span></button>`;
  const tabs = TABS.filter(([, , owner]) => !owner || isOwner()).map(([t, label]) => `<button type="button" data-value="${t}" class="${tab === t ? "is-on" : ""}" aria-pressed="${tab === t}">${esc(label)}</button>`).join("");
  root.innerHTML = `<section class="pz-ad-hero"><div><span class="bt-badge bt-badge--admin">Admin</span><h1 class="bt-title">Prize Box</h1><p>Run every contest from here: build it, review entries, log mail, look back at draws and get prizes to winners.</p></div>${boxScene()}</section>`
    + `<div class="pz-ad-stats">${stat(n.open, n.open === 1 ? "Open contest" : "Open contests", "contests")}${stat(n.toReview, n.toReview === 1 ? "Entry to review" : "Entries to review", "entries")}${stat(n.notHere, n.notHere === 1 ? "Envelope not here yet" : "Envelopes not here yet", "mail")}${stat(n.toShip, n.toShip === 1 ? "Prize to ship" : "Prizes to ship", isOwner() ? "claims" : "contests")}</div>`
    + `<div class="pz-ad-tabs"><div class="bt-pills" role="group" aria-label="Prize Box admin" data-pz-tabs style="--n:${TABS.filter(([, , o]) => !o || isOwner()).length}">${tabs}</div><span class="pz-sp"></span>${tab === "contests" ? '<button type="button" class="bt-btn bt-btn--admin" data-pz-new data-pulse="pb-new-contest">New contest</button>' : ""}</div>`
    + `<div class="pz-ad-body" data-pz-body aria-live="polite">${await body()}</div>`;
}
async function body(): Promise<string> {
  if (tab === "contests") return contests.length ? contests.map(contestRow).join("") : empty("No contests yet", "Start one with New contest. It stays a draft until you publish it.");
  if (tab === "entries") return entriesTab();
  if (tab === "mail") return mailTab();
  if (tab === "draws") return drawsTab();
  if (tab === "claims") return isOwner() ? claimsTab() : "";
  if (tab === "settings") return isOwner() ? settingsTab() : "";
  return "";
}

function contestRow(c: Contest): string {
  const [tone, word] = STATUS[c.status] || ["gray", c.status];
  const r = raw[c.id] || {}, counts = r.counts || {};
  const live = c.type === "live", owner = isOwner(), canManage = live ? owner : true;
  const when = live ? `Live draw at ${BEAT_WORD[c.beat || ""] || "a break"}${r.draw && r.draw.streamId ? " on a set stream" : ""}${(r.round1 || []).length ? ", with Round 1" : ""}.` : `Opens ${dateWord(c.opensAt)}, closes ${dateTimeWord(c.closesAt)}.`;
  const tally = live ? "" : ` ${counts.entries || 0} entries${c.type === "mail" ? `, ${counts.received || 0} received` : `, ${counts.accepted || 0} accepted`}.`;
  const acts: string[] = [];
  if (c.status !== "draft") acts.push(`<a class="bt-btn bt-btn--secondary bt-btn--sm" href="${contestHref(c)}">View page</a>`);
  if (canManage && !["won", "done", "cancelled"].includes(c.status)) acts.push(`<button type="button" class="bt-btn bt-btn--admin bt-btn--sm" data-pz-edit="${esc(c.id)}">Edit</button>`);
  if (canManage && c.status === "draft") acts.push(`<button type="button" class="bt-btn bt-btn--admin bt-btn--sm" data-pz-move="publish" data-id="${esc(c.id)}" data-pulse="pb-publish">Publish</button>`);
  if (canManage && c.status === "scheduled") acts.push(`<button type="button" class="bt-btn bt-btn--ghost bt-btn--sm" data-pz-move="unpublish" data-id="${esc(c.id)}">Back to draft</button>`);
  if (canManage && !live && c.status === "scheduled") acts.push(`<button type="button" class="bt-btn bt-btn--admin bt-btn--sm" data-pz-move="open" data-id="${esc(c.id)}">Open now</button>`);
  if (canManage && !live && c.status === "open") acts.push(`<button type="button" class="bt-btn bt-btn--secondary bt-btn--sm" data-pz-move="close" data-id="${esc(c.id)}">Close entries</button>`);
  if (owner && !live && c.method === "judge" && ["judging", "closed"].includes(c.status)) acts.push(`<button type="button" class="bt-btn bt-btn--admin bt-btn--sm" data-pz-judge="${esc(c.id)}" data-pulse="pb-judge">Pick winners</button>`);
  if (owner && !live && c.method === "random" && c.status === "closed") acts.push(`<button type="button" class="bt-btn bt-btn--admin bt-btn--sm" data-pz-random="${esc(c.id)}" data-pulse="pb-draw">Draw winners</button>`);
  if (canManage && c.status === "won") acts.push(`<button type="button" class="bt-btn bt-btn--ghost bt-btn--sm" data-pz-move="done" data-id="${esc(c.id)}">Mark done</button>`);
  if (!live && c.status !== "draft") acts.push(`<button type="button" class="bt-btn bt-btn--ghost bt-btn--sm" data-pz-entries="${esc(c.id)}">Entries</button>`);
  if (canManage && ["draft", "scheduled", "open", "closed", "judging"].includes(c.status)) acts.push(`<button type="button" class="bt-btn bt-btn--ghost bt-btn--sm" data-pz-move="cancel" data-id="${esc(c.id)}">Cancel</button>`);
  if (owner) acts.push(`<button type="button" class="bt-btn bt-btn--danger bt-btn--sm" data-pz-delete="${esc(c.id)}">Delete</button>`);
  return `<div class="bt-card pz-ad-row"><div><b>${esc(c.title)}</b><small>${esc(TYPE_WORD[c.type])}, ${esc(METHOD_WORD[c.method].toLowerCase())}. ${esc(when)}${esc(tally)}${live && !owner ? " Live draws are Boomer's to run." : ""}</small>`
    + `<div class="pz-ad-meta"><span class="bt-badge bt-badge--${tone}"><span class="bt-badge-dot"></span>${esc(word)}</span>${c.prizes.map((p) => `<span class="bt-badge">${esc(placeWord(p.place))}: ${esc(KIND_WORD[p.kind] || p.kind)}</span>`).join("")}</div></div><div class="pz-ad-act">${acts.join("")}</div></div>`;
}

async function entriesTab(): Promise<string> {
  const pick = contests.filter((c) => c.type !== "live" && c.status !== "draft");
  if (!pick.length) return empty("No entries yet", "Online and mail-in contests list their entries here once they're published.");
  if (!entryContest || !pick.some((c) => c.id === entryContest)) entryContest = pick[0].id;
  await loadEntries(entryContest);
  const c = pick.find((x) => x.id === entryContest)!;
  const sel = `<div class="bt-field pz-ad-pick"><label class="bt-label" for="pz-ad-c">Contest</label><select class="bt-select" id="pz-ad-c" data-pz-entry-contest>${pick.map((x) => `<option value="${esc(x.id)}"${x.id === entryContest ? " selected" : ""}>${esc(x.title)}</option>`).join("")}</select></div>`;
  const note = `<p class="pz-note">Accepted entries go into judging. Rejecting tells the member why and lets them send a new one before the deadline. Entries stay private until the winners are revealed.</p>`;
  const live = entries.filter((e) => e.status !== "withdrawn");
  if (!live.length) return sel + note + empty("No entries yet", "They show up here as members send them.");
  return sel + note + `<div class="pz-ad-grid">${live.map((e) => {
    const st = ENTRY_WORD[e.status] || e.status, done = e.status === "accepted" || e.status === "received" || e.status === "rejected";
    const what = e.kind === "mail" ? `Code ${esc(e.code || "")} · ${e.receivedAt ? `received ${esc(dateWord(e.receivedAt))}${e.postmarkedOn ? `, postmarked ${esc(e.postmarkedOn)}` : ""}` : "envelope not here yet"}` : e.kind === "text" ? esc((e.text || "").slice(0, 200)) : "An uploaded picture";
    return `<div class="bt-card pz-ad-ent${e.status === "rejected" ? " is-no" : done ? " is-ok" : ""}"><div><b>${esc(e.title || (e.kind === "mail" ? "Mail-in entry" : "Untitled"))}</b><small>@${esc(e.handle || "member")} · sent ${esc(dateWord(e.createdAt))}</small><p class="pz-note">${what}</p>`
      + `<span class="bt-badge bt-badge--${e.status === "rejected" ? "gray" : done ? "lime" : "gold"}">${esc(st)}${e.status === "rejected" && e.rejectReason ? `: ${esc(e.rejectReason)}` : ""}</span></div>`
      + `<div class="pz-ad-act">${e.assetId ? `<button type="button" class="bt-btn bt-btn--ghost bt-btn--sm" data-pz-file="${esc(e.uid)}">See the file</button>` : ""}${["won", "done", "cancelled"].includes(c.status) ? "" : `${e.status !== "accepted" && e.status !== "received" ? `<button type="button" class="bt-btn bt-btn--admin bt-btn--sm" data-pz-review="accept" data-uid="${esc(e.uid)}"${e.kind === "mail" && !e.receivedAt ? " disabled" : ""}>Accept</button>` : ""}${e.status !== "rejected" ? `<button type="button" class="bt-btn bt-btn--secondary bt-btn--sm" data-pz-review="reject" data-uid="${esc(e.uid)}">Reject</button>` : ""}`}</div></div>`;
  }).join("")}</div>`;
}

function mailTab(): string {
  const form = `<form class="bt-card pz-ad-mail" data-pz-mail><div class="bt-field"><label class="bt-label" for="pz-ad-code">Entry code on the envelope</label><input class="bt-input" id="pz-ad-code" name="code" placeholder="PB-7K4M" autocomplete="off" required></div><div class="bt-field"><label class="bt-label" for="pz-ad-post">Postmark date</label><input class="bt-input" id="pz-ad-post" name="postmarkedOn" type="date" required></div><div class="pz-ad-act"><button type="button" class="bt-btn bt-btn--secondary" data-pz-lookup>Look up</button><button type="submit" class="bt-btn bt-btn--admin" data-pulse="pb-mail-received">Mark received</button></div><p class="pz-note" data-pz-mail-out aria-live="polite"></p></form>`;
  const recent = mail.filter((m) => m.kind !== "unmatched").slice(0, 30);
  const title = (id: string | null) => (contests.find((c) => c.id === id) || { title: "a contest" }).title;
  const list = recent.length ? `<div class="pz-rows">${recent.map((m) => `<div class="bt-card pz-ad-row"><div><b>${esc(m.code || "")}</b><small>${esc(title(m.contestId))} · logged ${esc(dateWord(m.at))}${m.postmarkedOn ? `, postmarked ${esc(m.postmarkedOn)}` : ""}</small></div><div class="pz-ad-act"><span class="bt-badge bt-badge--${m.kind === "late" ? "red" : "lime"}">${m.kind === "late" ? "Late: not accepted" : "Received"}</span></div></div>`).join("")}</div>` : "";
  const un = mail.filter((m) => m.kind === "unmatched" && !m.resolved);
  const unmatched = `<span class="bt-label">Unmatched envelopes</span>` + (un.length ? `<div class="pz-rows">${un.map((m) => `<div class="bt-card pz-ad-row"><div><b>${esc(m.note || "")}</b><small>${m.contestId ? esc(title(m.contestId)) + " · " : ""}logged ${esc(dateWord(m.at))}${m.postmarkedOn ? `, postmarked ${esc(m.postmarkedOn)}` : ""}</small></div><div class="pz-ad-act"><button type="button" class="bt-btn bt-btn--secondary bt-btn--sm" data-pz-resolve="${esc(m.id)}">Sorted out</button></div></div>`).join("")}</div>`
    : `<div class="pz-empty">${mascot()}<div><b>No unmatched envelopes</b><p>Envelopes with no code or a code that doesn't exist land here so you can sort them out.</p></div></div>`);
  const log = `<details class="pz-ad-details"><summary>Log an unmatched envelope</summary><form class="pz-ad-mail" data-pz-unmatched><div class="bt-field"><label class="bt-label" for="pz-ad-note">What's in it (no names or addresses)</label><input class="bt-input" id="pz-ad-note" name="note" maxlength="300" required></div><div class="bt-field"><label class="bt-label" for="pz-ad-upost">Postmark date</label><input class="bt-input" id="pz-ad-upost" name="postmarkedOn" type="date"></div><div class="pz-ad-act"><button type="submit" class="bt-btn bt-btn--admin">Log it</button></div></form></details>`;
  return form + list + unmatched + log;
}

async function drawsTab(): Promise<string> {
  const live = contests.filter((c) => c.type === "live");
  const rows: string[] = [];
  for (const c of live) {
    const ds = await getDocs(query(collection(db, ...BASE(), "contests", c.id, "draws"), orderBy("startedAt", "desc"), limit(20))).catch(() => null);
    for (const d of ds ? ds.docs : []) {
      const x = d.data() as any, p = x.counts || {};
      const r1 = x.round1 && x.round1.chosen != null ? `Round 1: ${x.round1.slices[x.round1.chosen].group} (${x.round1.slices[x.round1.chosen].count}).` : "No Round 1.";
      const resp = (x.respins || []).map((r: any) => `@${r.handle} ${r.reason === "timeout" ? "missed I'm here" : "was respun without"}`).join("; ");
      const result = x.result ? `Won by @${x.result.handle}.` : x.status === "void" ? `Void: ${x.voidReason || ""}.` : x.status === "stopped" ? "Stopped without a winner." : "Still running.";
      rows.push(`<div class="bt-card pz-ad-row"><div><b>${esc(c.title)}</b><small>${esc(dateTimeWord(x.startedAt || null))}${x.beat ? `, ${esc(BEAT_WORD[x.beat] || x.beat)}` : ""}</small><small>${p.checkedIn || 0} checked in, ${p.inDraw || 0} in the draw (crew ${p.crew || 0}, cooldown ${p.cooldown || 0}${p.filtered ? `, rules ${p.filtered}` : ""}). ${esc(r1)} ${esc(result)}${resp ? ` Respins: ${esc(resp)}.` : ""}${x.rerunOf ? " A rerun of a voided draw." : ""}</small></div><div class="pz-ad-act"><button type="button" class="bt-btn bt-btn--secondary bt-btn--sm" data-pz-record="${esc(c.id)}/${esc(d.id)}">See the draw record</button></div></div>`);
    }
  }
  return rows.length ? `<div class="pz-rows">${rows.join("")}</div>` : empty("No draws yet", "Every live draw is kept here: the pool, both rounds, the respins and the result.");
}

function claimsTab(): string {
  const note = `<div class="bt-notice pz-ad-owner">Owner only. Addresses and codes are never shown to admins, and every time you show an address it is logged.</div>`;
  if (!winners.length) return note + empty("No winners yet", "Winners and their claims show up here.");
  return note + `<div class="pz-rows">${winners.map((w) => {
    const days = Math.max(0, Math.ceil(((w.claimBy || 0) - Date.now()) / 86400000));
    const st = w.status === "pending" ? `<span class="bt-badge bt-badge--gold">Waiting to claim: ${days} day${days === 1 ? "" : "s"} left</span>` : w.status === "claimed" ? `<span class="bt-badge bt-badge--lime">Claimed ${esc(dateWord(w.claimedAt))}</span>` : w.status === "shipped" ? stampHtml({ label: "Shipped", tone: "lime", size: "sm" }) : `<span class="bt-badge bt-badge--gray">Forfeited</span>`;
    const acts: string[] = [];
    if (w.kind === "mailed" && w.status === "claimed") acts.push(`<button type="button" class="bt-btn bt-btn--secondary bt-btn--sm" data-pz-addr="${esc(w.id)}">Show address</button><button type="button" class="bt-btn bt-btn--admin bt-btn--sm" data-pz-ship="${esc(w.id)}" data-pulse="pb-ship">Mark shipped</button>`);
    if ((w.kind === "digital" || w.kind === "storeCode") && w.status !== "forfeited") acts.push(`<button type="button" class="bt-btn bt-btn--admin bt-btn--sm" data-pz-code="${esc(w.id)}">Set the code</button>`);
    if (w.status === "pending" || w.status === "forfeited") acts.push(`<button type="button" class="bt-btn bt-btn--ghost bt-btn--sm" data-pz-redraw="${esc(w.id)}">${w.status === "forfeited" ? "Redraw" : "Forfeit and redraw"}</button>`);
    return `<div class="bt-card pz-ad-row" data-pz-claim-row="${esc(w.id)}"><div><b>@${esc(w.handle || "winner")}</b><small>${esc(w.contestTitle)}${w.place > 1 ? `, ${placeWord(w.place)} place` : ""}: ${esc(w.prizeTitle)} (${esc(KIND_WORD[w.kind] || w.kind)})</small><div class="pz-ad-meta">${st}${w.kind === "mailed" ? '<span class="pz-ad-lock" data-pz-addr-out>🔒 Address hidden</span>' : w.kind !== "badgeXp" ? '<span class="pz-ad-lock">🔒 Code shown to the winner only</span>' : ""}</div></div><div class="pz-ad-act">${acts.join("")}</div></div>`;
  }).join("")}</div>`;
}

async function settingsTab(): Promise<string> {
  const [m, p] = await Promise.all([getDoc(doc(db, ...BASE())), getDoc(doc(db, ...BASE(), "private", "settings")).catch(() => null)]);
  const s = { cooldownDays: 30, claimDays: 7, hereSeconds: 60, ...((m.exists() && (m.data() as any).settings) || {}) };
  const addr = p && p.exists() ? (p.data() as any).mailingAddress || "" : "";
  return `<form class="bt-card pz-ad-settings" data-pz-settings><div class="pz-ad-form">`
    + `<div class="bt-field"><label class="bt-label" for="pz-s-cd">Live draw cooldown (days)</label><input class="bt-input" id="pz-s-cd" name="cooldownDays" type="number" min="0" max="365" value="${s.cooldownDays}"><small class="bt-hint">A live-draw winner sits out live draws this long.</small></div>`
    + `<div class="bt-field"><label class="bt-label" for="pz-s-cl">Claim window (days)</label><input class="bt-input" id="pz-s-cl" name="claimDays" type="number" min="1" max="60" value="${s.claimDays}"></div>`
    + `<div class="bt-field"><label class="bt-label" for="pz-s-h">I'm here window (seconds)</label><input class="bt-input" id="pz-s-h" name="hereSeconds" type="number" min="15" max="300" value="${s.hereSeconds}"></div>`
    + `<div class="bt-field pz-ad-full"><label class="bt-label" for="pz-s-a">Mailing address for mail-in contests</label><textarea class="bt-input" id="pz-s-a" name="mailingAddress" rows="4" maxlength="400" placeholder="Name, PO box or street, city, state, ZIP">${esc(addr)}</textarea><small class="bt-hint">Kept private (only you can read it here). Members see it on a mail-in contest page once they have an entry code. Never in the repo.</small></div>`
    + `</div><div class="pz-ad-act"><button type="submit" class="bt-btn bt-btn--admin">Save settings</button></div></form>`;
}

// ------------------------------------------------------------------------------------------------ the builder (openModal)
type Draft = { id?: string; template: string; type: "live" | "online" | "mail"; title: string; blurb: string; method: string; opensAt: number | null; closesAt: number | null; beat: string; entryKind: string;
  prizes: { place: number; title: string; kind: string; xp: number }[]; eligibility: { kind: string; badgeId?: string; n?: number }[]; round1: { group: string; filter: { kind: string; badgeId?: string; n?: number } }[]; rulesMd: string; announce: { banner: boolean; alerts: boolean; feed: boolean; plannerTag: string } };
const DAY = 86400000;
function fromTemplate(t: string): Draft {
  const base = { template: t, blurb: "", opensAt: Date.now(), closesAt: Date.now() + 14 * DAY, beat: "break1", entryKind: "upload", eligibility: [], round1: [], rulesMd: TEMPLATE, announce: { banner: true, alerts: true, feed: true, plannerTag: "" } };
  if (t === "wheel") return { ...base, type: "live", title: "Break Wheel", method: "wheel", opensAt: null, closesAt: null, prizes: [{ place: 1, title: "", kind: "digital", xp: 0 }],
    round1: [{ group: "Everyone", filter: { kind: "everyone" } }, { group: "Every beat tonight", filter: { kind: "everyBeat" } }], announce: { ...base.announce, plannerTag: "Wheel night" } };
  if (t === "online") return { ...base, type: "online", title: "", method: "judge", prizes: [{ place: 1, title: "", kind: "mailed", xp: 0 }, { place: 2, title: "", kind: "digital", xp: 0 }, { place: 3, title: "The Prize Box Winner badge", kind: "badgeXp", xp: 150 }] };
  if (t === "mail") return { ...base, type: "mail", title: "", method: "judge", entryKind: "", prizes: [{ place: 1, title: "", kind: "storeCode", xp: 0 }] };
  return { ...base, type: "online", title: "", method: "random", prizes: [{ place: 1, title: "", kind: "digital", xp: 0 }] };
}
function fromContest(c: Contest): Draft {
  const r = raw[c.id] || {};
  return { id: c.id, template: "edit", type: c.type, title: c.title, blurb: c.blurb, method: c.method, opensAt: c.opensAt, closesAt: c.closesAt, beat: c.beat || "break1", entryKind: c.entryKind || "upload",
    prizes: c.prizes.map((p) => ({ place: p.place, title: p.title, kind: p.kind, xp: p.xp || 0 })), eligibility: r.eligibility || [], round1: r.round1 || [], rulesMd: c.rulesMd || TEMPLATE,
    announce: { banner: r.announce?.banner !== false, alerts: r.announce?.alerts !== false, feed: r.announce?.feed !== false, plannerTag: r.announce?.plannerTag || "" } };
}
const FILTER_OPTS = (live: boolean) => [["everyone", live ? "Everyone checked in this stream" : "All members"], ["badge", "Holds a badge…"], ["nightShiftTop", "Night Shift top N…"], ["memberDays", "Member for N days…"], ...(live ? [["everyBeat", "Checked in at every beat"]] : [])];
function filterRow(f: { kind: string; badgeId?: string; n?: number }, live: boolean, name: string) {
  return `<select class="bt-select" data-pz-f="${name}" aria-label="Who can enter">${FILTER_OPTS(live).map(([v, l]) => `<option value="${v}"${f.kind === v ? " selected" : ""}>${esc(l)}</option>`).join("")}</select>`
    + `<input class="bt-input" data-pz-fv="${name}" aria-label="Badge id or number" placeholder="${f.kind === "badge" ? "badge id, e.g. splat-finisher" : "N"}" value="${esc(f.kind === "badge" ? f.badgeId || "" : f.n != null ? String(f.n) : "")}"${f.kind === "everyone" || f.kind === "everyBeat" ? " hidden" : ""}>`;
}
const readFilter = (box: HTMLElement, name: string) => {
  const kind = box.querySelector<HTMLSelectElement>(`[data-pz-f="${name}"]`)!.value, v = box.querySelector<HTMLInputElement>(`[data-pz-fv="${name}"]`)!.value.trim();
  return kind === "badge" ? { kind, badgeId: v } : kind === "nightShiftTop" || kind === "memberDays" ? { kind, n: Number(v) } : { kind };
};
function openBuilder(d0: Draft | null) {
  let d = d0, step = d0 ? 2 : 1;
  const m = openModal({ title: d0 ? "Edit contest" : "New contest", wide: true, feature: "prize-box", content: "" });
  const paint = () => {
    const steps = ["Template", "Details", "Rules and announcements"].map((n, i) => `<span class="${i + 1 === step ? "is-on" : i + 1 < step ? "is-done" : ""}">${i + 1}. ${n}</span>`).join("");
    let inner = "";
    if (step === 1) inner = `<div class="pz-tpls">${[["wheel", "Break Wheel", "A live draw at a stream break, with an optional Round 1."], ["online", "Online art", "Members upload a picture by a deadline; you judge."], ["mail", "Mail-in art", "Entry codes, a mailing address, a postmark deadline."], ["blank", "Blank", "Start from nothing."]].map(([k, n, t]) => `<button type="button" class="pz-tpl${d && d.template === k ? " is-on" : ""}" data-pz-tpl="${k}"><b>${n}</b>${t}</button>`).join("")}</div>`;
    else if (step === 2 && d) {
      const live = d.type === "live";
      inner = `<div class="pz-ad-form">
        <div class="bt-field pz-ad-full"><label class="bt-label" for="b-t">Title</label><input class="bt-input" id="b-t" data-b="title" maxlength="80" value="${esc(d.title)}"></div>
        <div class="bt-field pz-ad-full"><label class="bt-label" for="b-b">One line about it</label><input class="bt-input" id="b-b" data-b="blurb" maxlength="400" value="${esc(d.blurb)}"></div>
        ${live ? `<div class="bt-field"><label class="bt-label" for="b-beat">Draw at</label><select class="bt-select" id="b-beat" data-b="beat"><option value="break1"${d.beat === "break1" ? " selected" : ""}>Break 1</option><option value="break2"${d.beat === "break2" ? " selected" : ""}>Break 2</option></select><small class="bt-hint">The /live/control panel prompts you at this beat.</small></div>`
          : `<div class="bt-field"><label class="bt-label" for="b-o">Opens</label><input class="bt-input" id="b-o" data-b="opensAt" type="datetime-local" value="${toLocal(d.opensAt)}"></div><div class="bt-field"><label class="bt-label" for="b-c">Closes</label><input class="bt-input" id="b-c" data-b="closesAt" type="datetime-local" value="${toLocal(d.closesAt)}"></div>`}
        <div class="bt-field"><label class="bt-label" for="b-m">How winners are picked</label>${live ? '<p class="pz-note">The Prize Wheel, live.</p>' : `<select class="bt-select" id="b-m" data-b="method"><option value="judge"${d.method === "judge" ? " selected" : ""}>Judged by Boomer</option><option value="random"${d.method === "random" ? " selected" : ""}>Random draw</option></select>`}</div>
        ${d.type === "online" ? `<div class="bt-field"><label class="bt-label" for="b-k">Entries are</label><select class="bt-select" id="b-k" data-b="entryKind"><option value="upload"${d.entryKind !== "text" ? " selected" : ""}>A picture (JPG, PNG, WebP up to 10 MB)</option><option value="text"${d.entryKind === "text" ? " selected" : ""}>Written</option></select></div>` : ""}
        <div class="bt-field pz-ad-full"><span class="bt-label">Who can enter</span><div class="pz-ad-filter">${filterRow(d.eligibility[0] || { kind: "everyone" }, live, "elig")}</div><small class="bt-hint">${live ? "Crew, admins, the owner and recent live-draw winners are" : "Crew, admins and the owner are"} always left out.</small></div>
        <div class="bt-field pz-ad-full"><span class="bt-label">Prizes</span><div class="pz-ad-prizes">${d.prizes.map((p, i) => `<div class="pz-ad-prize"><span>${placeWord(i + 1)}</span><input class="bt-input" data-p-title="${i}" aria-label="${placeWord(i + 1)} prize" placeholder="What they win" value="${esc(p.title)}"><select class="bt-select" data-p-kind="${i}" aria-label="Kind">${Object.entries(KIND_WORD).map(([v, l]) => `<option value="${v}"${p.kind === v ? " selected" : ""}>${esc(l)}</option>`).join("")}</select><input class="bt-input" data-p-xp="${i}" type="number" min="0" max="1000" aria-label="XP" placeholder="XP" value="${p.xp || ""}"></div>`).join("")}
          ${live ? "" : `<div class="pz-ad-act"><button type="button" class="bt-btn bt-btn--ghost bt-btn--sm" data-pz-addplace>Add a place</button>${d.prizes.length > 1 ? '<button type="button" class="bt-btn bt-btn--ghost bt-btn--sm" data-pz-dropplace>Remove the last place</button>' : ""}</div>`}</div></div>
        ${live ? `<div class="bt-field pz-ad-full"><span class="bt-label">Round 1 groups (optional: 2 to 10 slices; a group may repeat to change the odds)</span><div class="pz-ad-r1">${d.round1.map((g, i) => `<div class="pz-ad-filter"><input class="bt-input" data-r1-name="${i}" aria-label="Slice name" maxlength="40" value="${esc(g.group)}">${filterRow(g.filter, true, `r1-${i}`)}</div>`).join("")}</div><div class="pz-ad-act"><button type="button" class="bt-btn bt-btn--ghost bt-btn--sm" data-pz-addr1>Add a slice</button>${d.round1.length ? '<button type="button" class="bt-btn bt-btn--ghost bt-btn--sm" data-pz-dropr1>Remove the last slice</button>' : ""}</div></div>` : ""}
      </div>`;
    } else if (d) inner = `<div class="pz-ad-form"><div class="bt-field pz-ad-full"><label class="bt-label" for="b-r">Official rules</label><textarea class="bt-input pz-ad-rules" id="b-r" data-b="rulesMd" rows="12">${esc(d.rulesMd)}</textarea><small class="bt-hint">Starts from the template, which is waiting for the lawyer's review. Fill in every bracketed part. The contest page shows the short version and links to these.</small></div>
      <div class="bt-field pz-ad-full"><span class="bt-label">Announcements</span>
        <label class="bt-check"><input type="checkbox" data-a="banner"${d.announce.banner ? " checked" : ""}> Site banner while it's open (live draws: the gold banner during the draw)</label>
        <label class="bt-check"><input type="checkbox" data-a="alerts"${d.announce.alerts ? " checked" : ""}> Boom Alerts: contest open, 1 day and 1 hour before it closes</label>
        <label class="bt-check"><input type="checkbox" data-a="feed"${d.announce.feed ? " checked" : ""}> Activity feed post for the winners (with their OK)</label>
        <div class="bt-field"><label class="bt-label" for="b-tag">Scream Planner stream tag (optional)</label><input class="bt-input" id="b-tag" data-a="plannerTag" maxlength="40" value="${esc(d.announce.plannerTag)}" placeholder="Wheel night"></div></div></div>`;
    m.modal.innerHTML = modalHeader(esc(d0 ? "Edit contest" : "New contest"), d0 ? "Changes save straight away; a published contest updates its page." : "Saved as a draft until you publish it. Members see nothing until then.")
      + `<div class="bt-modal-body"><div class="pz-ad-steps">${steps}</div>${inner}<p class="pz-note" data-b-err role="alert" hidden></p></div>`
      + `<div class="bt-modal-actions">${step > 1 && !(d0 && step === 2) ? '<button type="button" class="bt-btn bt-btn--secondary" data-b-back>Back</button>' : ""}<span class="pz-sp"></span>${step > 1 ? '<button type="button" class="bt-btn bt-btn--secondary" data-b-save>Save draft</button>' : ""}${step < 3 ? `<button type="button" class="bt-btn bt-btn--admin" data-b-next${step === 1 && !d ? " disabled" : ""}>Next</button>` : `<button type="button" class="bt-btn bt-btn--admin" data-b-publish>${d0 && d0.id && (raw[d0.id] || {}).status !== "draft" ? "Save" : "Save and publish"}</button>`}</div>`;
  };
  const collect = () => {
    if (!d) return;
    const q = (sel: string) => m.modal.querySelector<HTMLInputElement>(sel);
    if (step === 2) {
      d.title = q('[data-b="title"]')!.value; d.blurb = q('[data-b="blurb"]')!.value;
      if (d.type === "live") d.beat = q('[data-b="beat"]')!.value;
      else { d.opensAt = fromLocal(q('[data-b="opensAt"]')!.value); d.closesAt = fromLocal(q('[data-b="closesAt"]')!.value); d.method = q('[data-b="method"]')!.value; }
      if (d.type === "online") d.entryKind = q('[data-b="entryKind"]')!.value;
      const f = readFilter(m.modal, "elig"); d.eligibility = f.kind === "everyone" ? [] : [f];
      d.prizes = d.prizes.map((p, i) => ({ place: i + 1, title: q(`[data-p-title="${i}"]`)!.value, kind: q(`[data-p-kind="${i}"]`)!.value, xp: Number(q(`[data-p-xp="${i}"]`)!.value) || 0 }));
      if (d.type === "live") d.round1 = d.round1.map((_, i) => ({ group: q(`[data-r1-name="${i}"]`)!.value, filter: readFilter(m.modal, `r1-${i}`) }));
    }
    if (step === 3) { d.rulesMd = (m.modal.querySelector<HTMLTextAreaElement>('[data-b="rulesMd"]')!).value; d.announce = { banner: !!q('[data-a="banner"]')!.checked, alerts: !!q('[data-a="alerts"]')!.checked, feed: !!q('[data-a="feed"]')!.checked, plannerTag: q('[data-a="plannerTag"]')!.value }; }
  };
  const save = async (publish: boolean) => {
    if (!d) return;
    collect();
    const err = m.modal.querySelector<HTMLElement>("[data-b-err]")!;
    try {
      const r = await call<{ id: string }>("prizeContestSave", { id: d.id, type: d.type, title: d.title, blurb: d.blurb, method: d.type === "live" ? "wheel" : d.method, winnersCount: d.prizes.length, prizes: d.prizes,
        opensAt: d.opensAt, closesAt: d.closesAt, draw: d.type === "live" ? { beat: d.beat } : null, entryKind: d.type === "online" ? d.entryKind : null, eligibility: d.eligibility, round1: d.type === "live" && d.round1.length >= 2 ? d.round1 : [], rulesMd: d.rulesMd, announce: d.announce });
      d.id = r.id;
      if (publish && (raw[r.id] || {}).status !== "scheduled" && (!raw[r.id] || raw[r.id].status === "draft")) await call("prizeContestStatus", { id: r.id, action: "publish" });
      m.close(); toast(publish ? "Published." : "Saved as a draft.");
      await refresh();
    } catch (e) { err.textContent = messageFor(e); err.hidden = false; }
  };
  m.modal.addEventListener("click", (e) => {
    const t = e.target as HTMLElement;
    const tp = t.closest<HTMLElement>("[data-pz-tpl]");
    if (tp) { d = fromTemplate(tp.dataset.pzTpl!); paint(); return; }
    if (t.closest("[data-b-next]")) { collect(); step++; paint(); return; }
    if (t.closest("[data-b-back]")) { collect(); step--; paint(); return; }
    if (t.closest("[data-b-save]")) { void save(false); return; }
    if (t.closest("[data-b-publish]")) { void save(!(d0 && d0.id && (raw[d0.id] || {}).status !== "draft")); return; }
    if (t.closest("[data-pz-addplace]") && d && d.prizes.length < 10) { collect(); d.prizes.push({ place: d.prizes.length + 1, title: "", kind: "badgeXp", xp: 0 }); paint(); return; }
    if (t.closest("[data-pz-dropplace]") && d) { collect(); d.prizes.pop(); paint(); return; }
    if (t.closest("[data-pz-addr1]") && d && d.round1.length < 10) { collect(); d.round1.push({ group: "Everyone", filter: { kind: "everyone" } }); paint(); return; }
    if (t.closest("[data-pz-dropr1]") && d) { collect(); d.round1.pop(); paint(); return; }
  });
  m.modal.addEventListener("change", (e) => {
    const s = (e.target as HTMLElement).closest<HTMLSelectElement>("[data-pz-f]");
    if (s) { const v = m.modal.querySelector<HTMLInputElement>(`[data-pz-fv="${s.dataset.pzF}"]`)!; v.hidden = s.value === "everyone" || s.value === "everyBeat"; v.placeholder = s.value === "badge" ? "badge id, e.g. splat-finisher" : "N"; }
  });
  paint();
}

// ------------------------------------------------------------------------------------------------ judging (owner)
async function openJudge(c: Contest) {
  await loadEntries(c.id);
  const ok = entries.filter((e) => e.status === (c.type === "mail" ? "received" : "accepted"));
  if (!ok.length) { toast("There are no accepted entries to pick from.", { kind: "error" }); return; }
  const opts = `<option value="">Nobody</option>` + ok.map((e) => `<option value="${esc(e.uid)}">@${esc(e.handle || "member")}: ${esc(e.title || (e.kind === "mail" ? "mail-in" : "untitled"))}</option>`).join("");
  const m = openModal({ title: "Pick winners", feature: "prize-box", content: modalHeader("Pick winners", esc(c.title)) + `<div class="bt-modal-body"><div class="pz-ad-form">${c.prizes.map((p) => `<div class="bt-field pz-ad-full"><label class="bt-label" for="j-${p.place}">${placeWord(p.place)}: ${esc(p.title)}</label><select class="bt-select" id="j-${p.place}" data-j="${p.place}">${opts}</select></div>`).join("")}</div><p class="pz-note">Ties are yours to place. The winners are told, the badge is granted and the results go to every entrant.</p><p class="pz-note" data-j-err role="alert" hidden></p></div><div class="bt-modal-actions"><button type="button" class="bt-btn bt-btn--ghost" data-bt-close>Not yet</button><button type="button" class="bt-btn bt-btn--admin" data-j-go>Announce the winners</button></div>` });
  m.modal.querySelector("[data-j-go]")!.addEventListener("click", async () => {
    const places = c.prizes.map((p) => ({ place: p.place, uid: m.modal.querySelector<HTMLSelectElement>(`[data-j="${p.place}"]`)!.value })).filter((x) => x.uid);
    try { await call("prizeJudge", { contestId: c.id, places }); m.close(); toast("Winners announced."); await refresh(); }
    catch (e) { const el = m.modal.querySelector<HTMLElement>("[data-j-err]")!; el.textContent = messageFor(e); el.hidden = false; }
  });
}

// ------------------------------------------------------------------------------------------------ events
async function refresh() { await loadAll(); await draw(); }
function bind() {
  if (!root) return;
  root.addEventListener("click", async (e) => {
    const t = e.target as HTMLElement, b = t.closest<HTMLButtonElement>("button");
    if (!b || !root.contains(b)) return;
    const go = b.closest<HTMLElement>("[data-pz-gotab]") || (b.closest("[data-pz-tabs]") ? b : null);
    if (go) { const v = (go.dataset.pzGotab || go.dataset.value) as Tab; if (v) { tab = v; history.replaceState(null, "", `?tab=${v}`); await draw(); } return; }
    if (b.hasAttribute("data-pz-new")) { openBuilder(null); return; }
    const id = b.dataset.pzEdit; if (id) { const c = contests.find((x) => x.id === id); if (c) openBuilder(fromContest(c)); return; }
    if (b.dataset.pzMove) {
      const c = contests.find((x) => x.id === b.dataset.id)!, action = b.dataset.pzMove;
      if (action === "cancel" && !(await confirmAction({ feature: "prize-box", title: "Cancel this contest?", message: `${c.title} closes for good and its page says it was cancelled. Entries stay as they are.`, confirmLabel: "Cancel the contest", danger: true }))) return;
      try { const r = await call<{ status: string }>("prizeContestStatus", { id: c.id, action }); toast(`${c.title}: ${STATUS[r.status as Contest["status"]]?.[1] || r.status}.`); await refresh(); } catch (err) { toast(messageFor(err), { kind: "error" }); }
      return;
    }
    if (b.dataset.pzDelete) {
      const c = contests.find((x) => x.id === b.dataset.pzDelete)!;
      const ok = await confirmAction({ feature: "prize-box", title: "Delete this contest?", message: `${c.title}, its entries and their files, codes, winners, the mail log and its feed posts are deleted for good. This can't be undone.`, confirmLabel: "Delete it", danger: true,
        onConfirm: async () => { await call("prizeContestStatus", { id: c.id, action: "delete" }); } });
      if (ok) { toast("Deleted."); await refresh(); }
      return;
    }
    if (b.dataset.pzJudge) { const c = contests.find((x) => x.id === b.dataset.pzJudge); if (c) void openJudge(c); return; }
    if (b.dataset.pzRandom) {
      const c = contests.find((x) => x.id === b.dataset.pzRandom)!;
      const ok = await confirmAction({ feature: "prize-box", title: "Draw the winners?", message: `The server picks ${c.winnersCount === 1 ? "one winner" : `${c.winnersCount} winners`} at random from the ${c.type === "mail" ? "received" : "accepted"} entries of ${c.title}.`, confirmLabel: "Draw them", onConfirm: async () => { await call("prizeJudge", { contestId: c.id, random: true }); } });
      if (ok) { toast("Winners drawn."); await refresh(); }
      return;
    }
    if (b.dataset.pzEntries) { entryContest = b.dataset.pzEntries; tab = "entries"; history.replaceState(null, "", `?tab=entries&contest=${entryContest}`); await draw(); return; }
    if (b.dataset.pzFile) { try { const r = await call<{ url: string }>("prizeEntryUrl", { contestId: entryContest, uid: b.dataset.pzFile }); window.open(r.url, "_blank", "noopener"); } catch (err) { toast(messageFor(err), { kind: "error" }); } return; }
    if (b.dataset.pzReview) {
      const decision = b.dataset.pzReview, uid = b.dataset.uid;
      let reason = "";
      if (decision === "reject") {
        const ok = await confirmAction({ feature: "prize-box", title: "Reject this entry?", message: "The member sees your reason and can send a new entry before the deadline.", bodyHtml: `<div class="bt-field"><label class="bt-label" for="pz-rj">Reason</label><input class="bt-input" id="pz-rj" maxlength="300" placeholder="It isn't your own drawing"></div>`, confirmLabel: "Reject it",
          onConfirm: async (modal: HTMLElement) => { reason = (modal.querySelector<HTMLInputElement>("#pz-rj")!).value.trim(); if (reason.length < 3) throw new Error("Give the member a reason."); await call("prizeEntryReview", { contestId: entryContest, uid, decision, reason }); } });
        if (ok) { toast("Rejected. The member was told why."); await draw(); }
        return;
      }
      try { await call("prizeEntryReview", { contestId: entryContest, uid, decision }); toast("Accepted."); await draw(); } catch (err) { toast(messageFor(err), { kind: "error" }); }
      return;
    }
    if (b.hasAttribute("data-pz-lookup")) {
      const f = root.querySelector<HTMLFormElement>("[data-pz-mail]")!, out = f.querySelector<HTMLElement>("[data-pz-mail-out]")!;
      try { const r = await call<any>("prizeMailLog", { action: "lookup", code: (f.querySelector<HTMLInputElement>('[name="code"]')!).value }); out.textContent = r.found ? `${r.code}: @${r.handle || "member"}, ${r.contestTitle} (closes ${dateWord(r.closesAt)}). ${r.receivedAt ? `Already received ${dateWord(r.receivedAt)}.` : "Not received yet."}` : `${r.code}: no entry has this code. Log it as unmatched.`; }
      catch (err) { out.textContent = messageFor(err); }
      return;
    }
    if (b.dataset.pzResolve) { try { await call("prizeMailLog", { action: "resolve", id: b.dataset.pzResolve }); await refresh(); } catch (err) { toast(messageFor(err), { kind: "error" }); } return; }
    if (b.dataset.pzAddr) {
      try {
        const r = await call<{ address: any; parentOk: boolean | null }>("prizeClaimAdmin", { winnerId: b.dataset.pzAddr, action: "showAddress" });
        const out = b.closest(".pz-ad-row")!.querySelector<HTMLElement>("[data-pz-addr-out]")!;
        const a = r.address || {};
        out.outerHTML = `<div class="pz-ad-addr">${esc(a.name || "")}<br>${esc(a.line1 || "")}${a.line2 ? `<br>${esc(a.line2)}` : ""}<br>${esc(a.city || "")}, ${esc(a.state || "")} ${esc(a.zip || "")}${r.parentOk ? '<br><small>A parent or guardian said OK.</small>' : ""}</div>`;
        b.remove(); toast("Address shown. This was logged.");
      } catch (err) { toast(messageFor(err), { kind: "error" }); }
      return;
    }
    if (b.dataset.pzShip) {
      const ok = await confirmAction({ feature: "prize-box", title: "Mark it shipped?", message: "The winner gets an alert that it's on its way.", bodyHtml: `<div class="bt-field"><label class="bt-label" for="pz-tr">Tracking number (optional)</label><input class="bt-input" id="pz-tr" maxlength="120"></div>`, confirmLabel: "Mark shipped",
        onConfirm: async (modal: HTMLElement) => { await call("prizeClaimAdmin", { winnerId: b.dataset.pzShip, action: "markShipped", tracking: (modal.querySelector<HTMLInputElement>("#pz-tr")!).value }); } });
      if (ok) {
        const row = b.closest(".pz-ad-row");
        if (row) { const act = row.querySelector(".pz-ad-act")!; act.innerHTML = stampHtml({ label: "Shipped", tone: "lime", size: "sm" }); }
        toast("Shipped. The winner was told.");
        await loadAll();
      }
      return;
    }
    if (b.dataset.pzCode) {
      const ok = await confirmAction({ feature: "prize-box", title: "Set the prize code", message: "Only the winner sees it, and only after claiming.", bodyHtml: `<div class="bt-field"><label class="bt-label" for="pz-cd">Code</label><input class="bt-input" id="pz-cd" maxlength="200" autocomplete="off"></div>`, confirmLabel: "Save the code",
        onConfirm: async (modal: HTMLElement) => { await call("prizeClaimAdmin", { winnerId: b.dataset.pzCode, action: "setCode", code: (modal.querySelector<HTMLInputElement>("#pz-cd")!).value }); } });
      if (ok) toast("Code saved.");
      return;
    }
    if (b.dataset.pzRedraw) {
      const w = winners.find((x) => x.id === b.dataset.pzRedraw)!;
      const ok = await confirmAction({ feature: "prize-box", title: w.status === "forfeited" ? "Redraw this prize?" : "Forfeit and redraw?", message: `@${w.handle || "The winner"} loses ${w.prizeTitle}. A random contest draws again among the others; a judged one comes back to you; a live one is rerun from the draw.`, confirmLabel: "Redraw", danger: true,
        onConfirm: async () => { const r = await call<{ redraw: string; handle?: string }>("prizeClaimAdmin", { winnerId: w.id, action: "redraw" }); toast(r.redraw === "drawn" ? `@${r.handle} won the redraw.` : r.redraw === "judge" ? "Pick the new winner with Pick winners." : r.redraw === "live" ? "Rerun it at the next stream from /live/control." : "Nobody else can win this one."); } });
      if (ok) await refresh();
      return;
    }
  });
  root.addEventListener("change", async (e) => {
    const s = (e.target as HTMLElement).closest<HTMLSelectElement>("[data-pz-entry-contest]");
    if (s) { entryContest = s.value; history.replaceState(null, "", `?tab=entries&contest=${entryContest}`); await draw(); }
  });
  root.addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.target as HTMLFormElement, fd = new FormData(f);
    try {
      if (f.matches("[data-pz-mail]")) {
        const r = await call<{ late: boolean; already: boolean }>("prizeMailLog", { action: "receive", code: fd.get("code"), postmarkedOn: fd.get("postmarkedOn") });
        toast(r.already ? "That envelope was already logged." : r.late ? "Logged as late: postmarked after the deadline, so it isn't accepted." : "Received. The member was told.");
        await refresh();
      } else if (f.matches("[data-pz-unmatched]")) {
        await call("prizeMailLog", { action: "unmatched", note: fd.get("note"), postmarkedOn: fd.get("postmarkedOn") || null });
        toast("Logged as unmatched."); await refresh();
      } else if (f.matches("[data-pz-settings]")) {
        await call("prizeSettings", { cooldownDays: Number(fd.get("cooldownDays")), claimDays: Number(fd.get("claimDays")), hereSeconds: Number(fd.get("hereSeconds")), mailingAddress: String(fd.get("mailingAddress") || "") });
        toast("Settings saved.");
      }
    } catch (err) { toast(messageFor(err), { kind: "error" }); }
  });
}

whenReady().then(async (s) => {
  if (!root) return;
  auth = s;
  if (!s.user || !s.isAdmin) {
    root.innerHTML = `<div class="bt-empty"><p class="bt-empty-title">Admins only</p><p>The Prize Box admin page is for the site's admins.</p><a class="bt-btn bt-btn--secondary" href="/prizes">Back to the Prize Box</a></div>`;
    return;
  }
  if ((tab === "claims" || tab === "settings") && !isOwner()) tab = "contests";
  bind();
  try { await refresh(); } catch (err) { root.innerHTML = `<div class="bt-notice">${esc(messageFor(err))}</div>`; }
});
