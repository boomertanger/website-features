// /admin/crew (docs/specs/mod-machina.md §3, §7, §12): the roster, coverage map, promotions, queue decisions,
// strikes, platform to-do list and settings. Display only: owner-only controls are hidden for everyone else and
// the callables check on the server (crewPromote, crewSetStatus, crewStrike, crewExcuse, crewDecide, crewWaive,
// crewSaveSettings, crewTodoDone). Preview (non-production, signed out, ?as=admin) reads
// src/data/preview-crew-admin.json and actions only toast "Preview: nothing saved".
import { onAccess, previewAs } from "./layout";
import { crewCall, crewMe, CHATS, CHAT_NAME, type Chat } from "./api";
import { messageFor, reasonOf } from "../../lib/errors";
import { uidForHandle } from "../trophies/data";
import { openModal, modalHeader } from "../../../../shared/ui/modal.js";
import { confirmAction } from "../../../../shared/ui/confirm.js";
import { toast } from "../../../../shared/ui/toast.js";
import { escapeHtml as esc } from "../../../../shared/ui/dom.js";
import { gradeChipHtml } from "../../../../shared/ui/grade-chip.js";
import { platformIconHtml, roomHtml } from "../../../../shared/ui/crew.js";

type Track = "mod" | "admin";
type Pref = "favourite" | "happy" | "ifNeeded" | "no";
interface Row { uid: string; handle: string | null; track: Track; grade: number; name: string; status: string; since: number | null; platforms: Partial<Record<Chat, Pref>>; device: string | null; ready: { to: number; since: number } | null; activeStrikes: number; ownerReview: boolean }
interface Settings { gearsValues: Record<string, number>; youtubeBoost: number; activityRules: boolean; checkinFallback: boolean; recruitCapPerMonth: number; vouchCap: number; appExpiryDays: number; reapplyDays: number; twitchSync: boolean }
interface App { appId: string; uid: string; handle: string | null; createdAt: number; expiresAt: number | null; band: string | null; rank: number | null; score: number; prefs: Partial<Record<Chat, Pref>>; availability: { days: string[]; note: string }; device: string; answers: { why?: string; experience?: string }; vouches: { uid: string; handle: string | null; grade: number }[]; concerns?: { byHandle: string | null; note: string }[] }
interface Todo { id: string; platform: string; action: "add" | "remove"; uid: string; text: string; why: string | null; status: "open" | "done"; createdAt: number | null }

const SITE = "boomertanger";
const $ = <T extends HTMLElement = HTMLElement>(sel: string, from: ParentNode = document) => from.querySelector<T>(sel)!;
const root = $("[data-ca]");

