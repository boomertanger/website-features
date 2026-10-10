// /admin/inbox, the Hotline Boom inbox (docs/specs/hotline-boom.md §4, §5, §9; mockup docs/design/mockups/hotline-boom-inbox.html Layout 1 Split).
// Who: the owner (sites/{id}.ownerUid) and admins whose crewGrade claim is in hotline/main.inboxGrades. The owner reads both lanes; the inbox team reads the team lane only, and
// never sees an owner-lane count, lamp or source (the rules enforce it; this page simply never asks). Every change goes through the callables:
//   contactAction { lane, id, action: status | spam | assign | escalate, value }   contactNote { lane, id, text }
//   contactReply  { lane, id, text, from, markWaiting, manual }                     contactSettings { inboxGrades, replyTime, nameCheck, emailOwner, lines }
// Email off (no RESEND_API_KEY yet): contactReply answers { sent: false, reason: "email-off", mailto }, so the composer offers "Open in my email" and then "Mark as replied" (manual).
// Tabs: ?tab=inbox | sources | settings. ?id=<message id> opens that message.
// Preview (non-production, signed out, ?as=admin; &owner=0 for an inbox admin's view): sample data from src/data/preview-hotline-inbox.json, changes stay in the page.
import { escapeHtml as esc } from "../../../../shared/ui/dom.js";
import { readoutsHtml } from "../../../../shared/ui/readout.js";
import { sectionHeadHtml } from "../../../../shared/ui/section-head.js";
import { stampHtml } from "../../../../shared/ui/stamp.js";
import { toast } from "../../../../shared/ui/toast.js";
import { confirmAction } from "../../../../shared/ui/confirm.js";
import { onAuth, type AuthState } from "../../lib/auth";
import { auth } from "../../lib/firebase";
import { db, doc, getDoc, getDocs, collection, query, where, orderBy, limit, SITE_ID } from "../../lib/db";
import { call } from "../../lib/call";
import { messageFor } from "../../lib/errors";
import { isProduction } from "../../lib/env.js";
import { icon } from "./art";

type Lane = "team" | "owner";
type Status = "new" | "open" | "waiting" | "done" | "spam";
interface Msg {
  id: string; lane: Lane; ref: number; line: string; status: Status; assignee: string | null;
  sender: { uid?: string; handle?: string; name?: string; email?: string }; fields: Record<string, string>; body: string;
  source: string | null; via: string | null; onlyOwner: boolean; namecheck: { uid: string; handle: string | null; grade: string | null } | null;
  escalatedBy: string | null; createdAt: number; firstReplyAt: number | null;
}
interface Note { id: string; kind: "reply" | "note" | "event"; by: string | null; from?: string; text: string; at: number; event?: string; value?: string | null; manual?: boolean }
interface PreviewData { ownerUid: string; handles: Record<string, string>; staff: string[]; messages: any[] }
interface Main { inboxGrades: string[]; replyTime: string; lines: Record<string, boolean>; nameCheck: boolean; emailOwner: { business: boolean; private: boolean } }

const LINES: Record<string, [number, string, string, Lane, string]> = {   // id: [key, title, short, lane, reply-from]
  hi: [1, "Say hi", "Say hi", "team", "fanmail"], feedback: [2, "Feedback", "Feedback", "team", "fanmail"], help: [3, "Account help", "Help", "team", "support"],
  business: [4, "Business & collabs", "Business", "owner", "business"], private: [5, "Private matter", "Private", "owner", "fanmail"], report: [6, "Report a person", "Report", "owner", "support"],
};
const LINE_IDS = Object.keys(LINES);
const FROM = ["business", "fanmail", "support", "privacy"];
const DOMAIN = "boomertanger.com";
const ST: Record<Status, [string, string]> = { new: ["New", "blue"], open: ["Open", "teal"], waiting: ["Waiting", "gold"], done: ["Done", "lime"], spam: ["Spam", "gray"] };
const GRADE_NAMES: Record<string, string> = { A1: "Steward", A2: "Overseer", A3: "Right Hand", 1: "Initiate", 2: "Watcher", 3: "Warden", 4: "Sentinel" };
const FIELD_LABELS: Record<string, string> = { about: "About", stream: "Stream", mood: "Mood", company: "Company", website: "Website", kind: "What kind", timeline: "Timeline", who: "Who it's about" };
const VALUE_LABELS: Record<string, string> = {
  stream: "A stream", website: "The website", game: "A game", crew: "The crew", other: "Something else", loved: "Loved it", okay: "It was okay", notgreat: "Not great",
  sponsorship: "Sponsorship", collab: "Collab with another creator", gamekey: "Game key or early access", press: "Press or interview",
  norush: "No rush", month: "This month", twoweeks: "Within two weeks", urgent: "It's urgent",
};
const SOURCE_LABELS: Record<string, string> = { twitch: "Twitch", youtube: "YouTube", tiktok: "TikTok", instagram: "Instagram", search: "Google or search", friend: "A friend", streamer: "Another streamer", community: "Reddit or Discord", other: "Something else" };
const DEFAULT_MAIN: Main = { inboxGrades: ["A2", "A3"], replyTime: "3 days", lines: {}, nameCheck: true, emailOwner: { business: true, private: true } };
const PAGE = 200;
const H = 3600e3;
let P: PreviewData | null = null;   // preview data (signed out, ?as=admin, non-production)
const previewNotes = new Map<string, Note[]>();

const host = document.querySelector<HTMLElement>("[data-hb-access]");
const root = document.querySelector<HTMLElement>("[data-hb-ib]");
const tabsNav = document.querySelector<HTMLElement>("[data-hb-tabs]");
const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const narrow = () => (root?.offsetWidth ?? 1000) <= 640;
const mascot = () => document.getElementById("bt-mascot-tpl")?.innerHTML ?? "";
const ms = (v: any): number | null => (v == null ? null : typeof v === "number" ? v : typeof v.toMillis === "function" ? v.toMillis() : null);
const base = () => ["sites", SITE_ID, "hotline", "main"] as const;
const qs = () => new URLSearchParams(location.search);

const S = {
  uid: "", owner: false, inbox: false, ownerUid: "" as string, main: { ...DEFAULT_MAIN } as Main,
  msgs: [] as Msg[], loaded: false, error: "",
  tab: "inbox" as "inbox" | "sources" | "settings", status: "all" as "all" | Status, line: null as string | null, q: "",
  sel: null as string | null, reading: false, ctab: "reply" as "reply" | "note", notes: new Map<string, Note[]>(),
  handles: new Map<string, string>(), staff: [] as { uid: string; handle: string }[], streams: new Map<string, string>(),
  manual: null as null | { id: string; mailto: string; to: string | null; text: string; from: string; markWaiting: boolean },
  period: "90" as "30" | "90" | "all", stats: null as null | Record<string, any>, busy: false, stamp: false,
  draft: null as null | Main,
};

