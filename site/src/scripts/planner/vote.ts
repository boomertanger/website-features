// /schedule/vote (docs/specs/scream-planner.md sections 2, 4e, 13, 14): next week's ballot. Reads public/ballot (counts,
// closing time) and, for members, their own picks from the ballotMine callable. Votes go through ballotVote ({ week,
// slugs[] }, max 3, movable until Close) and Vault games are added with ballotAddGame (2 a week). Visitors see it
// read-only (Vote opens the Join dialog), members with an unverified email get the verify-email prompt. Covers (V1) or
// Race (V2), kept per viewer in localStorage (bt.schedule.voteView). Sample data under ?as= / ?pv= (non-production).
import { onAccess } from "./layout";
import { esc, loadBallot, loadMine, loadCovers, fillVoteCount, isSample, sampleBallot, sampleMine, sampleVault, ballotError, dayTime, DEFAULT_TZ, pv, rangeLabel, mondayOf, type Ballot, type Mine, type BallotGame } from "./pub";
import { call } from "../../lib/call";
import { sendVerification, refresh, getAuthState, type AuthState } from "../../lib/auth";
import { loadVault, type VCard } from "../vault/data";
import { sectionHeadHtml } from "../../../../shared/ui/section-head.js";
import { coverHtml, initCoverFallbacks } from "../../../../shared/ui/cover.js";
import { voteCardHtml, raceRowHtml, voteAddHtml, tokensHtml, initVoteButtons } from "../../../../shared/ui/vote.js";
import { viewSwitchHtml, initViewSwitch, VOTE_VIEWS } from "../../../../shared/ui/view-switch.js";
import { fmtLeft } from "../../../../shared/ui/countdown.js";
import { openModal, modalHeader } from "../../../../shared/ui/modal.js";
import { toast } from "../../../../shared/ui/toast.js";

const root = document.querySelector<HTMLElement>("[data-pp-vote]")!;
const body = root.querySelector<HTMLElement>("[data-pp-body]")!;
const KEY = "bt.schedule.voteView";
const mascot = () => document.getElementById("bt-mascot-tpl")?.innerHTML ?? "";
const store = { get() { try { return localStorage.getItem(KEY); } catch { return null; } }, set(v: string) { try { localStorage.setItem(KEY, v); } catch { /* fine */ } } };

let auth: AuthState | null = null;
let ballot: Ballot = { week: null, state: "none", opensAt: null, closesAt: null, games: [], totalVotes: 0, votesPerMember: 3 };
let mine: Mine | null = null;
let view: "covers" | "race" = store.get() === "race" ? "race" : "covers";
let sample = false, busy = false, notice = "", loaded = false;
let vaultCache: { slug: string; title: string; status: string; tags: string[]; cover: any }[] | null = null;

initCoverFallbacks();
const isVisitor = () => !auth || auth.status === "signedOut";
const needsSignup = () => auth?.status === "needsSignup";
const unverified = () => auth?.status === "unverified";
const member = () => auth?.status === "verified" || auth?.status === "unverified";
const open = () => ballot.state === "open";

async function fetchAll() {
  if (sample) { ballot = sampleBallot(); mine = mine ?? sampleMine(ballot); return; }
  ballot = await loadBallot().catch(() => ballot);
  if (member() && ballot.week) {
    try { mine = await loadMine(ballot.week); }
    catch (e) { mine = null; if ((e as any)?.details?.reason === "needsSignup") auth = { ...(auth as AuthState), status: "needsSignup" }; }
  } else mine = null;
}

// ---------- sign-in and verify steps ----------
async function joinDialog() {
  const { openSignIn } = await import("../account/dialog");
  openSignIn(needsSignup() ? {} : { mode: "join", title: "Join to vote on games" });
}
function verifyPrompt() {
  const m = openModal({
    title: "Verify your email", feature: "scream-planner",
    content: `${modalHeader("Verify your email")}<div class="bt-empty"><span class="bt-modal-icon" aria-hidden="true">✉️</span><b>Verify your email to vote</b><p>We sent you a link when you joined. Open it, then come back here. Votes come from verified members so everyone gets a fair say.</p><p class="bt-hint" data-msg role="status"></p></div><div class="bt-modal-actions"><button type="button" class="bt-btn bt-btn--secondary" data-resend>Resend email</button><button type="button" class="bt-btn bt-btn--primary" data-done>I've verified</button></div>`,
  });
  const msg = m.modal.querySelector<HTMLElement>("[data-msg]")!;
  m.modal.querySelector("[data-resend]")!.addEventListener("click", async (e) => {
    const b = e.currentTarget as HTMLButtonElement; b.disabled = true;
    try { await sendVerification(); msg.textContent = "Sent. Check your inbox."; } catch { msg.textContent = "Couldn't send it. Wait a minute and try again."; b.disabled = false; }
  });
  m.modal.querySelector("[data-done]")!.addEventListener("click", async () => {
    const { auth: fa } = await import("../../lib/firebase");
    await fa.currentUser?.reload(); await refresh({ forceToken: true });
    if (getAuthState().status === "verified") m.close(); else msg.textContent = "Not verified yet. Open the link in the email first.";
  });
}
/** true when a verified member may go on; otherwise shows the right step. */
function gate(): boolean {
  if (isVisitor() || needsSignup()) { void joinDialog(); return false; }
  if (unverified()) { verifyPrompt(); return false; }
  return true;
}