// ---- labels, tones, small helpers ----
const STATUS: Record<string, { label: string; tone: string; note: string }> = {
  active: { label: "Active", tone: "lime", note: "Full perks." },
  checkIn: { label: "Check-in", tone: "gold", note: "Missed a month. Perks stay." },
  goingDark: { label: "Going dark", tone: "blue", note: "A planned break." },
  reserve: { label: "Reserve", tone: "gray", note: "Keeps grade and badges, loses perks." },
  alumni: { label: "Alumni", tone: "teal", note: "Platform mod powers removed." },
  paused: { label: "Paused", tone: "pink", note: "Paused after a conduct issue." },
};
const MOD_NAMES = ["", "Initiate", "Watcher", "Warden", "Sentinel"];
const ADMIN_NAMES = ["", "Steward", "Overseer", "Right Hand"];
const gradeName = (track: Track, g: number) => (track === "admin" ? ADMIN_NAMES : MOD_NAMES)[g] || "";
const PREF_LABEL: Record<Pref, string> = { favourite: "Favourite", happy: "Happy to help", ifNeeded: "If needed", no: "No" };
const PREF_TONE: Record<Pref, string> = { favourite: "lime", happy: "blue", ifNeeded: "gray", no: "gray" };
const GEARS_LABEL: Record<string, string> = {
  dutyCaptainPerHour: "Stream Captain duty (per hour)", dutyRoomLeadPerHour: "Room Lead duty (per hour)", dutyDeckhandPerHour: "Deckhand duty (per hour)",
  showedUp: "Showed up for a scheduled duty", tookOver: "Took over as lead mid-stream", hostedGame: "Hosted a Chat Game (each)", earlySignup: "Early sign-up for a seat",
  recruitActivated: "Recruit activated", recruitFirstCheckin: "Recruit's first stream check-in", queueReview: "Queue review: vouch or note",
  queueReviewMonthlyCap: "Queue review cap (Gears a month)", academyModule: "Academy module passed", triage: "Bug Zapper triage or Feature Lab review",
  dutyHoursCapPerStream: "Hours of duty that earn Gears (per stream)",
};
const PLATFORM_NAME: Record<string, string> = { twitch: "Twitch", youtube: "YouTube", tiktok: "TikTok" };
const DAY_NAME: Record<string, string> = { mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun" };
const fmtDate = (ms: number | null | undefined) => (ms ? new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "");
const who = (r: { handle: string | null }) => (r.handle ? `@${r.handle}` : "Unknown member");
const plural = (n: number, one: string, many = one + "s") => `${n} ${n === 1 ? one : many}`;
const badge = (tone: string, text: string, extra = "") => `<span class="bt-badge bt-badge--${tone}${extra}">${esc(text)}</span>`;
const monthKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
const WILLING: Pref[] = ["favourite", "happy"];

// ---- state ----
const preview = previewAs() === "admin";
let me = { isOwner: false, track: null as Track | null, grade: 0 };
let rows: Row[] = [];
let settings: Settings;
let openApps = 0;
let queue: App[] = [];
let queueError = "";
let todos: Todo[] = [];
let todosError = "";
let filter = "all";

// ---- what the viewer may do (display only; the server decides) ----
const isRightHand = () => me.track === "admin" && me.grade === 3;
const isA2 = () => me.isOwner || (me.track === "admin" && me.grade >= 2);
function nextStep(r: Row): { label: string; body: { uid: string; track?: string; grade?: number }; allowed: boolean; why: string } | null {
  if (r.status === "paused" || r.status === "alumni") return null;
  if (r.track === "mod") {
    if (r.grade >= 1 && r.grade <= 3) {
      const to = r.grade + 1;
      const allowed = me.isOwner || (isRightHand() && to <= 3);
      return { label: `Promote to ${gradeName("mod", to)}`, body: { uid: r.uid }, allowed, why: allowed ? "" : "Only the owner, or a Right Hand up to Warden, can promote." };
    }
    return { label: "Invite to admin ladder", body: { uid: r.uid, track: "admin", grade: 1 }, allowed: me.isOwner, why: me.isOwner ? "" : "Only the owner invites admins." };
  }
  if (r.grade >= 1 && r.grade < 3) return { label: `Promote to ${gradeName("admin", r.grade + 1)}`, body: { uid: r.uid, track: "admin", grade: r.grade + 1 }, allowed: me.isOwner, why: me.isOwner ? "" : "Only the owner moves admins up." };
  return null;
}

// ---- calls (preview: nothing is saved) ----
async function act<T = any>(name: string, data: unknown): Promise<T | null> {
  if (preview) { toast("Preview: nothing saved", { kind: "info" }); return null; }
  return crewCall<T>(name, data);
}

// ---- loading ----
async function loadAll() {
  if (preview) {
    const d = (await import("../../data/preview-crew-admin.json")).default as any;
    rows = d.overview.roster; settings = d.overview.settings; openApps = d.overview.openApplications;
    queue = d.queue; todos = d.todos;
    me = { isOwner: new URLSearchParams(location.search).get("owner") !== "0", track: "admin", grade: 2 };
    return;
  }
  const { db, doc, getDoc, getDocs, collection } = await import("../../lib/db");
  const { auth } = await import("../../lib/firebase");
  const uid = auth.currentUser?.uid;
  const [ov, site, mine] = await Promise.all([
    crewCall<{ roster: Row[]; openApplications: number; settings: Settings }>("crewAdminOverview"),
    getDoc(doc(db, "sites", SITE)),
    crewMe().catch(() => null),
  ]);
  rows = ov.roster; settings = ov.settings; openApps = ov.openApplications;
  me = { isOwner: !!uid && site.get("ownerUid") === uid, track: mine?.crew?.track ?? null, grade: mine?.crew?.grade ?? 0 };
  // The queue and the to-do list load on their own: a failure in one shouldn't hide the rest.
  const [q, t] = await Promise.allSettled([
    crewCall<{ queue: App[] }>("crewQueue"),
    getDocs(collection(db, "sites", SITE, "crew", "main", "todos")),
  ]);
  if (q.status === "fulfilled") { queue = q.value.queue; queueError = ""; } else { queue = []; queueError = messageFor(q.reason, "Couldn't load the queue."); }
  if (t.status === "fulfilled") {
    todos = t.value.docs.map((d: any) => ({ id: d.id, platform: d.get("platform"), action: d.get("action"), uid: d.get("uid"), text: d.get("text") || "", why: d.get("why") || null, status: d.get("status") === "done" ? "done" : "open", createdAt: d.get("createdAt")?.toMillis?.() ?? null }));
    todosError = "";
  } else { todos = []; todosError = messageFor(t.reason, "Couldn't load the to-do list."); }
}

// ---- rendering ----
const platsHtml = (p: Partial<Record<Chat, Pref>>) =>
  `<span class="bt-crew-plats">${CHATS.filter((c) => p[c]).map((c) => `<span class="bt-crew-plat${p[c] === "favourite" ? " is-fav" : ""}${p[c] === "no" ? " is-no" : ""}">${platformIconHtml(c)}<span class="bt-sr-only">${esc(CHAT_NAME[c])}: ${esc(PREF_LABEL[p[c] as Pref] || "")}</span></span>`).join("")}</span>`;

const needsAttention = (r: Row) => r.status === "checkIn" || r.status === "reserve" || r.status === "paused" || r.activeStrikes > 0 || r.ownerReview;

function rosterRowHtml(r: Row) {
  const st = STATUS[r.status] || { label: r.status, tone: "gray", note: "" };
  const strikes = r.activeStrikes ? badge(r.activeStrikes >= 3 ? "pink" : r.activeStrikes === 2 ? "gold" : "gray", plural(r.activeStrikes, "strike")) : `<span class="ca-none">No strikes</span>`;
  const flags = [r.ownerReview ? badge("pink", "Owner review") : "", r.ready ? badge("admin", "Ready to promote") : ""].join("");
  const acts: string[] = [];
  const canStatus = me.isOwner || (isA2() && r.track !== "admin");
  if (canStatus) acts.push(`<button type="button" class="bt-btn bt-btn--secondary bt-btn--sm" data-act="status" data-uid="${esc(r.uid)}">Set status</button>`);
  if (isA2()) acts.push(`<button type="button" class="bt-btn bt-btn--secondary bt-btn--sm" data-act="strike" data-uid="${esc(r.uid)}">Strike</button>`);
  if (me.isOwner) acts.push(`<button type="button" class="bt-btn bt-btn--secondary bt-btn--sm" data-act="excuse" data-uid="${esc(r.uid)}">Excuse a month</button>`);
  const step = nextStep(r);
  if (step?.allowed && (r.ready || r.track === "admin" || r.grade === 4)) acts.push(`<button type="button" class="bt-btn bt-btn--admin bt-btn--sm" data-act="promote" data-uid="${esc(r.uid)}">${esc(step.label)}</button>`);
  return `<div class="ca-row" role="listitem" data-uid="${esc(r.uid)}">
    <div class="ca-who"><b>${esc(who(r))}</b>${gradeChipHtml({ track: r.track, grade: r.grade } as any)}</div>
    <div class="ca-st"><span class="bt-badge bt-badge--${st.tone}" title="${esc(st.note)}">${esc(st.label)}</span></div>
    <div class="ca-since"><span class="ca-lab">Since</span>${esc(fmtDate(r.since) || "Unknown")}</div>
    <div class="ca-flags">${strikes}${flags}</div>
    <div class="ca-plats">${platsHtml(r.platforms || {})}</div>
    <div class="ca-acts">${acts.join("") || `<span class="ca-none">Read only</span>`}</div>
  </div>`;
}

function renderRoster() {
  const list = rows.filter((r) => filter === "all" ? true : filter === "attention" ? needsAttention(r) : r.track === filter);
  $("[data-ca-roster]").innerHTML = list.length ? list.map(rosterRowHtml).join("") : `<div class="bt-empty"><div class="bt-empty-title">${rows.length ? "No one matches" : "No crew yet"}</div><p>${rows.length ? "Try a different filter." : "Approved applicants show up here."}</p></div>`;
  const parts = [`${plural(rows.length, "person", "people")} on the roster.`];
  if (!me.isOwner) parts.push("Excusing a month, deciding applications and the settings are the owner's.");
  if (!isA2()) parts.push("Setting status and strikes need an Overseer or above.");
  $("[data-ca-roster-note]").textContent = parts.join(" ");
}

function renderCoverage() {
  const crew = rows.filter((r) => r.status === "active" || r.status === "checkIn");
  const max = Math.max(1, crew.length);
  $("[data-ca-coverage]").innerHTML = CHATS.map((c) => {
    const n = (p: Pref) => crew.filter((r) => r.platforms?.[c] === p).length;
    const fav = n("favourite"), happy = n("happy"), need = n("ifNeeded");
    const willing = fav + happy;
    const yt = c === "ytLandscape" || c === "ytVertical";
    const gap = willing < (yt ? 3 : 2);
    const state = gap ? "needed" : "covered";
    const text = gap ? (yt ? "most needed" : "needs help") : "enough crew";
    const seg = (cls: string, v: number, lab: string) => v ? `<i class="ca-seg ${cls}" style="--w:${(v / max) * 100}%" title="${esc(`${lab}: ${v}`)}"></i>` : "";
    return `<article class="bt-tile ca-cov-tile" data-state="${state}">
      <div class="ca-cov-top">${roomHtml({ chat: c, name: CHAT_NAME[c], state, text } as any)}</div>
      <p class="ca-cov-n"><b>${willing}</b> <span>${willing === 1 ? "person is" : "people are"} willing</span></p>
      <div class="ca-bar" role="img" aria-label="${esc(`${CHAT_NAME[c]}: ${fav} favourite, ${happy} happy to help, ${need} if needed`)}">${seg("is-fav", fav, "Favourite")}${seg("is-happy", happy, "Happy to help")}${seg("is-need", need, "If needed")}</div>
      <ul class="ca-cov-key"><li><i class="ca-dot is-fav"></i>Favourite <b>${fav}</b></li><li><i class="ca-dot is-happy"></i>Happy <b>${happy}</b></li><li><i class="ca-dot is-need"></i>If needed <b>${need}</b></li></ul>
      <p class="ca-cov-pct"><span>Last month's streams covered</span> <b>Starts with stream duty</b></p>
    </article>`;
  }).join("");
}

const CRITERIA: Record<number, string[]> = {
  1: ["Core Academy modules 1 to 6", "30 days as Initiate", "2 ride-alongs signed off", "Showed up for 80% of duties"],
  2: ["90 days as Watcher", "Safety module", "No active strikes", "15 duties, 5 as Room Lead"],
  3: ["6 months as Warden", "No active strikes", "40 duties, 10 as Captain", "Mentored 2 Initiates to Watcher"],
};
const DUTY_CRITERIA = new Set(["2 ride-alongs signed off", "Showed up for 80% of duties", "15 duties, 5 as Room Lead", "40 duties, 10 as Captain", "Mentored 2 Initiates to Watcher"]);

function renderReady() {
  const list = rows.filter((r) => r.ready && r.track === "mod");
  $("[data-ca-ready]").innerHTML = list.length ? `<div class="ca-ready-grid">${list.map((r) => {
    const to = r.ready!.to, step = nextStep(r);
    const crit = (CRITERIA[r.grade] || []).map((c) => `<li>${esc(c)}${DUTY_CRITERIA.has(c) ? ` <small>${settings.activityRules ? "met" : "counts once stream duty starts"}</small>` : ""}</li>`).join("");
    const note = to >= 4 ? "Only the owner makes Sentinels." : "The owner confirms every promotion. A Right Hand can confirm up to Warden, and the owner is told.";
    return `<article class="bt-card ca-ready-card" data-uid="${esc(r.uid)}">
      <div class="ca-ready-top"><b>${esc(who(r))}</b><span class="ca-ready-move">${gradeChipHtml({ track: "mod", grade: r.grade } as any)}<span aria-hidden="true">&rarr;</span>${gradeChipHtml({ track: "mod", grade: to } as any)}</span></div>
      <p class="ca-ready-since">Met every step on ${esc(fmtDate(r.ready!.since))}.</p>
      <ul class="ca-crit">${crit}</ul>
      <p class="bt-fine bt-fine--left">${esc(note)}</p>
      <div class="bt-form-actions"><button type="button" class="bt-btn bt-btn--admin" data-act="promote" data-uid="${esc(r.uid)}"${step?.allowed ? "" : ` disabled title="${esc(step?.why || "You can't confirm this one.")}"`}>Promote to ${esc(gradeName("mod", to))}</button></div>
    </article>`;
  }).join("")}</div>` : `<div class="bt-empty"><div class="bt-empty-title">No one is ready yet</div><p>People appear here after the nightly check finds they have met every step for their next grade.</p></div>`;
}

function prefLine(p: Partial<Record<Chat, Pref>>) {
  const bits = CHATS.filter((c) => p?.[c] && p[c] !== "no").map((c) => `<span class="ca-pref">${platformIconHtml(c)}${badge(PREF_TONE[p[c] as Pref], PREF_LABEL[p[c] as Pref])}</span>`);
  return bits.join("") || `<span class="ca-none">No chats picked</span>`;
}

function renderQueue() {
  const el = $("[data-ca-queue]");
  if (queueError) { el.innerHTML = `<div class="bt-empty"><div class="bt-empty-title">Couldn't load the queue</div><p>${esc(queueError)}</p></div>`; return; }
  if (!queue.length) { el.innerHTML = `<div class="bt-empty"><div class="bt-empty-title">The queue is empty</div><p>New applications show up here, best first.</p></div>`; return; }
  el.innerHTML = queue.map((a) => {
    const vouches = a.vouches.length ? a.vouches.map((v) => `<span class="ca-vouch">${v.handle ? "@" + esc(v.handle) : "A mod"} ${gradeChipHtml({ track: "mod", grade: Math.min(4, Math.max(1, v.grade || 2)) } as any)}</span>`).join("") : `<span class="ca-none">No vouches yet</span>`;
    const concerns = (a.concerns || []).length ? `<div class="ca-concerns"><b>Concerns (admins only)</b>${a.concerns!.map((c) => `<p><span>${c.byHandle ? "@" + esc(c.byHandle) : "An admin"}:</span> ${esc(c.note)}</p>`).join("")}</div>` : "";
    const days = (a.availability?.days || []).map((d) => DAY_NAME[d] || d).join(", ");
    const acts = me.isOwner
      ? `<button type="button" class="bt-btn bt-btn--admin" data-act="approve" data-app="${esc(a.appId)}">Approve</button><button type="button" class="bt-btn bt-btn--secondary" data-act="notnow" data-app="${esc(a.appId)}">Not now</button><button type="button" class="bt-btn bt-btn--ghost bt-btn--sm" data-act="waive" data-app="${esc(a.appId)}">Waive requirements</button>`
      : `<span class="ca-none">Only the owner decides.</span>`;
    return `<article class="bt-card ca-app" data-app="${esc(a.appId)}">
      <div class="ca-app-top">
        <span class="ca-rank" aria-label="Rank ${a.rank ?? "unranked"}">${a.rank ?? "-"}</span>
        <div class="ca-app-who"><b>${esc(a.handle ? "@" + a.handle : "Unknown member")}</b><small>Applied ${esc(fmtDate(a.createdAt))}${a.expiresAt ? `, lapses ${esc(fmtDate(a.expiresAt))}` : ""}</small></div>
        <div class="ca-app-tags">${a.band ? badge(a.band === "Top 5" ? "lime" : "gray", a.band) : ""}${badge("admin", `Score ${a.score}`)}</div>
      </div>
      <div class="ca-app-prefs">${prefLine(a.prefs || {})}</div>
      <p class="ca-app-meta"><span>${esc(a.device === "phone" ? "On a phone" : a.device === "both" ? "Phone and desktop" : "On a desktop")}</span>${days ? `<span>${esc(days)}</span>` : ""}${a.availability?.note ? `<span>${esc(a.availability.note)}</span>` : ""}</p>
      <div class="ca-app-vouches"><b>Vouches</b>${vouches}</div>
      ${concerns}
      <details class="ca-more"><summary>Their answers</summary>
        <p><b>Why they want to help</b><br>${esc(a.answers?.why || "Not answered.")}</p>
        <p><b>Mod experience</b><br>${esc(a.answers?.experience || "None given.")}</p>
      </details>
      <div class="ca-app-acts">${acts}</div>
    </article>`;
  }).join("");
}

function renderStrikes() {
  const withStrikes = rows.filter((r) => r.activeStrikes > 0);
  const list = withStrikes.length
    ? `<ul class="ca-strikes">${withStrikes.map((r) => `<li><span><b>${esc(who(r))}</b> ${gradeChipHtml({ track: r.track, grade: r.grade } as any)}</span><span>${badge(r.activeStrikes >= 3 ? "pink" : r.activeStrikes === 2 ? "gold" : "gray", plural(r.activeStrikes, "active strike"))}${r.ownerReview ? badge("pink", "Owner review") : ""}</span>${isA2() ? `<button type="button" class="bt-btn bt-btn--secondary bt-btn--sm" data-act="strike" data-uid="${esc(r.uid)}">Add a strike</button>` : ""}</li>`).join("")}</ul>`
    : `<p class="ca-none">No one has an active strike.</p>`;
  $("[data-ca-strikes]").innerHTML = `<p class="bt-section-text">Strikes are private. 1 is a note and a chat. 2 means no Captain or Room Lead duty for 30 days. 3 goes to the owner for review. They expire after 6 months. Reasons stay with the person and the admins; this page shows counts only.</p>${list}
    ${isA2() ? `<div class="bt-row-center"><button type="button" class="bt-btn bt-btn--secondary" data-act="strike-pick">Log a strike</button></div>` : `<p class="bt-fine bt-fine--left">Logging a strike needs an Overseer or above.</p>`}`;
}

function todoHtml(t: Todo) {
  const done = t.status === "done";
  return `<li class="ca-todo${done ? " is-done" : ""}" data-id="${esc(t.id)}">
    <span class="ca-todo-ic">${platformIconHtml(t.platform === "youtube" ? "ytLandscape" : (t.platform as Chat)).replace(/<span class="bt-platform-or[^]*?<\/span>/, "")}</span>
    <span class="ca-todo-body"><b>${esc(t.text || `${t.action === "add" ? "Add" : "Remove"} a ${PLATFORM_NAME[t.platform] || t.platform} mod`)}</b><small>${esc(PLATFORM_NAME[t.platform] || t.platform)}${t.why ? `, ${esc(t.why.charAt(0).toLowerCase() + t.why.slice(1))}` : ""}${t.createdAt ? `, ${esc(fmtDate(t.createdAt))}` : ""}</small></span>
    ${done ? badge("lime", "Done") : `<button type="button" class="bt-btn bt-btn--admin bt-btn--sm" data-act="todo-done" data-id="${esc(t.id)}">Done</button>`}
  </li>`;
}
function renderTodos() {
  const el = $("[data-ca-todos]");
  if (todosError) { el.innerHTML = `<div class="bt-empty"><div class="bt-empty-title">Couldn't load the to-do list</div><p>${esc(todosError)}</p></div>`; return; }
  const open = todos.filter((t) => t.status === "open"), done = todos.filter((t) => t.status === "done");
  el.innerHTML = (open.length ? `<ul class="bt-card ca-todos">${open.map(todoHtml).join("")}</ul>` : `<div class="bt-empty"><div class="bt-empty-title">Nothing to do</div><p>When someone joins or leaves the crew, the moderator changes that need doing by hand show up here.</p></div>`)
    + (done.length ? `<details class="ca-done"><summary>${plural(done.length, "finished item")}</summary><ul class="bt-card ca-todos">${done.map(todoHtml).join("")}</ul></details>` : "");
}

function renderSettings() {
  const form = $<HTMLFormElement>("[data-ca-settings]");
  const ro = !me.isOwner;
  $("[data-ca-gears]").innerHTML = Object.keys(settings.gearsValues).map((k) => `<div class="bt-field"><label class="bt-label" for="ca-g-${esc(k)}">${esc(GEARS_LABEL[k] || k)}</label><input class="bt-input" id="ca-g-${esc(k)}" name="g:${esc(k)}" type="number" inputmode="numeric" min="0" max="1000" step="1" value="${settings.gearsValues[k]}"><span class="bt-hint ca-err" data-err="${esc(k)}" role="alert" hidden></span></div>`).join("");
  const set = (name: string, v: unknown) => { const i = form.querySelector<HTMLInputElement>(`[name="${name}"]`); if (i) i.value = String(v); };
  set("youtubeBoost", settings.youtubeBoost); set("recruitCapPerMonth", settings.recruitCapPerMonth); set("vouchCap", settings.vouchCap);
  set("appExpiryDays", settings.appExpiryDays); set("reapplyDays", settings.reapplyDays);
  form.querySelectorAll<HTMLButtonElement>("[data-sw]").forEach((b) => { b.setAttribute("aria-checked", String((settings as any)[b.dataset.sw!] === true)); b.disabled = ro; });
  form.querySelectorAll<HTMLInputElement>("input").forEach((i) => { i.disabled = ro; });
  $("[data-ca-settings-note]").hidden = !ro;
  $("[data-ca-settings-acts]").hidden = ro;
  form.querySelectorAll<HTMLElement>("[data-err]").forEach((e) => (e.hidden = true));
}

function renderCounts() {
  const set = (k: string, n: number) => { const e = $(`[data-count="${k}"]`); e.textContent = String(n); e.hidden = n === 0; };
  set("ready", rows.filter((r) => r.ready && r.track === "mod").length);
  set("queue", queue.length || openApps);
  set("todos", todos.filter((t) => t.status === "open").length);
  const role = $("[data-ca-role]");
  role.hidden = false;
  role.textContent = me.isOwner ? "You're signed in as the owner. You can use every control on this page."
    : isRightHand() ? "You're a Right Hand: you can promote up to Warden, set status and log strikes. The owner decides applications and settings."
    : isA2() ? "You can set status and log strikes. The owner confirms promotions, decides applications, excuses months and changes the settings."
    : "You can look around. Setting status and strikes need an Overseer or above, and promotions, applications and settings are the owner's.";
}

function renderAll() { renderCounts(); renderRoster(); renderCoverage(); renderReady(); renderQueue(); renderStrikes(); renderTodos(); renderSettings(); }

async function refresh() {
  try { await loadAll(); renderAll(); } catch (err) { toast(messageFor(err, "Couldn't refresh the page."), { kind: "error" }); }
}

// ---- modals ----
interface FormModal { title: string; sub?: string; body: string; submit: string; busy: string; danger?: boolean; run: (form: HTMLFormElement) => Promise<string | void> }
function formModal(o: FormModal) {
  const { modal, close } = openModal({
    feature: "crew", title: o.title,
    content: modalHeader(esc(o.title), o.sub ? esc(o.sub) : "") +
      `<form class="bt-form" novalidate>${o.body}<p class="bt-error" role="alert" hidden></p><div class="bt-modal-actions"><button type="button" class="bt-btn bt-btn--secondary" data-bt-close>Cancel</button><button type="submit" class="bt-btn ${o.danger ? "bt-btn--danger" : "bt-btn--admin"}">${esc(o.submit)}</button></div></form>`,
  });
  const form = modal.querySelector("form") as HTMLFormElement;
  const err = modal.querySelector(".bt-error") as HTMLElement;
  const btn = form.querySelector('button[type="submit"]') as HTMLButtonElement;
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    err.hidden = true; btn.disabled = true; btn.textContent = o.busy;
    try {
      const msg = await o.run(form);
      if (msg) toast(msg);
      close();
    } catch (ex) {
      err.textContent = messageFor(ex, "That didn't work. Try again."); err.hidden = false;
      btn.disabled = false; btn.textContent = o.submit;
    }
  });
  (modal.querySelector("select, textarea, input") as HTMLElement | null)?.focus();
}
const rowOf = (uid: string) => rows.find((r) => r.uid === uid)!;
const val = (f: HTMLFormElement, n: string) => (f.elements.namedItem(n) as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement).value.trim();

