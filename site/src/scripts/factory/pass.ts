// /factory, the season pass (docs/specs/fun-factory.md §8, §13a; fun-factory-screens.html screen 1).
// Reads after sign-in: the public summary (what's on), the season tree (revealed parts only; cached 5
// minutes), the member's progress and streak, the "all" board and their standing (plus a rank count
// past the top 100), the streak badges from the catalog (cached) and the factory lines of their reward
// history. Punch the clock calls factoryCheckIn. ?preview= renders factoryPreview for mods and admins.
import { onAccess, isCrew } from "./layout";
import { SHIFT_ICON } from "./art";
import { call } from "../../lib/call";
import { messageFor } from "../../lib/errors";
import { isProduction } from "../../lib/env.js";
import type { AuthState } from "../../lib/auth";
import * as D from "./member-data";
import type { SActivity, SCampaign, SChapter, STree, Progress, Streak, Summary, Board, BoardRow } from "./member-data";
import { periodKey, nextMidnight, nextMonday, dayKey } from "./time";
import { fmtDay } from "./api";
import { loadCatalog } from "../trophies/data";
import { taskRowHtml, lockCardHtml, clockHtml, pathHtml } from "../../../../shared/ui/season.js";
import { timerHtml, initTimers } from "../../../../shared/ui/countdown.js";
import { medalHtml } from "../../../../shared/ui/medal.js";
import { toast } from "../../../../shared/ui/toast.js";
import { escapeHtml } from "../../../../shared/ui/dom.js";
import site from "../../data/site.json";

const esc = (v: unknown) => escapeHtml(String(v ?? ""));
const root = document.querySelector<HTMLElement>("[data-pass]")!;
const DAY = 86400000;
const STREAK_STEPS = [3, 7, 14, 21, 30, 45, 60, 75, 100, 150, 200, 365];
const SUB_CLUB = (site as any).domains?.find((d: any) => d.label === "Sub Club")?.href || "/club";
export const TYPE_ICONS: Record<string, string> = { checkin: "⏱", visit: "🗺", medals: "🏅", profile: "🪪", arcade: "🕹", badges: "🎖", vault: "🗄", ratings: "⭐" };
const iconOf = (a: SActivity) => (a.typeId === "arcade" && a.params?.action === "finish" ? "🩸" : a.typeId === "vault" && a.params?.action === "want" ? "⭐" : TYPE_ICONS[a.typeId] || "✅");
const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;

interface Model {
  preview: null | { as: string; date: string };
  summary: Summary | null; tree: STree; chapters: (SChapter & { number: number })[]; total: number;
  currentId: string; nextUnlockAt: number | null; nextNumber: number | null; now: number;
  progress: Progress; streak: Streak; sub: boolean; crew: boolean; admin: boolean;
  board: Board; me: BoardRow | null; rank: number | null; lockedSub: { id: string; chapterId: string; name: string }[];
  badges: Map<string, { name: string; emoji: string | null; rarity: number }>;
}
let M: Model;
let selected = "";
let me: AuthState;

onAccess(async (s) => {
  me = s;
  const q = new URLSearchParams(location.search);
  try {
    if (q.get("preview")) return await openPreview(q.get("preview")!, q.get("as") || "fan", q.get("date") || "");
    const summary = await D.loadSummary();
    if (!summary?.live || !summary.liveSeasonId) return await renderOff(summary);
    await openLive(summary);
  } catch (err) {
    console.error(err);
    root.removeAttribute("aria-busy");
    root.innerHTML = `<p class="bt-notice bt-notice--error">${esc(messageFor(err, "The season pass didn't load. Refresh the page."))}</p>`;
  }
});

async function catalogBadges() {
  try { const { badges } = await loadCatalog(); return new Map(badges.map((b) => [b.id, { name: b.name, emoji: b.emoji ?? null, rarity: b.rarity }])); } catch { return new Map(); }
}