/* ---------- small pieces ---------- */
const svg = (k: string, cls = "") => icon(k).replace("<svg ", `<svg width="16" height="16"${cls ? ` class="${cls}"` : ""} `);
const extra: Record<string, string> = {
  flag: '<path d="M5 21V4h11l-1.5 4L16 12H5"/>', reply: '<path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 6 6v4"/>',
  note: '<path d="M5 4h10l4 4v12H5z"/><path d="M15 4v4h4M8 12h8M8 16h5"/>', search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>', link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
};
const ic = (k: string, cls = "") => (extra[k] ? `<svg width="16" height="16"${cls ? ` class="${cls}"` : ""} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${extra[k]}</svg>` : svg(k, cls));
const badge = (s: Status) => `<span class="bt-badge bt-badge--${ST[s][1]}"><span class="bt-badge-dot"></span>${ST[s][0]}</span>`;
const key = (m: Msg) => `<span class="hb-ib-k" aria-hidden="true">${LINES[m.line]?.[0] ?? "?"}</span>`;
const title = (m: Msg) => LINES[m.line]?.[1] ?? "Message";
const laneTag = (lane: Lane) => (lane === "owner" ? `<span class="bt-tag hb-lane hb-lane--owner">${ic("private")}Only Boomertanger</span>` : `<span class="bt-tag hb-lane">${ic("team")}Inbox team</span>`);
const nameOf = (m: Msg) => (m.sender.uid ? (m.sender.handle ? `@${m.sender.handle}` : "Deleted member") : m.sender.name || "Visitor");
const initialsOf = (m: Msg) => (m.sender.handle || m.sender.name || "?").replace(/[^a-z0-9]/gi, "").slice(0, 2).toUpperCase() || "?";
const handleOf = (uid: string | null | undefined) => (!uid ? "someone" : S.handles.get(uid) ? `@${S.handles.get(uid)}` : uid === S.ownerUid ? "Boomertanger" : "Former admin");
const snippet = (m: Msg) => m.body.replace(/\s+/g, " ").slice(0, 120);
function ago(t: number | null, suffix = "") {
  if (!t) return "";
  const d = Date.now() - t, m = Math.round(d / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m${suffix}`;
  if (m < 60 * 24) return `${Math.round(m / 60)}h${suffix}`;
  if (m < 60 * 24 * 7) return `${Math.round(m / 1440)}d${suffix}`;
  return new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
const visibleLines = () => LINE_IDS.filter((l) => S.owner || LINES[l][3] === "team");

/* ---------- data ---------- */
function toMsg(id: string, lane: Lane, d: any): Msg {
  return {
    id, lane, ref: Number(d.ref) || 0, line: String(d.line || ""), status: (ST[d.status as Status] ? d.status : "new") as Status, assignee: d.assignee || null,
    sender: d.sender || {}, fields: d.fields || {}, body: String(d.body || ""), source: d.source || null, via: d.via || null, onlyOwner: d.onlyOwner === true,
    namecheck: d.namecheck || null, escalatedBy: d.escalatedBy || null, createdAt: ms(d.createdAt) ?? 0, firstReplyAt: ms(d.firstReplyAt),
  };
}
async function loadLane(lane: Lane): Promise<Msg[]> {
  const snap = await getDocs(query(collection(db, ...base(), `${lane}Messages`), orderBy("createdAt", "desc"), limit(PAGE)));
  return snap.docs.map((d) => toMsg(d.id, lane, d.data()));
}
async function loadMessages() {
  if (P) {
    const lanes = S.owner ? ["owner", "team"] : ["team"];
    if (!S.loaded) S.msgs = P.messages.filter((x) => lanes.includes(x.lane)).map((x) => ({ ...toMsg(x.id, x.lane, { ...x, createdAt: Date.now() - x.h * H, firstReplyAt: x.firstReplyH ? Date.now() - x.firstReplyH * H : null }) }));
    S.msgs.sort((a, b) => b.createdAt - a.createdAt);
    S.loaded = true;
    return;
  }
  const lanes: Lane[] = S.owner ? ["owner", "team"] : ["team"];
  const all = (await Promise.all(lanes.map(loadLane))).flat();
  S.msgs = all.sort((a, b) => b.createdAt - a.createdAt);
  S.loaded = true;
}
async function loadNotes(m: Msg) {
  if (P) {
    if (!previewNotes.has(m.id)) {
      const x = P.messages.find((y) => y.id === m.id);
      previewNotes.set(m.id, [{ id: "r", kind: "event", by: null, text: "received", at: m.createdAt, event: x?.namecheck ? "namecheck" : undefined }, ...((x?.notes || []) as any[]).map((n, i) => ({ id: `n${i}`, ...n, at: Date.now() - n.h * H }))]);
    }
    S.notes.set(m.id, previewNotes.get(m.id)!);
    return;
  }
  const snap = await getDocs(query(collection(db, ...base(), `${m.lane}Messages`, m.id, "hotlineNotes"), orderBy("at", "asc")));
  const notes = snap.docs.map((d) => { const x = d.data() as any; return { id: d.id, kind: x.kind, by: x.by || null, from: x.from, text: String(x.text || ""), at: ms(x.at) ?? 0, event: x.event, value: x.value ?? null, manual: x.manual === true } as Note; });
  S.notes.set(m.id, notes);
  await names(notes.map((n) => n.by).concat(m.assignee, m.escalatedBy));
  const sid = m.fields.stream;
  if (sid && !S.streams.has(sid)) { try { const s = await getDoc(doc(db, "sites", SITE_ID, "streams", sid)); S.streams.set(sid, s.exists() ? String(s.get("title") || sid) : sid); } catch { S.streams.set(sid, sid); } }
}
/** Handles for uids (profiles are public). */
async function names(uids: (string | null | undefined)[]) {
  if (P) { for (const [u, h] of Object.entries(P.handles)) S.handles.set(u, h); return; }
  const need = [...new Set(uids.filter((u): u is string => !!u && !S.handles.has(u)))];
  await Promise.all(need.map(async (u) => { try { const p = await getDoc(doc(db, "sites", SITE_ID, "profiles", u)); if (p.exists() && p.get("handle")) S.handles.set(u, String(p.get("handle"))); } catch { /* unknown */ } }));
}
/** Who a team message can be assigned to: the owner and the admins whose grade has the inbox. */
async function loadStaff() {
  if (P) { S.staff = P.staff.map((uid) => ({ uid, handle: P!.handles[uid] || uid })); return; }
  try {
    const snap = await getDocs(query(collection(db, "sites", SITE_ID, "crew", "main", "roster"), where("track", "==", "admin")));
    const uids = snap.docs.filter((d) => S.main.inboxGrades.includes(`A${d.get("grade")}`) && !["alumni", "paused"].includes(String(d.get("status")))).map((d) => d.id);
    const all = [...new Set([S.ownerUid, ...uids].filter(Boolean))];
    await names(all);
    S.staff = all.map((uid) => ({ uid, handle: S.handles.get(uid) || (uid === S.ownerUid ? "boomertanger" : uid.slice(0, 6)) }));
  } catch { S.staff = S.ownerUid ? [{ uid: S.ownerUid, handle: S.handles.get(S.ownerUid) || "boomertanger" }] : []; }
}
async function loadStats() {
  if (P) { const sum: Record<string, any> = { total: S.msgs.length, answered: S.msgs.filter((m) => m.firstReplyAt).length, source: {}, via: {} }; for (const m of S.msgs) { if (m.source) sum.source[m.source] = (sum.source[m.source] || 0) + 1; if (m.via) sum.via[m.via.replace(/./g, "_")] = (sum.via[m.via.replace(/./g, "_")] || 0) + 1; } S.stats = sum; return; }
  const snap = await getDocs(collection(db, ...base(), S.owner ? "stats" : "statsTeam"));
  const sum: Record<string, any> = { total: 0, answered: 0, source: {}, via: {} };
  for (const d of snap.docs) {
    const x = d.data() as any;
    sum.total += Number(x.total) || 0; sum.answered += Number(x.answered) || 0;
    for (const k of ["source", "via"]) for (const [a, n] of Object.entries(x[k] || {})) sum[k][a] = (sum[k][a] || 0) + (Number(n) || 0);
  }
  S.stats = sum;
}

/* ---------- filters ---------- */
function list() {
  const q = S.q.trim().toLowerCase();
  return S.msgs.filter((m) => (S.status === "all" ? m.status !== "spam" : m.status === S.status) && (!S.line || m.line === S.line)
    && (!q || `${nameOf(m)} ${m.sender.email || ""} ${title(m)} ${m.body} ${Object.values(m.fields).join(" ")} BT-${m.ref}`.toLowerCase().includes(q)));
}
const count = (s: Status) => S.msgs.filter((m) => m.status === s).length;
function medianFirstReply() {
  const since = Date.now() - 90 * 864e5;
  const d = S.msgs.filter((m) => m.firstReplyAt && m.createdAt >= since).map((m) => m.firstReplyAt! - m.createdAt).sort((a, b) => a - b);
  if (!d.length) return "n/a";
  const v = d[Math.floor(d.length / 2)], h = v / 3600e3;
  return h < 1 ? `${Math.max(1, Math.round(v / 60000))}m` : h < 48 ? `${Math.round(h)}h` : `${Math.round(h / 24)}d`;
}

/* ---------- inbox tab ---------- */
function heroHtml() {
  const lamps = visibleLines().map((l) => {
    const c = S.msgs.filter((m) => m.line === l && m.status === "new").length, own = LINES[l][3] === "owner";
    return `<button type="button" class="hb-ib-lamp${c ? " is-lit" : ""}${own ? " is-owner" : ""}" aria-pressed="${S.line === l}" data-lamp="${l}" aria-label="Line ${LINES[l][0]}, ${esc(LINES[l][1])}: ${c} new"><span class="hb-ib-bulb">${LINES[l][0]}${c ? `<span class="hb-ib-lamp-n">${c}</span>` : ""}</span><span class="hb-ib-lamp-l">${own ? `${ic("private")} ` : ""}${esc(LINES[l][2])}</span></button>`;
  }).join("");
  return `<section class="hb-ib-hero"><div><h1 class="bt-title">Inbox</h1><p class="hb-ib-sub">${S.owner ? "Everything sent to Hotline Boom. The gold lines are yours alone." : "Fan mail, feedback and account help. Thanks for helping!"}</p>
    ${readoutsHtml([{ value: count("new"), label: "New" }, { value: count("open"), label: "Open" }, { value: count("waiting"), label: "Waiting" }, { value: medianFirstReply(), label: "First reply, median" }], { cols: 4 })}</div>
    <div class="hb-ib-lamps" role="group" aria-label="Filter by line">${lamps}</div></section>`;
}
function toolsHtml() {
  const c = (s: "all" | Status) => (s === "all" ? S.msgs.filter((m) => m.status !== "spam").length : count(s));
  const chips = (["all", "new", "open", "waiting", "done", "spam"] as const).map((s) => `<button type="button" class="bt-chip bt-chip--small${S.status === s ? " is-active" : ""}" aria-pressed="${S.status === s}" data-status="${s}">${s === "all" ? "All" : ST[s][0]}<span class="hb-ib-chipn">${c(s)}</span></button>`).join("");
  return `<div class="hb-ib-tools"><div class="bt-sortbar" role="group" aria-label="Filter by status">${chips}</div><label class="bt-search">${ic("search")}<input class="bt-input" type="search" data-q placeholder="Search name, email or words" value="${esc(S.q)}" aria-label="Search messages"><span class="bt-search-key" aria-hidden="true">/</span></label></div>
    ${S.line ? `<div class="hb-ib-note">Showing line ${LINES[S.line][0]}, ${esc(LINES[S.line][1])} only. <button type="button" data-lamp="${S.line}">Show all lines</button></div>` : ""}`;
}
function rowHtml(m: Msg) {
  const own = m.lane === "owner";
  return `<button type="button" class="bt-row bt-row--clickable hb-ib-item${m.status === "new" ? " is-new" : ""}${own ? " is-owner" : ""}" data-open="${m.id}" aria-current="${S.sel === m.id && (!narrow() || S.reading)}">${key(m)}<span class="hb-ib-who"><span>${esc(nameOf(m))}</span>${own ? ic("private", "is-lock") : ""}${m.namecheck && S.owner ? ic("flag", "is-flag") : ""}</span><span class="hb-ib-snip"><b>${esc(title(m))}:</b> ${esc(snippet(m))}</span><span class="hb-ib-side"><span class="hb-ib-when">${esc(ago(m.createdAt))}</span><span class="hb-ib-side-row">${m.assignee ? `<span class="hb-ib-av" title="${esc(handleOf(m.assignee))}">${esc(handleOf(m.assignee).replace("@", "").slice(0, 2).toUpperCase())}</span>` : ""}${badge(m.status)}</span></span></button>`;
}
function historyHtml(m: Msg) {
  const notes = S.notes.get(m.id);
  if (!notes) return `<div class="bt-skeleton" style="height:60px" aria-hidden="true"></div>`;
  const items = notes.map((n): [string, string, number] => {
    if (n.kind === "reply") return ["lime", `<b>${n.manual ? "Replied from email" : "Reply sent"}</b> from ${esc(n.from || "")} by ${esc(handleOf(n.by))}<div class="hb-ib-bubble">${esc(n.text)}${n.manual ? "" : "<br><small>the Boomertanger crew</small>"}</div>`, n.at];
    if (n.kind === "note") return ["gray", `<b>Note</b> from ${esc(handleOf(n.by))}<div class="hb-ib-bubble">${esc(n.text)}</div>`, n.at];
    if (n.event === "namecheck" || (n.text === "received" && n.event === "namecheck")) return ["gold", `<b>Received</b> and moved to Owner only by the name check`, n.at];
    if (n.text === "received") return ["blue", `<b>Received</b> on line ${LINES[m.line]?.[0] ?? "?"}, ${esc(title(m))}`, n.at];
    if (n.event === "status") return ["teal", `<b>Marked ${esc(ST[n.value as Status]?.[0] ?? String(n.value))}</b> by ${esc(handleOf(n.by))}`, n.at];
    if (n.event === "assign") return ["teal", n.value ? `<b>Assigned</b> to ${esc(handleOf(n.value))} by ${esc(handleOf(n.by))}` : `<b>Unassigned</b> by ${esc(handleOf(n.by))}`, n.at];
    if (n.event === "escalate") return ["gold", `<b>Moved to Owner only</b> by ${esc(handleOf(n.by))}`, n.at];
    return ["gray", esc(n.text), n.at];
  });
  return `<div class="bt-history">${items.map(([c, t, at]) => `<div class="bt-history-item"><div class="bt-history-line"><span class="bt-history-dot bt-history-dot--${c}"></span><span class="bt-history-rule"></span></div><div class="bt-history-body">${t}<small>${esc(ago(at, " ago"))}</small></div></div>`).join("")}</div>`;
}
function factsHtml(m: Msg) {
  return Object.entries(m.fields).filter(([, v]) => v != null && v !== "").map(([k, v]) => {
    let shown = k === "stream" ? S.streams.get(v) || v : VALUE_LABELS[v] && ["about", "mood", "kind", "timeline"].includes(k) ? VALUE_LABELS[v] : v;
    if (k === "website") shown = String(v);
    return `<div class="hb-ib-fact"><small>${esc(FIELD_LABELS[k] || k)}</small><span>${esc(shown)}</span></div>`;
  }).join("");
}
function composeHtml(m: Msg) {
  const member = !!m.sender.uid;
  const own = m.lane === "owner";
  const def = LINES[m.line]?.[4] || "fanmail";
  if (S.manual && S.manual.id === m.id) {
    return `<div class="hb-ib-compose"><div class="bt-composer hb-ib-manual"><p class="bt-notice bt-notice--warn">Email isn't switched on yet, so the site can't send this reply. Open it in your email app (it's filled in), send it from <b>${esc(S.manual.from)}@${DOMAIN}</b>, then mark it replied.</p>
      <div class="hb-ib-manual-acts"><a class="bt-btn bt-btn--primary bt-btn--sm" href="${esc(S.manual.mailto)}" data-mailto>${ic("mail")}Open in my email</a><button type="button" class="bt-btn bt-btn--secondary bt-btn--sm" data-manual-done>Mark as replied</button><button type="button" class="bt-btn bt-btn--ghost bt-btn--sm" data-manual-cancel>Back to the reply</button></div></div></div>`;
  }
  return `<div class="hb-ib-compose" data-mode="${S.ctab}">
    <div class="hb-ib-ctabs" role="tablist" aria-label="Reply or note"><button type="button" role="tab" aria-selected="${S.ctab === "reply"}" data-ctab="reply">${ic("reply")}Reply</button><button type="button" role="tab" aria-selected="${S.ctab === "note"}" data-ctab="note">${ic("note")}Internal note</button></div>
    <div class="bt-composer">
      <div class="hb-ib-from"><span>From <select class="bt-select" data-from aria-label="Reply from">${FROM.map((f) => `<option value="${f}"${f === def ? " selected" : ""}>${f}@${DOMAIN}</option>`).join("")}</select></span><span>To <b>${member ? `${esc(nameOf(m))} (alerts and email)` : esc(m.sender.email || "no address")}</b></span></div>
      <span class="hb-ib-note-hint">${own ? "Only you can see notes on Owner-only messages." : "Notes are only seen by the inbox team. They are never sent."}</span>
      <textarea class="bt-textarea" data-text rows="5" maxlength="5000" aria-label="${S.ctab === "reply" ? "Your reply" : "Your note"}" placeholder="${S.ctab === "reply" ? "Write your reply" : "Add a note for the team"}"></textarea>
      <span class="hb-ib-sig">Signed "the Boomertanger crew"</span>
      <div class="bt-composer-actions"><label class="hb-ib-check"><input type="checkbox" checked data-waiting>Then mark it Waiting</label><button type="button" class="bt-btn bt-btn--primary bt-btn--sm" data-send>${S.ctab === "reply" ? "Send reply" : "Save note"}</button></div>
    </div></div>`;
}
function detailHtml(m: Msg | null) {
  if (!m) return `<div class="hb-ib-detail"><div class="bt-empty bt-empty--compact">${mascot()}<span class="bt-empty-title">Pick a message</span><span>It opens here.</span></div></div>`;
  const own = m.lane === "owner", member = !!m.sender.uid;
  const earlier = S.msgs.filter((x) => x.id !== m.id && (m.sender.uid ? x.sender.uid === m.sender.uid : !!m.sender.email && x.sender.email === m.sender.email)).slice(0, 5);
  const assign = own ? "" : `<select class="bt-select" data-assign aria-label="Assigned to"><option value="">Unassigned</option>${S.staff.map((p) => `<option value="${esc(p.uid)}"${m.assignee === p.uid ? " selected" : ""}>@${esc(p.handle)}</option>`).join("")}${m.assignee && !S.staff.some((p) => p.uid === m.assignee) ? `<option value="${esc(m.assignee)}" selected>Former admin</option>` : ""}</select>`;
  const facts = factsHtml(m);
  return `<article class="hb-ib-detail" data-msg="${m.id}" aria-label="Message BT-${m.ref}">
    <div class="hb-ib-backrow"><button type="button" class="bt-btn bt-btn--ghost bt-btn--sm" data-close>${ic("back")}Back to the inbox</button></div>
    ${S.stamp ? `<span class="hb-ib-stampfx">${stampHtml({ kicker: "Hotline", label: "Replied", tone: "lime", size: "sm" })}</span>` : ""}
    <div class="hb-ib-d-head${m.status === "new" ? " is-new" : ""}${own ? " is-owner" : ""}">${key(m)}<div><h2 class="bt-heading">${esc(title(m))}</h2><div class="hb-ib-d-meta"><span class="hb-ib-ref">BT-${m.ref}</span><span>${esc(ago(m.createdAt, " ago"))}</span>${laneTag(m.lane)}${badge(m.status)}</div></div></div>
    ${m.namecheck && S.owner ? `<p class="bt-notice bt-notice--warn">${ic("flag")} <b>Moved to Owner only by the name check.</b> It mentions ${m.namecheck.handle ? `@${esc(m.namecheck.handle)}` : "someone on the crew"}${m.namecheck.grade != null ? `, ${/^A/.test(String(m.namecheck.grade)) ? "an" : "a"} ${esc(GRADE_NAMES[String(m.namecheck.grade)] || `grade ${m.namecheck.grade}`)} on the crew` : ""}, so the inbox team never saw it.</p>` : ""}
    ${m.escalatedBy && S.owner ? `<p class="bt-notice">Moved to Owner only by ${esc(handleOf(m.escalatedBy))}.</p>` : ""}
    ${m.onlyOwner ? `<p class="bt-notice">The sender ticked "Only Boomertanger should read this".</p>` : ""}
    <div class="hb-ib-actions"><button type="button" class="bt-btn bt-btn--primary bt-btn--sm" data-focus-reply>${ic("reply")}Reply</button><select class="bt-select" data-setstatus aria-label="Status">${(Object.keys(ST) as Status[]).map((s) => `<option value="${s}"${m.status === s ? " selected" : ""}>${ST[s][0]}</option>`).join("")}</select>${assign}<span class="hb-ib-sp"></span>${own ? "" : `<button type="button" class="bt-btn bt-btn--secondary bt-btn--sm" data-escalate>${ic("private")}Owner only</button>`}</div>
    <div class="hb-ib-sender"><span class="hb-ib-av hb-ib-av--lg${member ? "" : " hb-ib-av--visitor"}" aria-hidden="true">${esc(initialsOf(m))}</span><b>${esc(nameOf(m))}</b><span>${member ? (m.sender.handle ? `Member. <a href="/u/${encodeURIComponent(m.sender.handle)}">Profile</a>` : "Their account was deleted.") : `${esc(m.sender.email || "")} (visitor)`}</span></div>
    ${facts ? `<div class="hb-ib-facts">${facts}</div>` : ""}
    <div class="hb-ib-msg">${esc(m.body)}</div>
    <div class="hb-ib-facts"><div class="hb-ib-fact"><small>Found Boomertanger through</small><span>${esc(m.source ? SOURCE_LABELS[m.source] || m.source : "Didn't say")}</span></div><div class="hb-ib-fact"><small>Arrived through</small><span>${esc(m.via || "Direct")}</span></div></div>
    ${earlier.length ? `<div><h3 class="bt-label hb-ib-label">Earlier from ${esc(nameOf(m))}</h3><div class="hb-ib-earlier">${earlier.map((x) => `<button type="button" data-open="${x.id}" class="${x.status === "new" ? "is-new" : ""}${x.lane === "owner" ? " is-owner" : ""}">${key(x)}<b>${esc(snippet(x))}</b>${badge(x.status)}</button>`).join("")}</div></div>` : ""}
    <div><h3 class="bt-label hb-ib-label">History</h3>${historyHtml(m)}</div>
    ${composeHtml(m)}
  </article>`;
}
function inboxHtml() {
  if (!S.msgs.length) return heroHtml() + `<div class="bt-empty hb-ib-zero">${mascot()}<span class="bt-empty-title">Inbox zero</span><span>Every line is quiet. New messages light up the lamps above.</span></div>`;
  const L = list();
  let m = L.find((x) => x.id === S.sel) || null;
  if (!m && !narrow()) m = L[0] || null;
  S.sel = m?.id ?? null;
  if (m && !S.notes.has(m.id)) void loadNotes(m).then(() => { if (S.sel === m!.id) paintDetail(); });
  const rows = L.length ? L.map(rowHtml).join("") : `<div class="bt-empty bt-empty--compact">${mascot()}<span class="bt-empty-title">Nothing here</span><span>Try another filter.</span></div>`;
  return heroHtml() + toolsHtml() + `<div class="hb-ib-split"><div class="hb-ib-list">${rows}${S.msgs.length >= PAGE ? `<p class="bt-fine hb-ib-more">Showing the latest ${PAGE} per lane.</p>` : ""}</div>${L.length ? detailHtml(m) : ""}</div>`;
}

/* ---------- sources tab ---------- */
function sourcesHtml() {
  let total = 0, answeredQ = 0, replied = 0;
  const src: Record<string, number> = {}, via: Record<string, number> = {};
  if (S.period === "all") {
    if (!S.stats) { void loadStats().then(paint, () => { S.stats = { total: 0, answered: 0, source: {}, via: {} }; paint(); }); return `<div class="bt-skeleton hb-ib-sk-list" aria-hidden="true"></div>`; }
    total = S.stats.total; replied = S.stats.answered;
    Object.assign(src, S.stats.source);
    for (const [k, n] of Object.entries(S.stats.via as Record<string, number>)) via[k.replace(/_/g, ".")] = n;
    answeredQ = Object.values(src).reduce((a, b) => a + b, 0);
  } else {
    const since = Date.now() - Number(S.period) * 864e5;
    const ms0 = S.msgs.filter((m) => m.createdAt >= since);
    total = ms0.length; replied = ms0.filter((m) => m.firstReplyAt).length;
    for (const m of ms0) { if (m.source) { src[m.source] = (src[m.source] || 0) + 1; answeredQ++; } if (m.via) via[m.via] = (via[m.via] || 0) + 1; }
  }
  const S1 = Object.entries(src).sort((a, b) => b[1] - a[1]);
  const V1 = Object.entries(via).sort((a, b) => b[1] - a[1]).slice(0, 10);
  const viaTotal = Object.values(via).reduce((a, b) => a + b, 0);
  const pct = (n: number, of: number) => (of ? Math.round((n / of) * 100) : 0);
  const top = S1[0] ? SOURCE_LABELS[S1[0][0]] || S1[0][0] : "n/a";
  const per = S.period === "all" ? "all time" : `last ${S.period} days`;
  const bars = S1.length ? `<div class="hb-ib-bars">${S1.map(([k, n], i) => `<div class="hb-ib-bar"><span>${esc(SOURCE_LABELS[k] || k)}</span><span class="hb-ib-bar-t" aria-hidden="true"><i style="width:${pct(n, S1[0][1])}%;animation-delay:${i * 60}ms"></i></span><span class="hb-ib-bar-v"><b>${pct(n, answeredQ)}%</b></span></div>`).join("")}</div>` : `<p class="bt-section-text">Nobody has answered the question yet in this period.</p>`;
  const vias = V1.length ? `<div class="hb-ib-via">${V1.map(([k, n]) => `<div class="hb-ib-via-row"><b>${esc(k)}</b><span>${pct(n, viaTotal)}%</span></div>`).join("")}</div>` : `<p class="bt-section-text">No landing links recorded in this period.</p>`;
  return `<section class="hb-ib-hero hb-ib-hero--plain"><div><h1 class="bt-title">Sources</h1><p class="hb-ib-sub">How people found Boomertanger, from the optional question and the link they arrived through.</p>
    ${readoutsHtml([{ value: total, label: `Messages, ${per}` }, { value: `${pct(answeredQ, total)}%`, label: "Answered the question" }, { value: top, label: "Top source" }, { value: replied, label: "Replied to" }], { cols: 4 })}</div></section>
    <div class="hb-ib-tools"><div class="bt-sortbar" role="group" aria-label="Period">${([["30", "30 days"], ["90", "90 days"], ["all", "All time"]] as const).map(([k, l]) => `<button type="button" class="bt-chip bt-chip--small${S.period === k ? " is-active" : ""}" aria-pressed="${S.period === k}" data-period="${k}">${l}</button>`).join("")}</div></div>
    <div class="hb-ib-src">
      <section class="hb-ib-panel">${sectionHeadHtml({ icon: ic("chart"), title: "How they found Boomertanger", sub: "Percent of people who answered", small: true, level: 2 } as any)}${bars}<p class="hb-ib-src-foot">${S.owner ? "Counts every line." : "Counts the team lines only."} Members answer once; visitors once per browser.</p></section>
      <section class="hb-ib-panel">${sectionHeadHtml({ icon: ic("link"), title: "Arrived through", sub: "The domain or ?via= link", small: true, level: 2 } as any)}${vias}<p class="hb-ib-src-foot">Other domains that redirect here with ?via= set show up on their own.</p></section>
    </div>`;
}

/* ---------- settings tab (owner) ---------- */
function settingsHtml() {
  const d = (S.draft ??= JSON.parse(JSON.stringify(S.main)) as Main);
  const tg = (on: boolean, label: string, k: string) => `<button type="button" class="hb-ib-toggle" role="switch" aria-checked="${on}" aria-label="${esc(label)}" data-toggle="${k}"></button>`;
  const chip = (on: boolean, label: string, attr: string) => `<button type="button" class="bt-chip bt-chip--small${on ? " is-active" : ""}" aria-pressed="${on}" ${attr}>${esc(label)}</button>`;
  return `<section class="hb-ib-hero hb-ib-hero--plain"><div><h1 class="bt-title">Settings</h1><p class="hb-ib-sub">Only you see this tab.</p></div></section>
  <div class="hb-ib-set"><div class="bt-admin-panel"><span class="bt-admin-tag"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2l8 3v6c0 5-3.4 9.4-8 11-4.6-1.6-8-6-8-11V5z"/></svg>Owner only</span>
    <div class="hb-ib-set-row"><b>Who helps with the inbox</b><span>They see the team lines (Say hi, Feedback, Account help). Never the gold ones.</span><div class="hb-ib-grades" role="group" aria-label="Admin grades with the inbox">${["A1", "A2", "A3"].map((g) => chip(d.inboxGrades.includes(g), GRADE_NAMES[g], `data-grade="${g}"`)).join("")}</div></div>
    <div class="hb-ib-set-row"><b>Reply-time promise</b><span>Shown on the contact page and the Sent screen ("Replies in about …").</span><input class="bt-input" data-replytime maxlength="40" value="${esc(d.replyTime)}" aria-label="Reply-time promise"></div>
    <div class="hb-ib-set-row"><b>Name check</b><span>Moves any team-line message that mentions a crew handle or display name to Owner only.</span>${tg(d.nameCheck, "Name check", "nameCheck")}</div>
    <div class="hb-ib-set-row"><b>Email me Business messages</b><span>A copy to your own address as they arrive (once email is switched on).</span>${tg(d.emailOwner.business, "Email Business", "business")}</div>
    <div class="hb-ib-set-row"><b>Email me Private matters</b><span>A copy to your own address as they arrive (once email is switched on).</span>${tg(d.emailOwner.private, "Email Private", "private")}</div>
    <div class="hb-ib-set-row"><b>Lines on the contact page</b><span>Switch a line off to hide it (for example during a break).</span><div class="hb-ib-grades" role="group" aria-label="Lines on the contact page">${LINE_IDS.map((l) => chip(d.lines[l] !== false, `${LINES[l][0]} ${LINES[l][2]}`, `data-sline="${l}"`)).join("")}</div></div>
    <div class="hb-ib-set-acts"><button type="button" class="bt-btn bt-btn--ghost" data-set-reset>Undo changes</button><button type="button" class="bt-btn bt-btn--admin" data-set-save>Save settings</button></div>
  </div></div>`;
}

/* ---------- paint ---------- */
function paintTabs() {
  if (!tabsNav) return;
  tabsNav.querySelector<HTMLElement>('[data-tab="settings"]')!.hidden = !S.owner;
  tabsNav.querySelectorAll<HTMLAnchorElement>("[data-tab]").forEach((a) => { if (a.dataset.tab === S.tab) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current"); });
  (tabsNav as any)._segNav?.place?.(tabsNav.querySelector('[aria-current="page"]'));
}
function paint() {
  if (!root) return;
  if (S.tab === "settings" && !S.owner) S.tab = "inbox";
  if (S.reading && S.tab === "inbox" && narrow()) root.dataset.reading = ""; else delete root.dataset.reading;
  paintTabs();
  const active = document.activeElement as HTMLElement | null;
  const focusQ = active?.matches?.("[data-q]") ? (active as HTMLInputElement).selectionStart : null;
  root.innerHTML = S.error ? `<div class="bt-empty">${mascot()}<span class="bt-empty-title">Couldn't load the inbox</span><span>${esc(S.error)}</span><button type="button" class="bt-btn bt-btn--secondary" data-retry>Try again</button></div>`
    : S.tab === "sources" ? sourcesHtml() : S.tab === "settings" ? settingsHtml() : inboxHtml();
  if (focusQ != null) { const q = root.querySelector<HTMLInputElement>("[data-q]"); q?.focus(); q?.setSelectionRange(focusQ, focusQ); }
  S.stamp = false;
}
/** Redraw only the detail (notes arrived), keeping a draft. */
function paintDetail() {
  const box = root?.querySelector<HTMLElement>(".hb-ib-detail");
  const m = S.msgs.find((x) => x.id === S.sel);
  if (!box || !m) return;
  const text = box.querySelector<HTMLTextAreaElement>("[data-text]")?.value ?? "";
  const from = box.querySelector<HTMLSelectElement>("[data-from]")?.value;
  const t = document.createElement("div"); t.innerHTML = detailHtml(m);
  box.replaceWith(t.firstElementChild!);
  const nb = root!.querySelector<HTMLElement>(".hb-ib-detail")!;
  const ta = nb.querySelector<HTMLTextAreaElement>("[data-text]"); if (ta) ta.value = text;
  const fs = nb.querySelector<HTMLSelectElement>("[data-from]"); if (fs && from) fs.value = from;
}
function setTab(t: typeof S.tab, push = true) {
  S.tab = t; S.reading = false;
  if (push) { const u = new URL(location.href); if (t === "inbox") u.searchParams.delete("tab"); else u.searchParams.set("tab", t); u.searchParams.delete("id"); history.replaceState(null, "", u); }
  paint();
}
function open(id: string) {
  const m = S.msgs.find((x) => x.id === id);
  if (!m) return;
  S.sel = id; S.reading = true; S.manual = null;
  paint();
  if (narrow()) window.scrollTo({ top: 0 });   // the message opens full screen (the hero and list are hidden), right under the bar
  else root?.querySelector<HTMLElement>(".hb-ib-detail")?.scrollIntoView({ block: "nearest" });
}

/* ---------- actions ---------- */
/** The callables, or in preview a stand-in that changes the sample data in the page (email is "off", as on staging today). */
async function rpc<T = any>(name: string, data: any): Promise<T> {
  if (!P) return call<T>(name, data);
  await new Promise((r) => setTimeout(r, 250));
  const m = S.msgs.find((x) => x.id === data.id);
  const add = (n: Partial<Note>) => { const list = previewNotes.get(data.id) || []; list.push({ id: String(Math.random()), by: S.uid, text: "", at: Date.now(), kind: "event", ...n } as Note); previewNotes.set(data.id, list); };
  if (name === "contactAction" && m) {
    if (data.action === "status" || data.action === "spam") { m.status = data.value; add({ event: "status", value: data.value, text: `status ${data.value}` }); }
    if (data.action === "assign") { m.assignee = data.value; add({ event: "assign", value: data.value, text: data.value ? "assigned" : "unassigned" }); }
    if (data.action === "escalate") { m.lane = "owner"; m.assignee = null; m.escalatedBy = S.uid; add({ event: "escalate", text: "escalated to owner only" }); if (!S.owner) S.msgs = S.msgs.filter((x) => x.id !== m.id); }
  }
  if (name === "contactNote") add({ kind: "note", text: data.text });
  if (name === "contactReply" && m) {
    if (!data.manual) return { sent: false, reason: "email-off", to: m.sender.email || "member@example.com", mailto: `mailto:${encodeURIComponent(m.sender.email || "")}?subject=${encodeURIComponent(`Re: ${title(m)} (BT-${m.ref})`)}&body=${encodeURIComponent(data.text)}` } as T;
    add({ kind: "reply", from: `${data.from}@${DOMAIN}`, text: data.text, manual: true });
    m.status = data.markWaiting ? "waiting" : "open"; m.firstReplyAt ??= Date.now();
    return { sent: true, manual: true } as T;
  }
  if (name === "contactSettings") { const { lines, emailOwner, ...rest } = data; return { settings: { ...S.main, ...rest, lines: { ...S.main.lines, ...lines }, emailOwner: { ...S.main.emailOwner, ...emailOwner } } } as T; }
  return { ok: true } as T;
}
async function refresh(keepSel = true) {
  const sel = S.sel;
  await loadMessages();
  if (keepSel && sel && !S.msgs.some((m) => m.id === sel)) { S.sel = null; S.reading = false; }
  if (sel) { const m = S.msgs.find((x) => x.id === sel); if (m) { S.notes.delete(m.id); await loadNotes(m).catch(() => {}); } }
  paint();
}
async function act(m: Msg, body: Record<string, unknown>, ok: string) {
  if (S.busy) return;
  S.busy = true;
  try { await rpc("contactAction", { lane: m.lane, id: m.id, ...body }); toast(ok); await refresh(); }
  catch (err) { toast(messageFor(err, "That didn't save. Try again."), { kind: "error" }); paint(); }
  finally { S.busy = false; }
}
async function sendCompose(m: Msg, box: HTMLElement) {
  const text = box.querySelector<HTMLTextAreaElement>("[data-text]")!.value.trim();
  if (!text) { box.querySelector<HTMLTextAreaElement>("[data-text]")!.focus(); toast(S.ctab === "reply" ? "Write the reply first." : "Write the note first.", { kind: "info" }); return; }
  const btn = box.querySelector<HTMLButtonElement>("[data-send]")!;
  btn.disabled = true; btn.textContent = S.ctab === "reply" ? "Sending…" : "Saving…";
  try {
    if (S.ctab === "note") {
      await rpc("contactNote", { lane: m.lane, id: m.id, text });
      toast("Note saved");
      await refresh();
      return;
    }
    const from = box.querySelector<HTMLSelectElement>("[data-from]")!.value, markWaiting = !!box.querySelector<HTMLInputElement>("[data-waiting]")?.checked;
    const r = await rpc<{ sent: boolean; reason?: string; mailto?: string; to?: string | null; manual?: boolean }>("contactReply", { lane: m.lane, id: m.id, text, from, markWaiting });
    if (!r.sent && r.reason === "email-off") {
      S.manual = { id: m.id, mailto: r.mailto || "", to: r.to ?? null, text, from, markWaiting };
      paintDetail();
      return;
    }
    S.stamp = true;
    toast("Reply sent");
    await refresh();
  } catch (err) {
    toast(messageFor(err, "That didn't send. Your text is still there: try again."), { kind: "error" });
    btn.disabled = false; btn.textContent = S.ctab === "reply" ? "Send reply" : "Save note";
  }
}
async function markReplied(m: Msg) {
  const x = S.manual; if (!x) return;
  try {
    await rpc("contactReply", { lane: m.lane, id: m.id, text: x.text, from: x.from, markWaiting: x.markWaiting, manual: true });
    S.manual = null; S.stamp = true;
    toast("Marked as replied");
    await refresh();
  } catch (err) { toast(messageFor(err, "That didn't save. Try again."), { kind: "error" }); }
}
async function saveSettings() {
  const d = S.draft; if (!d || S.busy) return;
  const rt = root?.querySelector<HTMLInputElement>("[data-replytime]")?.value.trim() ?? d.replyTime;
  if (!rt) { toast("Write the reply-time promise.", { kind: "info" }); return; }
  S.busy = true;
  try {
    const r = await rpc<{ settings: Main }>("contactSettings", { inboxGrades: d.inboxGrades, replyTime: rt, nameCheck: d.nameCheck, emailOwner: d.emailOwner, lines: Object.fromEntries(LINE_IDS.map((l) => [l, d.lines[l] !== false])) });
    S.main = { ...DEFAULT_MAIN, ...r.settings }; S.draft = null;
    toast("Settings saved");
    void loadStaff();
    paint();
  } catch (err) { toast(messageFor(err, "That didn't save. Try again."), { kind: "error" }); }
  finally { S.busy = false; }
}

/* ---------- events ---------- */
function wire() {
  if (!root) return;
  tabsNav?.addEventListener("click", (e) => {
    const a = (e.target as Element).closest<HTMLAnchorElement>("[data-tab]");
    if (!a || e.metaKey || e.ctrlKey) return;
    e.preventDefault(); setTab(a.dataset.tab as typeof S.tab);
  });
  root.addEventListener("click", (e) => {
    const t = e.target as Element;
    const m = S.msgs.find((x) => x.id === S.sel) || null;
    const lamp = t.closest<HTMLElement>("[data-lamp]"); if (lamp) { S.line = S.line === lamp.dataset.lamp ? null : lamp.dataset.lamp!; paint(); return; }
    const st = t.closest<HTMLElement>("[data-status]"); if (st) { S.status = st.dataset.status as typeof S.status; paint(); return; }
    const op = t.closest<HTMLElement>("[data-open]"); if (op) { open(op.dataset.open!); return; }
    if (t.closest("[data-close]")) { S.reading = false; paint(); root.querySelector<HTMLElement>(`[data-open="${S.sel}"]`)?.scrollIntoView({ block: "center" }); return; }
    if (t.closest("[data-retry]")) { S.error = ""; void start(); return; }
    const pr = t.closest<HTMLElement>("[data-period]"); if (pr) { S.period = pr.dataset.period as typeof S.period; paint(); return; }
    const ct = t.closest<HTMLElement>("[data-ctab]"); if (ct && m) { const text = root.querySelector<HTMLTextAreaElement>("[data-text]")?.value ?? ""; S.ctab = ct.dataset.ctab as typeof S.ctab; paintDetail(); const ta = root.querySelector<HTMLTextAreaElement>("[data-text]"); if (ta) { ta.value = text; ta.focus(); } return; }
    if (t.closest("[data-focus-reply]")) { if (S.ctab !== "reply") { S.ctab = "reply"; paintDetail(); } const ta = root.querySelector<HTMLTextAreaElement>("[data-text]"); ta?.scrollIntoView({ behavior: reduced() ? "auto" : "smooth", block: "center" }); ta?.focus({ preventScroll: true }); return; }
    if (t.closest("[data-send]") && m) { void sendCompose(m, t.closest<HTMLElement>(".hb-ib-compose")!); return; }
    if (t.closest("[data-manual-done]") && m) { void markReplied(m); return; }
    if (t.closest("[data-manual-cancel]")) { S.manual = null; paintDetail(); return; }
    if (t.closest("[data-escalate]") && m) {
      void confirmAction({
        title: "Make it Owner only?", message: "Only Boomertanger will see this message and its notes. It leaves the team inbox at once, and it can't be moved back.",
        confirmLabel: "Owner only", busyLabel: "Moving…", danger: false, feature: "hotline",
        onConfirm: async () => { await rpc("contactAction", { lane: m.lane, id: m.id, action: "escalate" }); },
      }).then(async (yes: boolean) => {
        if (!yes) return;
        toast("Moved to Owner only");
        if (!S.owner) { S.sel = null; S.reading = false; }
        await refresh(false).catch(() => {});
        if (S.owner) { const moved = S.msgs.find((x) => x.id === m.id); if (moved) open(moved.id); }
      });
      return;
    }
    // settings
    const d = S.draft;
    if (d) {
      const g = t.closest<HTMLElement>("[data-grade]"); if (g) { const k = g.dataset.grade!; d.inboxGrades = d.inboxGrades.includes(k) ? d.inboxGrades.filter((x) => x !== k) : [...d.inboxGrades, k].sort(); keepReply(); return; }
      const sl = t.closest<HTMLElement>("[data-sline]"); if (sl) { const k = sl.dataset.sline!; d.lines = { ...d.lines, [k]: d.lines[k] === false }; keepReply(); return; }
      const tg = t.closest<HTMLElement>("[data-toggle]"); if (tg) { const k = tg.dataset.toggle!; if (k === "nameCheck") d.nameCheck = !d.nameCheck; else d.emailOwner = { ...d.emailOwner, [k]: !d.emailOwner[k as "business" | "private"] }; keepReply(); return; }
      if (t.closest("[data-set-reset]")) { S.draft = null; paint(); return; }
      if (t.closest("[data-set-save]")) { void saveSettings(); return; }
    }
  });
  /** Settings redraws keep the reply-time text being typed. */
  function keepReply() { const v = root!.querySelector<HTMLInputElement>("[data-replytime]")?.value; paint(); const i = root!.querySelector<HTMLInputElement>("[data-replytime]"); if (i && v != null) i.value = v; }
  root.addEventListener("change", (e) => {
    const t = e.target as HTMLElement;
    const m = S.msgs.find((x) => x.id === S.sel);
    if (!m) return;
    if (t.matches("[data-setstatus]")) { const v = (t as HTMLSelectElement).value; void act(m, { action: v === "spam" ? "spam" : "status", value: v }, `Marked ${ST[v as Status][0]}`); }
    if (t.matches("[data-assign]")) { const v = (t as HTMLSelectElement).value || null; void act(m, { action: "assign", value: v }, v ? `Assigned to ${handleOf(v)}` : "Unassigned"); }
  });
  root.addEventListener("input", (e) => { const t = e.target as HTMLInputElement; if (t.matches("[data-q]")) { S.q = t.value; paint(); } });
  document.addEventListener("keydown", (e) => {
    if (e.key !== "/" || S.tab !== "inbox" || (e.target as Element).closest?.("input, textarea, select, [contenteditable], .bt-modal")) return;
    const q = root.querySelector<HTMLInputElement>("[data-q]"); if (!q) return;
    e.preventDefault(); q.focus();
  });
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && S.loaded && S.tab === "inbox" && !root.querySelector("[data-text]")?.matches(":focus")) void refresh().catch(() => {}); });
}