function statusModal(uid: string) {
  const r = rowOf(uid);
  const opts = [["active", "Active"], ["reserve", "Reserve"], ["alumni", "Alumni"], ["paused", "Paused"]];
  formModal({
    title: `Set status for ${who(r)}`, sub: `Now ${STATUS[r.status]?.label || r.status}. Check-in and Going dark are set automatically or by the person.`,
    body: `<div class="bt-field"><label class="bt-label" for="ca-m-st">New status</label><select class="bt-select" id="ca-m-st" name="status">${opts.map(([v, l]) => `<option value="${v}"${v === r.status ? " selected" : ""}>${l}</option>`).join("")}</select><span class="bt-hint ca-m-note" data-note></span></div>
      <div class="bt-field"><label class="bt-label" for="ca-m-re">Reason</label><textarea class="bt-textarea" id="ca-m-re" name="reason" rows="3" maxlength="300" placeholder="Required for Reserve, Alumni and Paused. Logged for the admins."></textarea></div>`,
    submit: "Save status", busy: "Saving…",
    run: async (f) => {
      const status = val(f, "status"), reason = val(f, "reason");
      if (["reserve", "alumni", "paused"].includes(status) && !reason) throw new Error("Add a short reason.");
      if (status === r.status) throw new Error("That is already their status.");
      const res = await act("crewSetStatus", { uid, status, reason });
      if (res) { await refresh(); return `${who(r)} is now ${STATUS[status].label}.`; }
    },
  });
  const sel = document.querySelector<HTMLSelectElement>('.bt-portal[data-feature="crew"] [name="status"]');
  const note = document.querySelector<HTMLElement>('.bt-portal[data-feature="crew"] [data-note]');
  const upd = () => { if (sel && note) note.textContent = STATUS[sel.value]?.note || ""; };
  sel?.addEventListener("change", upd); upd();
}