async function openLive(summary: Summary) {
  const uid = me.user!.uid, id = summary.liveSeasonId!;
  const [tree, progress, streak, board, standing, badges] = await Promise.all([D.loadTree(id), D.loadProgress(id, uid), D.loadStreak(uid), D.loadBoard(id, "all"), D.loadStanding(id, uid), catalogBadges()]);
  const crew = isCrew(me), admin = me.isAdmin;
  const rank = await D.rankOf(id, board, standing).catch(() => null);
  const total = summary.chapters || tree.chapters.length;
  M = {
    preview: null, summary, tree, chapters: tree.chapters.map((c, i) => ({ ...c, number: i + 1 })), total,
    currentId: summary.chapter?.id || tree.chapters[tree.chapters.length - 1]?.id || "", nextUnlockAt: summary.nextUnlockAt ?? null, nextNumber: summary.nextChapterNumber ?? null,
    now: Date.now(), progress, streak, sub: !isProduction && me.roles.includes("sub"), crew, admin, board, me: standing, rank, lockedSub: [], badges,
  };
  selected = M.currentId;
  render();
  void loadLately(id);
}

async function openPreview(seasonId: string, as: string, date: string) {
  if (!isCrew(me)) { root.removeAttribute("aria-busy"); root.innerHTML = `<p class="bt-notice">Previews are for mods and admins. <a href="/shift">Open the season pass</a></p>`; return; }
  const day = /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : dayKey(Date.now());
  const p = await call<{ season: any; chapters: any[]; campaigns: any[]; activities: any[]; lockedSub: any[]; at: number }>("factoryPreview", { seasonId, as, date: day });
  const revealed = p.chapters.filter((c) => c.revealed);
  const next = p.chapters.find((c) => !c.revealed) || null;
  const tree: STree = { season: { ...p.season, art: p.season.art || null }, chapters: revealed.map((c) => ({ ...c, order: c.number })), campaigns: p.campaigns.filter((c) => c.open !== false || c.cadence === "story" || c.cadence === "milestone"), activities: p.activities };
  M = {
    preview: { as, date: day }, summary: null, tree, chapters: revealed.map((c) => ({ ...c, order: c.number })), total: p.chapters.length,
    currentId: revealed[revealed.length - 1]?.id || "", nextUnlockAt: next?.unlockAt ?? null, nextNumber: next?.number ?? null, now: p.at,
    progress: { acts: {}, camps: {} }, streak: { current: 0, best: 0, lastDay: null, savers: 0, saversCap: as === "fan" ? 2 : 3 },
    sub: as === "sub" || as === "crew", crew: as === "crew", admin: false, board: { rows: [], count: 0 }, me: null, rank: null, lockedSub: p.lockedSub || [], badges: await catalogBadges(),
  };
  selected = M.currentId;
  render();
}

// =====================================================================================
function render() {
  root.removeAttribute("aria-busy");
  const s = M.tree.season;
  root.innerHTML = `${M.preview ? previewBanner() : ""}${introCard()}
    <section class="ff-hero" aria-labelledby="ff-hero-h">${heroHtml()}</section>
    <div class="ff-chaptabs" role="tablist" aria-label="Chapters" data-chips>${chipsHtml()}</div>
    <div class="ff-pass-cols"><div class="ff-pass-main" data-main>${mainHtml()}</div><aside class="ff-pass-side" data-side aria-label="Your season">${sideHtml()}</aside></div>`;
  initTimers(root);
  document.title = `${s.name || "Season"} · Night Shift`;
}
function previewBanner() {
  const p = M.preview!;
  const as = { fan: "Fan Club", sub: "Sub Club", crew: "Crew" }[p.as] || p.as;
  return `<div class="bt-notice ff-preview-banner" role="status"><b>Preview</b> · as ${esc(as)} on ${esc(fmtDay(Date.parse(`${p.date}T17:00:00Z`), true))}. Nothing here counts, and members can't see it. <a href="/shift/builder?season=${encodeURIComponent(M.tree.season.id)}">Back to the builder</a></div>`;
}
function introCard() {
  let seen = false;
  try { seen = localStorage.getItem("ff-pass-intro") === "1"; } catch { /* no storage */ }
  if (seen || M.preview) return "";
  return `<div class="ff-intro" data-intro><span aria-hidden="true">${SHIFT_ICON}</span><div><b>New to Night Shift?</b><span>Punch the clock each day, finish the jobs, follow the story and climb the season.</span></div><a class="bt-btn bt-btn--secondary bt-btn--sm" href="/shift/how-it-works">How it works</a><button type="button" class="bt-btn bt-btn--ghost bt-btn--sm" data-intro-close aria-label="Dismiss">×</button></div>`;
}

