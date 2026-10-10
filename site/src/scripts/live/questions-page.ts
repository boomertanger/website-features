// /live/questions (docs/specs/chat-games.md §4, §14; Chat Games part 2). The queue (Tonight and Standing, Top or New), On air now while a Questions session
// runs, Your questions (3 open; withdraw an open one; a burst when one of yours gets answered) and, for the crew, the mod queue of held questions with
// Approve, Hide, To Standing and Merge. Read with Firestore Lite every 10 s while the tab is visible and after every action; votes write the member's own
// vote doc (questions-data.ts). Preview (staging, signed out): ?as=member or ?as=mod, sample data, nothing saved.
import { crPanelHtml } from "../../../../shared/ui/cr-panel.js";
import { qcardHtml, initQcards } from "../../../../shared/ui/qcard.js";
import { openModal, modalHeader } from "../../../../shared/ui/modal.js";
import { confirmAction } from "../../../../shared/ui/confirm.js";
import { burst } from "../../../../shared/ui/burst.js";
import { setLook } from "../../../../shared/ui/control-room.js";
import { escapeHtml as esc } from "../../../../shared/ui/dom.js";
import { onAuth, type AuthState } from "../../lib/auth";
import { onLive, startLiveWhenIdle } from "../../lib/live";
import { messageFor } from "../../lib/errors";
import { toast, mascotHtml, reduced } from "./ui";
import { laneList, mine, heldList, myVotes, getRun, withdrawQuestion, moderateQuestion, qPreview, ago, OPEN, SAMPLE_POINTER, type Question, type QRun } from "./questions-data";
import { openAsk, vote } from "./cg-questions";
import "./chatgames-site";
import type { PubLive } from "./model";

const root = document.querySelector<HTMLElement>("[data-lq]");
const mainEl = document.querySelector<HTMLElement>("[data-lq-main]");
const sideEl = document.querySelector<HTMLElement>("[data-lq-side]");
const q = () => new URLSearchParams(location.search);
const ANSWERED_KEY = "bt-lq-answered";

const S = {
  auth: null as AuthState | null, pub: null as PubLive | null,
  lane: "tonight" as "tonight" | "standing", sort: "top" as "top" | "new", laneChosen: false,
  list: [] as Question[], counts: { tonight: 0, standing: 0 }, voted: new Set<string>(), mine: [] as Question[], held: [] as Question[], run: null as QRun | null,
  loading: false,
};
const signedIn = () => !!S.auth?.user;
const pv = () => qPreview(signedIn());
const uid = () => S.auth?.user?.uid || (pv() && q().get("as") !== "visitor" ? "me" : "");
const isMember = () => (S.auth ? (S.auth.status === "verified" || S.auth.status === "unverified") && !!S.auth.profile : false) || (pv() && q().get("as") !== "visitor");
const isStaff = () => (pv() ? q().get("as") === "mod" : document.body.dataset.staff === "on");
const live = () => S.pub?.state === "live" || S.pub?.state === "backstage";

// ---------- loading ----------
const checked = new Set<string>();
let loadedAt = 0;
async function load() {
  if (S.loading) return;
  S.loading = true;
  try {
    if (!S.laneChosen) S.lane = live() ? "tonight" : "standing";
    const p = pv();
    const [list, t, s] = await Promise.all([laneList(S.lane, S.sort, p), laneList("tonight", "top", p), laneList("standing", "top", p)]);
    S.list = list; S.counts = { tonight: t.length, standing: s.length };
    const u = uid();
    // my votes: read once per question (my own taps keep S.voted current), not again on every reload
    const unchecked = u ? list.map((x) => x.id).filter((id) => !checked.has(id)) : [];
    if (unchecked.length) { const got = await myVotes(u!, unchecked, p); unchecked.forEach((id) => { checked.add(id); if (got.has(id)) S.voted.add(id); }); }
    if (!u) { S.voted = new Set(); checked.clear(); }
    loadedAt = Date.now();
    S.mine = u ? await mine(u, p) : [];
    S.held = isStaff() ? await heldList(p).catch(() => []) : [];
    const g = S.pub?.chatGame || (p && q().get("game") === "questions" ? SAMPLE_POINTER : null);
    S.run = g && g.formatId === "questions" ? await getRun(g.runId, p).catch(() => null) : null;
    celebrate();
    render();
  } catch (err) {
    console.warn("questions: load failed", err);
    if (mainEl && !S.list.length) mainEl.innerHTML = crPanelHtml({ title: "The queue", icon: "questions", bodyHtml: `<div class="lq-empty">${mascotHtml()}<b>Couldn't load the questions</b><span>Check your connection; this page tries again on its own.</span></div>` });
  } finally { S.loading = false; }
}