function strikeModal(uid: string) {
  const r = rowOf(uid);
  formModal({
    title: `Log a strike for ${who(r)}`, sub: "Private. The person and the admins can see it.",
    body: `<p class="bt-section-text">${r.activeStrikes ? `They have ${plural(r.activeStrikes, "active strike")} now. ` : ""}1 is a note and a chat. 2 means no Captain or Room Lead duty for 30 days. 3 goes to the owner for review.</p>
      <div class="bt-field"><label class="bt-label" for="ca-m-sr">What happened</label><textarea class="bt-textarea" id="ca-m-sr" name="reason" rows="4" maxlength="500" required></textarea></div>`,
    submit: "Log strike", busy: "Saving…", danger: true,
    run: async (f) => {
      const reason = val(f, "reason");
      if (!reason) throw new Error("Say what happened.");
      const res = await act<{ activeStrikes: number; ownerReview: boolean }>("crewStrike", { uid, reason });
      if (res) { await refresh(); return `Strike logged. ${plural(res.activeStrikes, "active strike")}${res.ownerReview ? ", sent to the owner for review" : ""}.`; }
    },
  });
}

function strikePicker() {
  const mine = rows;
  formModal({
    title: "Log a strike", sub: "Pick who it's for.",
    body: `<div class="bt-field"><label class="bt-label" for="ca-m-who">Crew member</label><select class="bt-select" id="ca-m-who" name="uid">${mine.map((r) => `<option value="${esc(r.uid)}">${esc(who(r))}, ${esc(gradeName(r.track, r.grade))}</option>`).join("")}</select></div>`,
    submit: "Next", busy: "One moment…",
    run: async (f) => { const uid = val(f, "uid"); setTimeout(() => strikeModal(uid), 0); },
  });
}