// ---------- hero ----------
function heroHtml() {
  const s = M.tree.season, cur = M.chapters.find((c) => c.id === M.currentId);
  const curIdx = cur ? cur.number - 1 : -1;
  const bars = Array.from({ length: M.total }, (_, i) => {
    if (i < curIdx) return `<i class="is-done"></i>`;
    if (i === curIdx && cur?.unlockAt != null) {
      const end = M.nextUnlockAt ?? s.endsAt ?? cur.unlockAt;
      const v = Math.max(4, Math.min(100, ((M.now - cur.unlockAt) / Math.max(1, end - cur.unlockAt)) * 100));
      return `<i class="is-now" style="--v:${v.toFixed(0)}%"></i>`;
    }
    return `<i></i>`;
  }).join("");
  const xp = M.me?.seasonXp || 0;
  const daysLeft = s.endsAt != null ? Math.max(0, Math.ceil((s.endsAt - M.now) / DAY)) : null;
  const rankStat = M.preview ? "" : M.admin && M.tree.season.staffRace === "separate" ? `<div><b>—</b><span>you race on the staff board</span></div>` : M.rank ? `<div><b>#${M.rank.toLocaleString("en-US")}</b><span>of ${M.board.count.toLocaleString("en-US")}</span></div>` : `<div><b>—</b><span>not ranked yet</span></div>`;
  const timer = M.nextUnlockAt != null ? timerHtml({ until: M.nextUnlockAt, label: `Chapter ${M.nextNumber ?? ""} in`, done: "New chapter now" }) : s.endsAt != null ? timerHtml({ until: s.endsAt, label: "Season ends in", done: "Season over" }) : "";
  const today = dayKey(M.now);
  const done = M.streak.lastCheckIn === today;
  return `<div class="ff-hero-art" aria-hidden="true">${s.art?.url ? `<img src="${esc(s.art.url)}" alt="">` : `<span>${SHIFT_ICON}</span>`}</div>
    <div class="ff-hero-main">
      <span class="ff-kicker">Season ${String(s.number ?? 0).padStart(2, "0")} · Chapter ${curIdx + 1} of ${M.total}</span>
      <h1 class="bt-title" id="ff-hero-h">${esc(s.name || "This season")}</h1>
      ${s.pitch ? `<p class="ff-muted">${esc(s.pitch)}</p>` : ""}
      <div class="ff-chaps" role="img" aria-label="Chapter ${curIdx + 1} of ${M.total}">${bars}</div>
      <div class="ff-hero-stats"><div><b>${xp.toLocaleString("en-US")}</b><span>season XP</span></div>${rankStat}${daysLeft != null ? `<div><b>${daysLeft}</b><span>day${daysLeft === 1 ? "" : "s"} left</span></div>` : ""}${timer}</div>
    </div>
    <div class="ff-hero-clock" data-clock-wrap>${clockHtml({ streak: M.streak.current, savers: Math.min(M.streak.savers, M.streak.saversCap), cap: M.streak.saversCap, done, disabled: !!M.preview })}</div>`;
}

// ---------- chapter chips ----------
function chipsHtml() {
  const chips = M.chapters.map((c) => {
    const isCur = c.id === M.currentId, on = c.id === selected;
    const past = !isCur && (c.unlockAt ?? 0) < (M.chapters.find((x) => x.id === M.currentId)?.unlockAt ?? 0);
    return `<button type="button" class="bt-chip${on ? " is-active" : ""}" role="tab" aria-selected="${on}" data-chapter="${esc(c.id)}">${past ? "✓ " : ""}Ch ${c.number} · ${esc(c.name || "Untitled")}</button>`;
  });
  for (let n = M.chapters.length + 1; n <= M.total; n++) {
    const soon = n === M.nextNumber && M.nextUnlockAt != null;
    chips.push(`<button type="button" class="bt-chip" role="tab" aria-selected="false" disabled>🔒 Ch ${n}${soon ? ` · ${timerHtml({ until: M.nextUnlockAt!, label: "in", icon: "", done: "now" })}` : ""}</button>`);
  }
  return chips.join("");
}