/** One of yours got answered since you last looked: a burst and a toast (once per question, this browser). */
function celebrate() {
  let seen: string[] = [];
  try { seen = JSON.parse(localStorage.getItem(ANSWERED_KEY) || "[]"); } catch { /* fine */ }
  const fresh = S.mine.filter((x) => x.status === "answered" && !seen.includes(x.id));
  if (!fresh.length) return;
  try { localStorage.setItem(ANSWERED_KEY, JSON.stringify([...seen, ...fresh.map((x) => x.id)].slice(-50))); } catch { /* fine */ }
  if (!seen.length && !sessionStorage.getItem(ANSWERED_KEY)) { try { sessionStorage.setItem(ANSWERED_KEY, "1"); } catch { /* fine */ } return; }   // the first visit only records
  const x = fresh[0];
  toast(x.capped ? "Your question was answered on stream! Tonight's XP was already maxed." : `Your question was answered on stream! +${x.xp || 15} XP`);
  requestAnimationFrame(() => { const el = sideEl?.querySelector<HTMLElement>("#lq-mine"); if (el && !reduced()) burst(el, { n: 20 }); });
}

// ---------- drawing ----------
function cardFor(x: Question, { tools = true } = {}) {
  const me = uid();
  const state = x.onAir && (x.status === "tonight" || x.status === "standing") ? "onair" : x.status === "withdrawn" ? "cleared" : x.status;
  const votable = x.status === "tonight" || x.status === "standing";
  const staffTools = tools && isStaff() && OPEN.includes(x.status)
    ? `${x.status === "held" ? `<button type="button" class="bt-btn bt-btn--admin bt-btn--sm" data-mod="approve" data-id="${esc(x.id)}">Approve</button>` : ""}`
      + `<button type="button" class="bt-btn bt-btn--secondary bt-btn--sm" data-mod="hide" data-id="${esc(x.id)}">Hide</button>`
      + `${x.status === "tonight" ? `<button type="button" class="bt-btn bt-btn--secondary bt-btn--sm" data-mod="toStanding" data-id="${esc(x.id)}">To Standing</button>` : ""}`
      + `<button type="button" class="bt-btn bt-btn--secondary bt-btn--sm" data-mod="merge" data-id="${esc(x.id)}">Merge</button>`
    : "";
  return qcardHtml({ id: x.id, text: x.text, handle: x.handle, ago: ago(x.createdAt), votes: x.votes, voted: S.voted.has(x.id), canVote: votable && isMember() && x.uid !== me,
    state, pinned: !!S.run && S.run.pinned === x.id, mine: !!me && x.uid === me, here: false, toolsHtml: staffTools });
}
function render() {
  if (!mainEl || !sideEl) return;
  const pills = `<div class="bt-pills" role="group" aria-label="Lane"><button type="button" data-lane="tonight" class="${S.lane === "tonight" ? "is-on" : ""}" aria-pressed="${S.lane === "tonight"}">Tonight <span class="bt-pills-n">${S.counts.tonight}</span></button><button type="button" data-lane="standing" data-tone="gold" class="${S.lane === "standing" ? "is-on" : ""}" aria-pressed="${S.lane === "standing"}">Standing <span class="bt-pills-n">${S.counts.standing}</span></button></div>`;
  const sort = `<div class="bt-pills" role="group" aria-label="Sort"><button type="button" data-sort="top" class="${S.sort === "top" ? "is-on" : ""}" aria-pressed="${S.sort === "top"}">Top</button><button type="button" data-sort="new" class="${S.sort === "new" ? "is-on" : ""}" aria-pressed="${S.sort === "new"}">New</button></div>`;
  const empty = `<div class="lq-empty">${mascotHtml()}<b>${S.lane === "tonight" ? (live() ? "No questions for tonight yet" : "Tonight's lane opens when the stream is live") : "No Standing questions yet"}</b><span>${isMember() ? "Be the first to ask." : "Join free to ask and vote."}</span>${isMember() ? `<button type="button" class="bt-btn bt-btn--primary bt-btn--sm" data-lq-ask>Ask a question</button>` : `<button type="button" class="bt-btn bt-btn--primary bt-btn--sm" data-signin="join" data-signin-title="Join free to ask and vote">Join free</button>`}</div>`;
  const list = S.list.length ? `<div class="bt-qcard-list">${S.list.map((x) => cardFor(x)).join("")}</div>` : empty;
  const note = S.lane === "tonight" ? "At Stop, Tonight questions with 5+ votes move to Standing; the rest clear." : "Unanswered Standing questions are archived after 30 days.";
  mainEl.innerHTML = crPanelHtml({ id: "lq-queue", title: "The queue", icon: "questions", tagHtml: isStaff() && S.held.length ? `<span class="bt-badge bt-badge--teal"><span class="bt-badge-dot"></span>${S.held.length} held</span>` : "",
    bodyHtml: `<div class="lq-bar">${pills}<span class="lq-sp"></span>${sort}</div>${list}<p class="lq-note">${note}</p>` });

  const parts: string[] = [];
  const d = S.run?.display;
  if (S.run && d) {
    const left = S.run.closesAt ? Math.max(0, S.run.closesAt - Date.now()) : null;
    parts.push(crPanelHtml({ id: "lq-onair", title: "On air now", icon: "now", tagHtml: `<span class="bt-live-tag"><i></i>${S.run.ending ? "Last question" : left != null ? `${Math.floor(left / 60000)}:${String(Math.floor((left % 60000) / 1000)).padStart(2, "0")} left` : "Live"}</span>`,
      bodyHtml: d.text ? qcardHtml({ id: d.questionId || "", text: d.text, handle: d.handle || "", votes: d.votes, voted: !!d.questionId && S.voted.has(d.questionId), canVote: isMember() && !!d.questionId, state: "onair", here: d.here, big: true })
        : `<div class="lq-empty">${mascotHtml()}<b>The next question is on its way</b></div>` }));
  }
  if (isMember()) {
    const open = S.mine.filter((x) => OPEN.includes(x.status));
    const shown = S.mine.filter((x) => x.status !== "withdrawn").slice(0, 8);
    const rows = shown.length ? `<div class="lq-mine">${shown.map((x) => `<div class="lq-mine-row${x.status === "answered" ? " is-answered" : ""}"><p>${esc(x.text)}</p>${OPEN.includes(x.status) ? `<button type="button" class="bt-btn bt-btn--ghost bt-btn--sm" data-withdraw="${esc(x.id)}">Withdraw</button>` : "<span></span>"}<div class="lq-mine-meta">${statusChip(x)}<span>▲ ${x.votes}</span><span>${ago(x.createdAt)}</span></div></div>`).join("")}</div>`
      : `<div class="lq-empty">${mascotHtml()}<b>Nothing asked yet</b><span>You can have 3 open questions at a time.</span><button type="button" class="bt-btn bt-btn--primary bt-btn--sm" data-lq-ask>Ask a question</button></div>`;
    parts.push(crPanelHtml({ id: "lq-mine", cls: "lq-celebrate", title: "Your questions", icon: "questions", tagHtml: `<span class="bt-badge bt-badge--gray">${open.length} of 3 open</span>`, bodyHtml: rows }));
  }
  if (isStaff()) {
    parts.push(crPanelHtml({ id: "lq-mod", title: "Mod queue", icon: "crew", tagHtml: `<span class="bt-admin-tag bt-admin-tag--small">Crew</span>`,
      bodyHtml: S.held.length ? `<div class="bt-qcard-list">${S.held.map((x) => cardFor(x)).join("")}</div><p class="lq-note">Accounts under 7 days are held for you. Merge folds a duplicate's votes into the original, each voter once. Every action is logged.</p>`
        : `<div class="lq-empty">${mascotHtml()}<b>Nothing held</b><span>Questions from new accounts wait here for a mod.</span></div>` }));
  }
  if (!parts.length) parts.push(crPanelHtml({ title: "Join to ask", icon: "questions", bodyHtml: `<div class="lq-empty">${mascotHtml()}<b>Ask and vote with a free account</b><span>The top questions get answered on stream.</span><button type="button" class="bt-btn bt-btn--primary bt-btn--sm" data-signin="join" data-signin-title="Join free to ask and vote">Join free</button></div>` }));
  sideEl.innerHTML = parts.join("");
}
function statusChip(x: Question) {
  const m: Record<string, [string, string]> = { held: ["teal", "Held for a mod"], tonight: ["blue", "Tonight"], standing: ["gold", "Standing"], answered: ["lime", x.capped ? "Answered · XP maxed" : `Answered · +${x.xp ?? 15} XP`], hidden: ["gray", "Hidden by a mod"], merged: ["gray", "Merged into a similar question"], cleared: ["gray", "Cleared"], archived: ["gray", "Archived"] };
  const [tone, label] = m[x.status] || ["gray", x.status];
  return `<span class="bt-badge bt-badge--${tone}"><span class="bt-badge-dot"></span>${esc(label)}</span>`;
}