function excuseModal(uid: string) {
  const r = rowOf(uid);
  formModal({
    title: `Excuse a month for ${who(r)}`, sub: "They won't owe the monthly minimum for that month. It's logged.",
    body: `<div class="bt-field"><label class="bt-label" for="ca-m-mo">Month</label><input class="bt-input" id="ca-m-mo" name="month" type="month" value="${monthKey()}" required></div>
      <div class="bt-field"><label class="bt-label" for="ca-m-er">Reason (optional)</label><textarea class="bt-textarea" id="ca-m-er" name="reason" rows="3" maxlength="300"></textarea></div>`,
    submit: "Excuse month", busy: "Saving…",
    run: async (f) => {
      const month = val(f, "month");
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error("Pick a month.");
      const res = await act("crewExcuse", { uid, month, reason: val(f, "reason") });
      if (res) return `${who(r)} is excused for ${month}.`;
    },
  });
}

function promote(uid: string) {
  const r = rowOf(uid), step = nextStep(r);
  if (!step || !step.allowed) { toast(step?.why || "You can't promote this person.", { kind: "error" }); return; }
  const unmet = !r.ready && r.track === "mod" && r.grade <= 3;
  void confirmAction({
    title: `${step.label}?`, confirmLabel: "Promote", busyLabel: "Promoting…", danger: false, feature: "crew",
    message: `${who(r)} moves from ${gradeName(r.track, r.grade)} to ${step.label.replace(/^Promote to |^Invite to /, "")}. They get the grade badge and a note on the activity feed.${unmet ? " They haven't met every step for this grade yet, so you'd be promoting early." : ""}`,
    onConfirm: async () => {
      try {
        const res = await act("crewPromote", step.body);
        if (res) { toast(`${who(r)} is now ${res.name}.`); await refresh(); }
      } catch (e) { throw new Error(messageFor(e, "Couldn't promote. Try again.")); }
    },
  });
}