// ---------- main column ----------
const openNow = (c: SCampaign) => (c.opensAt ?? 0) <= M.now && (c.closesAt == null || M.now < c.closesAt);
const actsOf = (c: SCampaign) => M.tree.activities.filter((a) => a.campaignId === c.id);
function stateOf(a: SActivity) {
  const p = M.progress.acts[a.id];
  const cur = p && p.period === periodKey(a.repeat, M.now) ? p : null;
  return { n: cur ? (cur.completedAt ? a.target : cur.count) : 0, done: !!cur?.completedAt };
}
const row = (a: SActivity) => { const st = stateOf(a); return taskRowHtml({ icon: iconOf(a), title: a.title, sub: a.instructions, n: st.n, of: a.target, xp: a.xp, done: st.done }); };
function campHtml(c: SCampaign, label: string, cadence: string, tone: string, timer = "", inner = "") {
  const acts = actsOf(c);
  const body = inner || (acts.length ? `<div class="bt-task-list">${acts.map(row).join("")}</div>` : `<p class="ff-muted">Nothing here yet.</p>`);
  const allDone = acts.length && acts.every((a) => stateOf(a).done);
  return `<section class="ff-camp" aria-label="${esc(label)}"><div class="ff-camp-head"><h2>${esc(label)}</h2><span class="ff-reset" style="--c:var(--bt-${tone})">${esc(cadence)}</span>${c.bonus?.xp ? `<span class="bt-badge bt-badge--gold">+${c.bonus.xp} XP bonus</span>` : ""}${allDone ? `<span class="bt-badge bt-badge--green">Done ✓</span>` : ""}${timer}</div>${body}</section>`;
}
function mainHtml() {
  const isCur = selected === M.currentId;
  const camps = M.tree.campaigns.filter((c) => c.chapterId === selected);
  const all = (c: SCampaign) => (c.audience || "all") === "all";
  const out: string[] = [];
  if (isCur) {
    for (const c of camps.filter((x) => all(x) && x.cadence === "daily" && openNow(x))) out.push(campHtml(c, `Today · ${c.name}`, "Daily", "blue", timerHtml({ until: nextMidnight(M.now), label: "Resets in" })));
    for (const c of camps.filter((x) => all(x) && x.cadence === "weekly" && openNow(x))) out.push(campHtml(c, `This week · ${c.name}`, "Weekly", "gold", timerHtml({ until: nextMonday(M.now), label: "Resets Mon ·" })));
  }
  for (const c of camps.filter((x) => all(x) && x.cadence === "story")) {
    const acts = actsOf(c);
    let nowSet = false;
    const nodes = acts.map((a) => {
      const st = stateOf(a);
      const state = st.done ? "done" : !nowSet ? ((nowSet = true), "now") : "";
      return { icon: st.done ? "✓" : iconOf(a), label: a.target > 1 && !st.done ? `${a.title} ${st.n}/${a.target}` : a.title, state };
    });
    if (isCur) for (let n = M.chapters.length + 1; n <= M.total; n++) nodes.push({ icon: "🔒", label: `Chapter ${n}`, state: "locked" });
    const badge = M.summary?.badge?.name || (M.tree.season.badgeId ? M.badges.get(M.tree.season.badgeId)?.name : "");
    out.push(campHtml(c, c.name, "Story", "rank-3", "", `${pathHtml({ nodes, label: `${c.name}: story path` })}<p class="ff-muted ff-camp-note">${badge ? `Finish every story for the <b>${esc(badge)}</b> season badge. ` : ""}Earlier chapters' stories stay open until the season ends.</p>`));
  }
  for (const c of camps.filter((x) => all(x) && x.cadence === "event" && openNow(x))) out.push(campHtml(c, c.name, "Event", "teal", c.closesAt ? timerHtml({ until: c.closesAt, label: "Ends in", icon: "⚡" }) : ""));
  const subCamps = camps.filter((x) => x.audience === "sub" && (openNow(x) || ["story", "milestone"].includes(x.cadence)));
  if (M.sub || M.crew) for (const c of subCamps) out.push(campHtml(c, c.name, "Sub Club", "gold"));
  else {
    const locked = [...subCamps.map((c) => c.name), ...M.lockedSub.filter((c) => c.chapterId === selected).map((c) => c.name)];
    if (locked.length) out.push(`<section class="ff-camp" aria-label="Sub Club"><div class="ff-camp-head"><h2>Sub Club</h2><span class="ff-reset" style="--c:var(--bt-gold)">Sub Club</span></div>${lockCardHtml({ icon: "⭐", title: `${plural(locked.length, "Sub Club campaign")} this chapter`, text: `${locked.join(", ")}: more ways to earn season XP. Same XP per task as everyone.`, href: SUB_CLUB, label: "See Sub Club" })}</section>`);
  }
  if (M.crew) for (const c of camps.filter((x) => x.audience === "crew" && (openNow(x) || ["story", "milestone"].includes(x.cadence)))) out.push(campHtml(c, c.name, "Crew", "teal"));
  // Milestones run all season, from any chapter.
  const milestones = M.tree.campaigns.filter((c) => all(c) && c.cadence === "milestone");
  if (milestones.length) out.push(`<section class="ff-camp" aria-label="Milestones"><div class="ff-camp-head"><h2>Milestones</h2><span class="ff-reset" style="--c:var(--bt-pink)">All season</span></div><div class="bt-task-list">${milestones.flatMap(actsOf).map(row).join("")}</div></section>`);
  if (!isCur && !out.length) out.push(`<p class="ff-muted">This chapter's daily and weekly jobs have closed. Its story and milestones show here while they're open.</p>`);
  return out.join("") || `<p class="ff-muted">Nothing to do in this chapter yet. Check back soon.</p>`;
}