/* ---------- access and start ---------- */
const setAccess = (a: "loading" | "join" | "denied" | "page") => { if (host) host.dataset.hbAccess = a; };
async function start() {
  try {
    await loadMessages();
    await names(S.msgs.map((m) => m.assignee));
    void loadStaff();
    const want = qs().get("id");
    if (want && S.msgs.some((m) => m.id === want)) { S.sel = want; S.reading = true; }
    const t = qs().get("tab");
    S.tab = t === "sources" || (t === "settings" && S.owner) ? t : "inbox";
    S.error = "";
  } catch (err) { S.error = messageFor(err, "Check your connection and try again."); }
  paint();
}
let started = false;
onAuth(async (s: AuthState) => {
  if (s.status === "loading") return;
  if (!s.user && !isProduction && qs().get("as") === "admin") {
    if (started) return;
    started = true;
    P = (await import("../../data/preview-hotline-inbox.json")).default as PreviewData;
    S.ownerUid = P.ownerUid; S.owner = qs().get("owner") !== "0"; S.uid = S.owner ? P.ownerUid : "p-vexa"; S.inbox = true;
    setAccess("page"); wire(); await start();
    return;
  }
  if (!s.user || s.status === "needsSignup") { setAccess("join"); return; }
  if (started) return;
  started = true;
  try {
    const [site, mainSnap, tok] = await Promise.all([getDoc(doc(db, "sites", SITE_ID)), getDoc(doc(db, ...base())), auth.currentUser!.getIdTokenResult()]);
    S.uid = s.user.uid; S.ownerUid = String(site.get("ownerUid") || "");
    S.owner = !!S.ownerUid && S.ownerUid === S.uid;
    const m = mainSnap.exists() ? (mainSnap.data() as Partial<Main>) : {};
    S.main = { ...DEFAULT_MAIN, ...m, emailOwner: { ...DEFAULT_MAIN.emailOwner, ...(m.emailOwner || {}) }, lines: { ...(m.lines || {}) }, inboxGrades: Array.isArray(m.inboxGrades) ? m.inboxGrades : DEFAULT_MAIN.inboxGrades };
    const grade = tok.claims.crewGrade;
    S.inbox = S.owner || (typeof grade === "string" && S.main.inboxGrades.includes(grade));
  } catch { S.inbox = false; }
  if (!S.inbox) { setAccess("denied"); started = false; return; }
  setAccess("page");
  wire();
  await start();
});