function approve(appId: string) {
  const a = queue.find((x) => x.appId === appId)!;
  void confirmAction({
    title: `Approve ${a.handle ? "@" + a.handle : "this applicant"}?`, confirmLabel: "Approve", busyLabel: "Approving…", danger: false, feature: "crew",
    message: `They join as an Initiate, the Academy unlocks, and they get a welcome. ${settings.twitchSync ? "Twitch adds them as a mod." : "Twitch sync is off, so their mod changes go on the to-do list."}`,
    onConfirm: async () => {
      try {
        const res = await act("crewDecide", { appId, decision: "approve" });
        if (res) { toast(`${a.handle ? "@" + a.handle : "They"} joined the crew.`); await refresh(); }
      } catch (e) { throw new Error(messageFor(e, "Couldn't approve. Try again.")); }
    },
  });
}

function notNow(appId: string) {
  const a = queue.find((x) => x.appId === appId)!;
  formModal({
    title: `Not now for ${a.handle ? "@" + a.handle : "this applicant"}`, sub: `They see your note and can apply again after ${plural(settings.reapplyDays, "day")}.`,
    body: `<div class="bt-field"><label class="bt-label" for="ca-m-nn">A kind note for them</label><textarea class="bt-textarea" id="ca-m-nn" name="note" rows="4" maxlength="500" required></textarea></div>`,
    submit: "Send not now", busy: "Sending…",
    run: async (f) => {
      const note = val(f, "note");
      if (!note) throw new Error("Write a short note. They will read it.");
      const res = await act("crewDecide", { appId, decision: "notNow", note });
      if (res) { await refresh(); return "Not now sent."; }
    },
  });
}