// ---------- side column ----------
function sideHtml() {
  if (M.preview) return `<div class="ff-card"><h2>Preview</h2><p class="ff-muted">The leaderboard, streak and history show for real members.</p></div>`;
  const rows = M.board.rows.slice(0, 5);
  const inTop = M.me && rows.some((r) => r.uid === M.me!.uid);
  const boss = D.bossLine(M.board.boss, M.me?.seasonXp || 0, me.user?.uid);
  const lb = rows.map((r) => lbRow(r, r.rank ?? 0, r.uid === me.user?.uid)).join("")
    + (M.me && !inTop && M.rank ? `<div class="ff-gap" aria-hidden="true">···</div>${lbRow({ ...M.me, featured: null }, M.rank, true)}` : "");
  const cur = M.streak.current, next = STREAK_STEPS.find((n) => n > cur);
  const nb = next ? M.badges.get(`streak-day-${next}`) : null;
  const left = next ? next - cur : 0;
  return `<div class="ff-card"><h2>Season leaderboard <a href="/shift/leaderboard">See all</a></h2>${boss ? `<p class="ff-boss" role="status"><span aria-hidden="true">👑</span> ${esc(boss)}</p>` : ""}${lb || `<p class="ff-muted">No one's on the board yet. Finish a job to be first.</p>`}</div>
    ${next ? `<div class="ff-card"><h2>Next streak badge</h2><div class="ff-next">${medalHtml({ emoji: nb?.emoji || "🔥", rarity: nb?.rarity || 1, size: 52 })}<div><b>${esc(nb?.name || `${next}-day streak`)}</b><span>${plural(left, "more day")} of clocking in</span><div class="bt-task-row-bar" role="img" aria-label="${cur} of ${next} days"><i style="--v:${Math.round((cur / next) * 100)}%"></i></div></div></div></div>` : ""}
    <div class="ff-card"><h2>Lately</h2><ul class="ff-feed" data-lately><li class="ff-muted">Loading…</li></ul></div>`;
}
function lbRow(r: BoardRow, rank: number, you: boolean) {
  const name = r.handle ? `@${r.handle}` : r.displayName || "Member";
  return `<div class="ff-lbrow${you ? " is-you" : ""}"><span class="ff-rk" style="${rank <= 3 ? `color:var(--bt-rank-${rank})` : ""}">${rank}</span>${r.featured ? medalHtml({ emoji: r.featured.emoji || "", art: r.featured.art || "", rarity: r.featured.rarity, size: 22 }) : `<span class="ff-nomedal" aria-hidden="true"></span>`}${r.handle ? `<a href="/u/${encodeURIComponent(r.handle)}">${esc(name)}</a>` : esc(name)}${r.roleTag === "admin" ? `<span class="bt-admin-tag bt-admin-tag--small ff-staff-tag">Staff</span>` : ""}${you ? " (you)" : ""}<em>${(r.seasonXp || 0).toLocaleString("en-US")}</em></div>`;
}
async function loadLately(seasonId: string) {
  const box = () => root.querySelector<HTMLElement>("[data-lately]");
  try {
    const r = await call<{ items: { id: string; kind: string; amount: number; badge: { name: string } | null; feature: string; reason: string; createdAt: number }[] }>("myRewardHistory", {});
    const titles = new Map(M.tree.activities.map((a) => [a.id, a.title]));
    const campNames = new Map(M.tree.campaigns.map((c) => [c.id, c.name]));
    const items = r.items.filter((i) => i.id.startsWith("factory:")).slice(0, 5).map((i) => {
      const [, ref, , ] = i.id.split(":");
      const bonus = i.id.startsWith("factory:bonus");
      const what = i.kind === "badge" ? `🏅 You earned <b>${esc(i.badge?.name || "a badge")}</b>` : bonus ? `🎁 <b>${esc(campNames.get(i.id.split(":")[2]) || "Campaign")}</b> bonus` : `✅ <b>${esc(titles.get(ref) || "A job")}</b> done`;
      return `<li>${what}${i.amount ? ` · +${i.amount} XP` : ""}<small>${esc(fmtDay(i.createdAt))}</small></li>`;
    });
    const b = box(); if (b) b.innerHTML = items.join("") || `<li class="ff-muted">Nothing yet this season. Your first job is waiting.</li>`;
    void seasonId;
  } catch { const b = box(); if (b) b.innerHTML = `<li class="ff-muted">Couldn't load your history.</li>`; }
}