// ---------- actions ----------
function openMerge(srcId: string) {
  const targets = [...S.list].filter((x) => x.id !== srcId && (x.status === "tonight" || x.status === "standing"));
  const m = openModal({ title: "Merge into…", feature: "chat-games",
    content: modalHeader("Merge into…", "The duplicate's votes fold into the one you pick, each voter once")
      + (targets.length ? `<div class="lq-merge-list">${targets.map((x) => `<button type="button" class="lq-merge-pick" data-target="${esc(x.id)}"><b>▲ ${x.votes}</b><span>${esc(x.text)}</span></button>`).join("")}</div>` : `<p class="bt-section-text">Nothing to merge into in this lane. Switch lanes and try again.</p>`)
      + `<div class="bt-modal-actions"><button type="button" class="bt-btn bt-btn--secondary" data-bt-close>Cancel</button></div>` });
  m.modal.addEventListener("click", async (e) => {
    const b = (e.target as Element).closest<HTMLButtonElement>("[data-target]");
    if (!b) return;
    m.close();
    const ok = await confirmAction({ title: "Merge these questions?", message: "The duplicate is marked merged and its asker sees that. It can't be undone.", confirmLabel: "Merge", danger: false, feature: "chat-games",
      onConfirm: async () => { if (!pv()) await moderateQuestion(srcId, "merge", b.dataset.target!); } });
    if (ok) { toast("Merged"); void load(); }
  });
}
function wire() {
  if (!root) return;
  root.addEventListener("click", async (e) => {
    const t = e.target as Element;
    if (t.closest("[data-lq-ask]")) { openAsk({ onDone: () => void load() }); return; }
    const ln = t.closest<HTMLElement>("[data-lane]"); if (ln) { S.lane = ln.dataset.lane as typeof S.lane; S.laneChosen = true; void load(); return; }
    const so = t.closest<HTMLElement>("[data-sort]"); if (so) { S.sort = so.dataset.sort as typeof S.sort; void load(); return; }
    const wd = t.closest<HTMLButtonElement>("[data-withdraw]");
    if (wd) {
      const ok = await confirmAction({ title: "Withdraw this question?", message: "It leaves the queue and frees one of your 3 open slots.", confirmLabel: "Withdraw", feature: "chat-games",
        onConfirm: async () => { if (!pv()) await withdrawQuestion(wd.dataset.withdraw!); } });
      if (ok) { toast("Withdrawn"); void load(); }
      return;
    }
    const md = t.closest<HTMLButtonElement>("[data-mod]");
    if (md) {
      const action = md.dataset.mod as "approve" | "hide" | "toStanding" | "merge", id = md.dataset.id!;
      if (action === "merge") { openMerge(id); return; }
      md.disabled = true;
      try {
        if (!pv()) await moderateQuestion(id, action);
        toast(action === "approve" ? "Approved" : action === "hide" ? "Hidden" : "Moved to Standing");
        void load();
      } catch (err) { toast(messageFor(err, "That didn't work. Try again."), { kind: "error" }); md.disabled = false; }
    }
  });
  initQcards(root as unknown as Document, { onVote: (id, on, btn) => { if (on) S.voted.add(id); else S.voted.delete(id); void vote(id, on, btn); } });
}

// the bar: Questions is this page
document.querySelectorAll<HTMLAnchorElement>('[data-lp-nav]').forEach((a) => { if (a.dataset.lpNav === "questions") a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current"); });
wire();
startLiveWhenIdle();
onLive((p) => {
  const was = `${S.pub?.state}|${S.pub?.chatGame?.runId}|${S.pub?.chatGame?.round}`;
  S.pub = p;
  if (root) setLook(root, p.look);
  if (`${p.state}|${p.chatGame?.runId}|${p.chatGame?.round}` !== was) void load();
});
onAuth((s) => { if (s.status === "loading") return; const first = !S.auth; S.auth = s; if (first || signedIn()) void load(); });
// Reads (chat-games.md §3): the shared public/live listener reloads the page when the session's card changes; this is only the backstop for new
// questions and their votes: every 30 s while the stream is on and the tab is visible; off air, once when the tab comes back after a minute away.
setInterval(() => { if (!document.hidden && S.auth && live()) void load(); }, 30000);
document.addEventListener("visibilitychange", () => { if (!document.hidden && S.auth && Date.now() - loadedAt > 60000) void load(); });