// ---------- render ----------
const votes = () => new Set(mine?.votes ?? []);
const tagFor = (g: BallotGame) => g.addedBy ? `<span class="bt-badge bt-badge--blue">Added by @${esc(g.addedBy)}</span>`
  : g.seededFrom === "mostWanted" ? `<span class="bt-badge bt-badge--gold">Most wanted</span>` : g.seededFrom === "owner" ? `<span class="bt-badge bt-badge--lime">Playing now</span>` : "";
function gamesHtml() {
  const mineSet = votes(), total = ballot.votesPerMember, full = mineSet.size >= total, top = Math.max(1, ...ballot.games.map((g) => g.votes));
  const common = (g: BallotGame, i: number) => ({ slug: g.slug, title: g.title, coverHtml: coverHtml(g.cover, { alt: g.title, eager: true }), rank: i + 1, votes: g.votes, pct: Math.round((g.votes / top) * 100), mine: mineSet.has(g.slug), tagHtml: tagFor(g), voted: mineSet.has(g.slug), full, visitor: isVisitor() || needsSignup() });
  if (view === "race") return `<div class="bt-race">${ballot.games.map((g, i) => raceRowHtml({ ...common(g, i), coverHtml: coverHtml(g.cover, { alt: "", cls: "bt-cover--sm", size: "sm" } as any) })).join("")}</div>${open() ? voteAddHtml({ row: true }) : ""}`;
  return `<div class="bt-vote-grid">${ballot.games.map((g, i) => voteCardHtml(common(g, i))).join("")}${open() ? voteAddHtml() : ""}</div>`;
}
function render() {
  root.removeAttribute("aria-busy");
  if (ballot.state === "none" || !ballot.games.length) {
    body.innerHTML = `<div class="bt-empty pp-empty"><span class="pp-empty-art" aria-hidden="true">${mascot()}</span><h2 class="bt-empty-title">${ballot.state === "none" ? "No ballot is open right now" : "The ballot is empty so far"}</h2><span>A new ballot opens when Boomer starts planning the next week. See <a href="/schedule">what's on this week</a> in the meantime.</span></div>`;
    fillVoteCount(null); return;
  }
  fillVoteCount(ballot);
  const closes = ballot.closesAt ? (open() ? `Closes ${dayTime(ballot.closesAt, DEFAULT_TZ)} · <span class="bt-timer"><span class="bt-timer-t">${fmtLeft(ballot.closesAt - Date.now())} left</span></span>` : `Closed ${dayTime(ballot.closesAt, DEFAULT_TZ)}`) : "";
  const used = votes().size, canVote = open() && member() && !needsSignup();
  const tokens = canVote ? tokensHtml({ used, total: ballot.votesPerMember }) : tokensHtml({ visitor: true, total: ballot.votesPerMember });
  let top = "";
  if (!open()) top = `<div class="bt-notice pp-closed-note" role="status"><b>Voting is closed.</b> <span>Boomer is picking next week's games now. The schedule lands Friday.</span> <a class="bt-btn bt-btn--secondary bt-btn--sm" href="/schedule">See the schedule</a></div>`;
  else if (isVisitor() || needsSignup()) top = `<div class="pp-gate-note"><span>${needsSignup() ? "Finish signing up to vote." : "Voting is for members. Joining is free."} You get ${ballot.votesPerMember} votes a week and can change them until the ballot closes.</span><button type="button" class="bt-btn bt-btn--primary" data-gate>${needsSignup() ? "Finish signup" : "Join free"}</button></div>`;
  else if (unverified()) top = `<div class="pp-gate-note"><span>Verify your email to vote. It takes a minute and keeps the vote fair.</span><button type="button" class="bt-btn bt-btn--primary" data-verify>Verify email</button></div>`;
  const errBox = notice ? `<div class="bt-notice bt-notice--error" role="alert">${esc(notice)}</div>` : "";
  const hint = open() ? (canVote ? `Change your votes any time before it closes.${mine ? ` ${mine.addsLeft} of 2 game adds left.` : ""}` : "") : `${ballot.totalVotes} votes were cast.`;
  body.innerHTML = `<section class="pp-ballot" aria-label="The ballot">${sectionHeadHtml({ icon: "🗳️", title: "The ballot", count: ballot.games.length, sub: `${ballot.week ? `${rangeLabel(mondayOf(ballot.week))}. ` : ""}The top games go to the front of Boomer's list.`, tools: `${viewSwitchHtml({ key: "voteView", label: "Ballot view", value: view, options: VOTE_VIEWS } as any)}<span class="pp-closes">${closes}</span>` } as any)}`
    + `${top}${errBox}<div class="pp-ballot-top">${open() ? tokens : ""}<span class="bt-meta">${hint}</span></div>${gamesHtml()}</section>`;
  if (!open()) body.querySelectorAll(".bt-vote-btn").forEach((b) => b.remove());
  initViewSwitch(body as unknown as Document, { onChange: (v: any) => { view = v === "race" ? "race" : "covers"; store.set(view); render(); body.querySelector<HTMLElement>('.bt-view-switch [aria-checked="true"]')?.focus(); } });
}