// ---------- off-season and ended ----------
async function renderOff(summary: Summary | null) {
  root.removeAttribute("aria-busy");
  const next = summary?.next, last = summary?.last;
  let mine = "";
  if (last) {
    try {
      const [board, standing] = await Promise.all([D.loadBoard(last.id, "all"), D.loadStanding(last.id, me.user!.uid)]);
      const rank = await D.rankOf(last.id, board, standing).catch(() => null);
      mine = standing?.seasonXp ? `You finished <b>#${rank ?? "?"}</b> with <b>${standing.seasonXp.toLocaleString("en-US")}</b> season XP.` : "You didn't race last season. The next one is a fresh start for everyone.";
    } catch { mine = ""; }
  }
  root.innerHTML = `<section class="ff-hero ff-hero--off" aria-labelledby="ff-off-h"><div class="ff-hero-art" aria-hidden="true"><span>${SHIFT_ICON}</span></div><div class="ff-hero-main">
      <span class="ff-kicker">Night Shift · Between seasons</span>
      <h1 class="bt-title" id="ff-off-h">${next ? `Season ${String(next.number ?? 0).padStart(2, "0")}${next.name ? ` · ${esc(next.name)}` : ""} is coming` : "Night Shift is quiet"}</h1>
      <p class="ff-muted">${next ? "A new season, new missions and a fresh race. Your streak and badges carry over." : "No season is running right now. Keep your streak going in the meantime."}</p>
      <div class="ff-hero-stats">${next ? timerHtml({ until: next.startsAt, label: "Starts in", done: "Starting now" }) : ""}<a class="bt-btn bt-btn--secondary bt-btn--sm" href="/shift/how-it-works">How it works</a></div></div></section>
    ${last ? `<section class="ff-card ff-results" aria-labelledby="ff-last-h"><h2 id="ff-last-h">Season ${String(last.number ?? 0).padStart(2, "0")} · ${esc(last.name)}: final standings</h2>
      <ol class="ff-podium">${last.top3.map((r, i) => `<li><span class="ff-rk" style="color:var(--bt-rank-${i + 1})">${i + 1}</span>${r.featured ? medalHtml({ emoji: r.featured.emoji || "", rarity: r.featured.rarity, size: 28 }) : `<span class="ff-nomedal ff-nomedal--lg" aria-hidden="true"></span>`}${r.handle ? `<a href="/u/${encodeURIComponent(r.handle)}">@${esc(r.handle)}</a>` : esc(r.displayName || "Member")}<em>${(r.seasonXp || 0).toLocaleString("en-US")} XP</em></li>`).join("") || `<li class="ff-muted">No one finished on the board.</li>`}</ol>
      ${mine ? `<p class="ff-muted">${mine}</p>` : ""}<a class="bt-btn bt-btn--ghost bt-btn--sm" href="/shift/leaderboard">Full leaderboard</a></section>` : ""}`;
  initTimers(root);
}