function waive(appId: string) {
  const a = queue.find((x) => x.appId === appId)!;
  void confirmAction({
    title: "Waive the requirements?", confirmLabel: "Waive", busyLabel: "Saving…", danger: false, feature: "crew",
    message: `${a.handle ? "@" + a.handle : "This person"} won't need the 3 check-ins or the 14-day account age to apply. Their application stays in the queue.`,
    onConfirm: async () => {
      try { const res = await act("crewWaive", { uid: a.uid }); if (res) toast("Requirements waived."); } catch (e) { throw new Error(messageFor(e, "Couldn't save. Try again.")); }
    },
  });
}

function wireWaive() {
  document.querySelectorAll<HTMLElement>("[data-ca-owner]").forEach((e) => { e.hidden = !me.isOwner; });
  const form = document.querySelector<HTMLFormElement>("[data-ca-waive]");
  if (!form || !me.isOwner) return;
  const err = form.querySelector<HTMLElement>("[data-waive-err]")!, input = form.elements.namedItem("handle") as HTMLInputElement;
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    err.hidden = true;
    const handle = input.value.trim().replace(/^@/, "").toLowerCase();
    const fail = (m: string) => { err.textContent = m; err.hidden = false; };
    if (!/^[a-z0-9_]{3,20}$/.test(handle)) return fail("Enter a handle: 3 to 20 letters, numbers or underscores.");
    let uid: string | null = null;
    if (preview) uid = "preview";
    else { try { uid = await uidForHandle(handle); } catch { return fail("Couldn't look that handle up. Try again."); } }
    if (!uid) return fail(`No member called @${handle}.`);
    void confirmAction({
      title: "Waive the requirements?", confirmLabel: "Waive", busyLabel: "Saving…", danger: false, feature: "crew",
      message: `@${handle} won't need the 3 check-ins or the 14-day account age to apply. 18+ and a linked platform account still apply.`,
      onConfirm: async () => {
        try { const res = await act("crewWaive", { uid }); if (res) { toast(`Requirements waived for @${handle}.`); input.value = ""; } } catch (x) { throw new Error(messageFor(x, "Couldn't save. Try again.")); }
      },
    });
  });
}