// ---------- actions ----------
async function setVotes(slug: string, on: boolean) {
  if (busy || !ballot.week) return;
  if (!gate()) return;
  const before = mine ? { ...mine, votes: [...mine.votes] } : null, beforeGames = ballot.games.map((g) => ({ ...g }));
  const next = new Set(votes()); on ? next.add(slug) : next.delete(slug);
  busy = true; notice = "";
  mine = { ...(mine as Mine), votes: [...next], votesLeft: ballot.votesPerMember - next.size };
  const g = ballot.games.find((x) => x.slug === slug); if (g) g.votes = Math.max(0, g.votes + (on ? 1 : -1));
  render();
  try {
    if (!sample) await call("ballotVote", { week: ballot.week, slugs: [...next] });
    toast(on ? "Vote counted. You can move it until the ballot closes." : "Vote taken back.", { kind: "ok" });
  } catch (err) {
    mine = before; ballot.games = beforeGames; notice = ballotError(err, "Your vote didn't go through. Try again.");
  }
  busy = false;
  if (!sample) { const b = await loadBallot().catch(() => null); if (b && b.week === ballot.week) ballot = b; }
  render();
}

async function vault() {
  if (vaultCache) return vaultCache;
  if (sample) return (vaultCache = sampleVault());
  const v = await loadVault();
  const covers = await loadCovers().catch(() => new Map());
  return (vaultCache = v.games.map((g: VCard) => ({ slug: g.slug, title: g.title, status: g.status, tags: g.tags, cover: covers.get(g.slug) ?? g.cover })));
}
/** A game just added through the Vault from the picker goes on the ballot in the same step (spec 4e). Returns the line the
 *  Vault's result step shows under the game. Votes are untouched: fetchAll re-reads the member's own picks. */