// ---------- events ----------
root.addEventListener("click", async (e) => {
  const t = e.target as HTMLElement;
  const chip = t.closest<HTMLButtonElement>("[data-chapter]");
  if (chip && !chip.disabled) {
    selected = chip.dataset.chapter!;
    root.querySelector("[data-chips]")!.innerHTML = chipsHtml();
    root.querySelector("[data-main]")!.innerHTML = mainHtml();
    initTimers(root);
    return;
  }
  if (t.closest("[data-intro-close]")) { try { localStorage.setItem("ff-pass-intro", "1"); } catch { /* no storage */ } t.closest("[data-intro]")?.remove(); return; }
  const btn = t.closest<HTMLButtonElement>("[data-clock-btn]");
  if (btn && btn.getAttribute("aria-disabled") !== "true" && !M.preview) await clockIn(btn);
});

async function clockIn(btn: HTMLButtonElement) {
  btn.setAttribute("aria-disabled", "true");
  btn.textContent = "Punching in…";
  try {
    const r = await call<{ day: string; streak: { current: number; best: number; savers: number; saversCap: number; already: boolean; spent: number; earnedSaver: boolean; badges: string[] }; completed: string[] }>("factoryCheckIn", {});
    M.streak = { ...M.streak, current: r.streak.current, best: r.streak.best, savers: r.streak.savers, saversCap: r.streak.saversCap, lastCheckIn: r.day };
    for (const id of r.streak.badges) toast(`New badge: ${M.badges.get(id)?.name || "a streak badge"}`);
    if (r.streak.spent) toast(`A streak saver covered ${r.streak.spent === 1 ? "a missed day" : `${r.streak.spent} missed days`}. Your streak lives on.`, { kind: "info" });
    if (r.streak.earnedSaver) toast("7 days in a row: you earned a streak saver.");
    if (!r.streak.already) toast(`Punched in. ${plural(r.streak.current, "day")} in a row.`);
    if (M.summary?.liveSeasonId) M.progress = await D.loadProgress(M.summary.liveSeasonId, me.user!.uid);
    root.querySelector("[data-clock-wrap]")!.innerHTML = clockHtml({ streak: M.streak.current, savers: Math.min(M.streak.savers, M.streak.saversCap), cap: M.streak.saversCap, done: true });
    root.querySelector("[data-main]")!.innerHTML = mainHtml();
    root.querySelector("[data-side]")!.innerHTML = sideHtml();
    initTimers(root);
    if (M.summary?.liveSeasonId) void loadLately(M.summary.liveSeasonId);
  } catch (err) {
    btn.removeAttribute("aria-disabled");
    btn.textContent = "Punch the clock";
    toast(messageFor(err, "Punching the clock didn't go through. Try again."), { kind: "error" });
  }
}
