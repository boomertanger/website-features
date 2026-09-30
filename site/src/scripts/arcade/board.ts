// Tap the Splat Leaderboards tab (docs/specs/arcade-step1.md §3, §7).
// Reads per board: the game doc (for the version and board epoch; cached) + 1 board doc
// + the member's best + a rank count only when they're outside the top 100.
// Shows 25 rows, Show more up to 100; your row is highlighted, or pinned under a gap
// row when you're further down.
import { onMember, getGame, getBest, getBoard, countRank, ranked, boardHtml, statsHtml, thisDevice, esc, DEVICE_LABEL, type Device, type Period, type Game, type Row } from "./data";

const GAME_ID = "tapTheSplat";
const PAGE = 25;
const $ = <T extends HTMLElement = HTMLElement>(s: string) => document.querySelector<T>(s);
const card = $("[data-board]")!, meta = $("[data-board-meta]")!;
const devicePick = $('[data-pick="device"]')!, periodPick = $('[data-pick="period"]')!;

const params = new URLSearchParams(location.search);
const mine = thisDevice();
const state = {
  device: (["desktop", "mobile"].includes(params.get("device") || "") ? params.get("device") : mine) as Device,
  period: (params.get("period") === "week" ? "week" : "all") as Period,
  shown: PAGE,
};
// Current device first.
devicePick.innerHTML = [mine, mine === "desktop" ? "mobile" : "desktop"].map((d) => `<button type="button" data-val="${d}">${DEVICE_LABEL[d as Device]}</button>`).join("");

const skeleton = () => `<div class="ar-board-rows" aria-busy="true">${'<div class="bt-skeleton-row"><span class="bt-skeleton ar-skel-av"></span><span class="bt-skeleton-lines"><span class="bt-skeleton ar-skel-line"></span></span></div>'.repeat(6)}</div>`;
const playBtn = (sm = false) => `<button type="button" class="bt-btn bt-btn--go${sm ? " bt-btn--sm" : ""}" data-play-now>Play now</button>`;
const where = (d: Device) => (d === "mobile" ? "your phone" : "a computer");

function syncPills() {
  devicePick.querySelectorAll<HTMLButtonElement>("button").forEach((b) => { const on = b.dataset.val === state.device; b.classList.toggle("is-on", on); b.setAttribute("aria-pressed", String(on)); });
  periodPick.querySelectorAll<HTMLButtonElement>("button").forEach((b) => { const on = b.dataset.val === state.period; b.classList.toggle("is-on", on); b.setAttribute("aria-pressed", String(on)); });
  const u = new URL(location.href);
  u.searchParams.set("device", state.device); u.searchParams.set("period", state.period);
  history.replaceState(null, "", u);
}

let game: Game | null = null, uid = "", verified = false, seq = 0, me = { name: "You", handle: null as string | null };
let rows: Row[] = [];
let pin: (Row & { r: number }) | null = null;

function paint() {
  const { device, period } = state;
  meta.textContent = `${game!.currentVersion} · ${period === "week" ? "This week · Resets Monday 12 am PT" : "All time"}`;
  if (!rows.length) {
    card.innerHTML = `<div class="bt-board-empty"><b>No finished runs ${period === "week" ? "this week" : ""} yet</b><span>Be the first on the ${device} board.</span>${playBtn()}</div>`;
    if (!verified) card.insertAdjacentHTML("beforeend", verifyFoot());
    return;
  }
  const list = ranked(rows).slice(0, state.shown);
  const onIt = rows.some((r) => r.uid === uid);
  let foot = `<div class="bt-board-foot"><span class="ar-faint">Showing ${list.length} of ${rows.length}</span>${list.length < rows.length ? `<button type="button" class="bt-btn bt-btn--secondary bt-btn--sm" data-more>Show more</button>` : ""}</div>`;
  if (!verified) foot = verifyFoot() + foot;
  else if (!onIt && !pin) foot = `<div class="bt-board-foot"><span>You're not on this board yet. Finish a run on ${where(device)} to get on it.</span>${playBtn(true)}</div>` + foot;
  // Your own row: highlighted in the list, or pinned under it when it's past what's shown.
  const inList = list.some((r) => r.uid === uid);
  const ownPin = inList ? null : pin ?? ranked(rows).find((r) => r.uid === uid) ?? null;
  card.innerHTML = boardHtml(list, { meUid: uid, pin: ownPin, period }) + foot;
}
const verifyFoot = () => `<div class="bt-board-foot"><span>Verify your email to get on the board.</span><button type="button" class="bt-btn bt-btn--secondary bt-btn--sm" data-resend>Resend email</button></div>`;

async function load() {
  const n = ++seq, { device, period } = state;
  syncPills();
  card.innerHTML = skeleton();
  try {
    const [r, best] = await Promise.all([getBoard(game!, device, period), getBest(game!, uid, device)]);
    if (n !== seq) return;
    rows = r; pin = null;
    const mineBest = period === "week" ? best?.week : best?.allTime;
    if (mineBest && !rows.some((x) => x.uid === uid)) {
      // Outside the top 100: a count of faster bests gives the rank.
      const rank = await countRank(game!, device, period, mineBest.secs);
      if (n !== seq) return;
      pin = { uid, ...me, secs: mineBest.secs, at: mineBest.at, r: rank };
    }
    paint();
  } catch (err) {
    if (n !== seq) return;
    console.error("arcade: couldn't load the board", err);
    card.innerHTML = `<div class="bt-board-empty"><b>Couldn't load the board</b><span>Refresh to try again.</span></div>`;
  }
}

onMember(async (s) => {
  uid = s.user!.uid;
  verified = s.status === "verified";
  me = { name: s.profile?.displayName || s.profile?.handle || "You", handle: s.profile?.handle || null };
  card.innerHTML = skeleton();
  try {
    game = await getGame(GAME_ID);
    if (!game) throw new Error("game missing");
  } catch (err) {
    console.error("arcade: couldn't load the game", err);
    card.innerHTML = `<div class="bt-board-empty"><b>Couldn't load the board</b><span>Refresh to try again.</span></div>`;
    return;
  }
  const metaSlot = $("[data-game-meta]");
  if (metaSlot) metaSlot.innerHTML = `<span class="bt-badge bt-badge--gray">${esc(game.currentVersion)}</span>${statsHtml(game.stats)}`;
  devicePick.addEventListener("click", (ev) => { const b = (ev.target as Element).closest<HTMLButtonElement>("button"); if (b && b.dataset.val !== state.device) { state.device = b.dataset.val as Device; state.shown = PAGE; load(); } });
  periodPick.addEventListener("click", (ev) => { const b = (ev.target as Element).closest<HTMLButtonElement>("button"); if (b && b.dataset.val !== state.period) { state.period = b.dataset.val as Period; state.shown = PAGE; load(); } });
  card.addEventListener("click", (ev) => { if ((ev.target as Element).closest("[data-more]")) { state.shown = Math.min(100, state.shown + PAGE); paint(); } });
  load();
});