async function todoDone(id: string, btn: HTMLButtonElement) {
  btn.disabled = true;
  try {
    const res = await act("crewTodoDone", { id });
    if (res) { const t = todos.find((x) => x.id === id); if (t) t.status = "done"; renderTodos(); renderCounts(); toast("Marked done."); }
  } catch (e) { toast(messageFor(e, "Couldn't mark it done."), { kind: "error" }); }
  finally { btn.disabled = false; }
}

// ---- settings form ----
function wireSettings() {
  const form = $<HTMLFormElement>("[data-ca-settings]");
  const errBox = $("[data-ca-settings-err]");
  form.querySelectorAll<HTMLButtonElement>("[data-sw]").forEach((b) => b.addEventListener("click", () => b.setAttribute("aria-checked", String(b.getAttribute("aria-checked") !== "true"))));
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!me.isOwner) return;
    errBox.hidden = true; form.querySelectorAll<HTMLElement>("[data-err]").forEach((x) => (x.hidden = true));
    const num = (n: string) => Number((form.elements.namedItem(n) as HTMLInputElement).value);
    const gearsValues: Record<string, number> = {};
    for (const k of Object.keys(settings.gearsValues)) gearsValues[k] = num(`g:${k}`);
    const sw = (k: string) => form.querySelector<HTMLElement>(`[data-sw="${k}"]`)!.getAttribute("aria-checked") === "true";
    const payload = {
      gearsValues, youtubeBoost: num("youtubeBoost"), activityRules: sw("activityRules"), checkinFallback: sw("checkinFallback"),
      recruitCapPerMonth: num("recruitCapPerMonth"), vouchCap: num("vouchCap"), appExpiryDays: num("appExpiryDays"), reapplyDays: num("reapplyDays"), twitchSync: sw("twitchSync"),
    };
    const save = async () => {
      const btn = $<HTMLButtonElement>("[data-ca-save]");
      btn.disabled = true;
      try {
        const res = await act<{ settings: Settings }>("crewSaveSettings", payload);
        if (res) { settings = res.settings; renderSettings(); toast("Crew settings saved."); }
      } catch (ex) {
        const d = (ex as { details?: { reason?: string; field?: string } })?.details;
        const field = d?.field;
        const hint = field ? form.querySelector<HTMLElement>(`[data-err="${field}"]`) : null;
        if (reasonOf(ex) === "field" && hint) { hint.textContent = messageFor(ex); hint.hidden = false; hint.closest(".bt-field")?.querySelector("input")?.focus(); }
        else { errBox.textContent = messageFor(ex, "Couldn't save the settings. Try again."); errBox.hidden = false; }
      } finally { btn.disabled = false; }
    };
    if (payload.activityRules && !settings.activityRules) {
      void confirmAction({
        title: "Turn on the activity rules?", confirmLabel: "Turn on and save", busyLabel: "Saving…", danger: false, feature: "crew",
        message: "This switches on the monthly minimums. People can drop to Check-in and then Reserve if they miss months, and the duty steps for promotion start to count. Stream duty doesn't exist yet, so nobody can meet them. Keep it off until it does.",
        onConfirm: async () => { await save(); },
      });
    } else await save();
  });
}

// ---- wiring ----
function wire() {
  wireSettings();
  wireWaive();
  $("[data-ca-filters]").addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-f]");
    if (!b) return;
    filter = b.dataset.f!;
    document.querySelectorAll<HTMLButtonElement>("[data-ca-filters] [data-f]").forEach((x) => { const on = x === b; x.classList.toggle("is-active", on); x.setAttribute("aria-pressed", String(on)); });
    renderRoster();
  });
  root.addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-act]");
    if (!b || b.disabled) return;
    const { act: a, uid, app, id } = b.dataset;
    if (a === "status") statusModal(uid!);
    else if (a === "strike") strikeModal(uid!);
    else if (a === "strike-pick") strikePicker();
    else if (a === "excuse") excuseModal(uid!);
    else if (a === "promote") promote(uid!);
    else if (a === "approve") approve(app!);
    else if (a === "notnow") notNow(app!);
    else if (a === "waive") waive(app!);
    else if (a === "todo-done") void todoDone(id!, b);
  });
  // The tab row marks the section in view.
  const links = [...document.querySelectorAll<HTMLAnchorElement>("[data-ca-nav] a")];
  const secs = links.map((l) => document.querySelector<HTMLElement>(l.getAttribute("href")!)!);
  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver((ents) => {
      const vis = ents.filter((x) => x.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
      if (vis) links.forEach((l) => { if (l.getAttribute("href") === `#${vis.target.id}`) l.setAttribute("aria-current", "page"); else l.removeAttribute("aria-current"); });
    }, { rootMargin: "-20% 0px -65% 0px" });
    secs.forEach((s) => s && io.observe(s));
  }
}

let wired = false;
async function start() {
  const skel = $("[data-ca-load]"), body = $("[data-ca-body]"), error = $("[data-ca-error]");
  skel.hidden = false; error.hidden = true;
  try {
    await loadAll();
    renderAll();
    if (!wired) { wired = true; wire(); }
    body.hidden = false;
  } catch (err) {
    $("[data-ca-error-text]").textContent = messageFor(err, "Check your connection and try again.");
    error.hidden = false;
  } finally { skel.hidden = true; }
}
$("[data-ca-retry]").addEventListener("click", () => void start());
onAccess(() => void start());