async function putOnBallot(g: { slug: string; title: string }): Promise<string> {
  const week = ballot.week;
  if (!week || !open()) return "It's in the Vault, but voting is closed, so it can't go on this week's ballot.";
  if (ballot.games.some((x) => x.slug === g.slug)) return "It's already on this week's ballot.";
  if (mine && mine.addsLeft <= 0) return "It's in the Vault, but you've already added 2 games to this week's ballot. Next week, then.";
  try {
    if (sample) { ballot.games.push({ slug: g.slug, title: g.title, cover: null, status: "wishlist", tags: [], votes: 0, wanted: 0, seededFrom: "member", addedBy: "you" }); if (mine) mine.addsLeft -= 1; }
    else { await call("ballotAddGame", { week, slug: g.slug }); await fetchAll(); }
  } catch (err) { return `It's in the Vault, but it didn't go on the ballot. ${ballotError(err, "Try adding it from the ballot's picker.")}`; }
  vaultCache = null; notice = ""; render();
  toast(`${g.title} is on the ballot. Now it needs votes.`, { kind: "ok" });
  return "It's on this week's ballot too, with no votes yet. Close this and give it yours.";
}
async function openAdd() {
  if (!gate() || !ballot.week) return;
  if (mine && mine.addsLeft <= 0) { notice = ballotError({ details: { reason: "addLimit" } }); render(); return; }
  const m = openModal({ title: "Add a game to the ballot", feature: "scream-planner", content: `${modalHeader("Add a game to the ballot", "Pick a game from the Vault. You can add 2 a week.")}<div class="pp-add-pick"><label class="bt-search"><input class="bt-input" type="search" data-q autocomplete="off" placeholder="Search the Vault" aria-label="Search the Vault"></label><div class="pp-add-list" data-list aria-live="polite"><span class="bt-skeleton" style="height:48px"></span></div><p class="bt-hint" data-msg role="status"></p><div class="bt-modal-actions"><button type="button" class="bt-btn bt-btn--ghost" data-newgame>Add a game through the Vault</button><button type="button" class="bt-btn bt-btn--secondary" data-bt-close>Close</button></div></div>` });
  const list = m.modal.querySelector<HTMLElement>("[data-list]")!, msg = m.modal.querySelector<HTMLElement>("[data-msg]")!, input = m.modal.querySelector<HTMLInputElement>("[data-q]")!;
  const all = await vault();
  const draw = () => {
    const q = input.value.trim().toLowerCase(), on = new Set(ballot.games.map((g) => g.slug));
    const rows = all.filter((g) => !q || g.title.toLowerCase().includes(q)).slice(0, 30);
    list.innerHTML = rows.length ? rows.map((g) => `<div class="pp-add-row">${coverHtml(g.cover, { cls: "bt-cover--sm", size: "sm", alt: "" } as any)}<b>${esc(g.title)}</b>${on.has(g.slug) ? `<span class="bt-badge bt-badge--gray">On the ballot</span>` : `<button type="button" class="bt-btn bt-btn--primary bt-btn--sm" data-add="${esc(g.slug)}">Add</button>`}</div>`).join("")
      : `<div class="bt-empty bt-empty--compact"><span class="bt-empty-title">No game called that in the Vault</span><span>Not there? Add it through the Vault, then come back.</span></div>`;
  };
  draw(); input.focus();
  input.addEventListener("input", draw);
  m.modal.querySelector("[data-newgame]")!.addEventListener("click", async () => { m.close(); const { openAddGame } = await import("../vault/add"); vaultCache = null; await openAddGame(input.value.trim(), { onAdded: putOnBallot, queuedNote: "Once it's approved, add it to the ballot from the picker." }); });
  list.addEventListener("click", async (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-add]"); if (!b) return;
    b.disabled = true; msg.textContent = "";
    try {
      if (sample) { const g = all.find((x) => x.slug === b.dataset.add)!; ballot.games.push({ slug: g.slug, title: g.title, cover: g.cover, status: g.status, tags: g.tags, votes: 0, wanted: 0, seededFrom: "member", addedBy: "you" }); if (mine) mine.addsLeft -= 1; }
      else { await call("ballotAddGame", { week: ballot.week, slug: b.dataset.add }); await fetchAll(); }
      m.close(); toast("Added to the ballot. Now it needs votes.", { kind: "ok" }); render();
    } catch (err) { msg.textContent = ballotError(err, "That didn't go through. Try again."); b.disabled = false; }
  });
}

initVoteButtons(body as unknown as Document, { onVote: (slug: string, on: boolean) => { void setVotes(slug, on); return undefined; }, onJoin: () => { void joinDialog(); }, onAdd: () => { void openAdd(); } });
body.addEventListener("click", (e) => {
  const t = e.target as HTMLElement;
  if (t.closest("[data-gate]")) void joinDialog();
  if (t.closest("[data-verify]")) verifyPrompt();
});

onAccess(async (s) => {
  auth = s; sample = isSample(s);
  if (sample && pv().has("unverified")) auth = { ...s, status: "unverified" } as AuthState;
  if (sample && pv().has("visitor")) auth = { ...s, status: "signedOut" } as AuthState;
  try {
    if (!loaded || !sample) { await fetchAll(); loaded = true; }
    if (sample && pv().has("nogames")) ballot = { ...ballot, games: [], state: "none" };
    render();
  } catch (err) { console.error(err); root.removeAttribute("aria-busy"); body.innerHTML = `<div class="bt-notice bt-notice--error">The ballot didn't load. Refresh the page to try again.</div>`; }
});
