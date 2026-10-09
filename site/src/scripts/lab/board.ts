// /feature-lab, the board (docs/specs/feature-lab.md §7; mockup board option 3). Hero with the bench scene (jars filter), the Join strip
// for visitors, the "Your idea shipped" moment (once per idea), the controls (status chips with counts, Area, Sort, the List / Roadmap
// switch, remembered in localStorage bt.lab.view), and the list or roadmap. Ideas open in the idea dialog (deep link ?idea=<id>).
// Every state: loading, empty board, empty filter, load error, hidden ideas for staff. Redraws from the store after every change.
import { initRowSpotlight } from "../../../../shared/ui/effects.js";
import { viewSwitchHtml, initViewSwitch } from "../../../../shared/ui/view-switch.js";
import { burst } from "../../../../shared/ui/burst.js";
import { toast } from "../../../../shared/ui/toast.js";
import { seenOnce, viewPref } from "../boards/seen";
import { onAuth, getAuthState, sendVerification } from "../../lib/auth";
import { STATUS, STATUS_KEYS, AREA, voteLocked, type Idea, type Status } from "./data";
import { S, loadBoard, counts } from "./store";
import { isStaff, isPreview, meOf, needOf, verifyLine } from "./gate";
import { esc, sBadge, pBadge, architect, row, stamp, areaLabel } from "./ui";
import { benchHtml } from "./bench";
import { I, bigFlask, mascot } from "./art";
import { handleVote } from "./vote";
import { authorText, fillAuthors } from "../boards/profiles";
import { openIdea } from "./idea";

const root = document.querySelector<HTMLElement>("[data-fl]");
const viewMemory = viewPref("bt.lab.view", "list", "road"), shippedSeen = seenOnce("bt.lab.shippedSeen");
const f = { status: "all" as "all" | Status, area: "all", sort: "newest", view: viewMemory.get() };
let shipShown = "";

const get = (sel: string) => root!.querySelector<HTMLElement>(sel)!;

function sorted(list: Idea[]) {
  const l = [...list];
  if (f.sort === "votes") l.sort((a, b) => b.voteCount - a.voteCount || b.createdAt - a.createdAt);
  else if (f.sort === "updated") l.sort((a, b) => Math.max(b.updatedAt, b.statusChangedAt) - Math.max(a.updatedAt, a.statusChangedAt));
  else l.sort((a, b) => b.createdAt - a.createdAt);
  return l;
}
const shown = () => S.ideas.filter((i) => (isStaff() || !i.hidden) && (f.status === "all" || i.status === f.status) && (f.area === "all" || i.area === f.area));

// ---------- pieces ----------
function heroHtml() {
  get("[data-fl-bench]").innerHTML = benchHtml(S.loaded ? counts() : null, { active: f.status === "all" ? "" : f.status });
}
function joinHtml() {
  const need = needOf();
  const box = get("[data-fl-join]");
  box.hidden = need === "ok" || need === "unverified";
  if (box.hidden) return;
  box.innerHTML = need === "signedOut"
    ? `<p><b>Got an idea?</b> Join free to post ideas, vote and comment.</p><span class="fl-join-acts"><a class="bt-btn bt-btn--primary bt-btn--sm" href="/account" data-signin="join" data-signin-title="Join to post ideas">Join free</a><a class="bt-btn bt-btn--secondary bt-btn--sm" href="/account" data-signin="signin">Sign in</a></span>`
    : `<p><b>Almost there.</b> Finish signing up to post ideas, vote and comment.</p><span class="fl-join-acts"><button type="button" class="bt-btn bt-btn--primary bt-btn--sm" data-signin="signup">Finish signup</button></span>`;
}
function verifyStrip() {
  const el = get("[data-fl-verify]");
  const on = needOf() === "unverified";
  el.hidden = !on;
  if (!on) return;
  const email = getAuthState().user?.email || "";
  el.innerHTML = `<p><b>Verify your email to post, vote and comment.</b> ${verifyLine(email)}</p><div class="bt-modal-actions">${email ? '<button type="button" class="bt-btn bt-btn--secondary bt-btn--sm" data-fl-resend>Send a new link</button>' : '<a class="bt-btn bt-btn--secondary bt-btn--sm" href="/account">Open Account</a>'}</div>`;
}

/** "Your idea shipped": once per idea, on the author's next visit (remembered in localStorage bt.lab.shippedSeen). */
function shippedMoment() {
  const box = get("[data-fl-ship]");
  if (!S.loaded || needOf() !== "ok") { box.hidden = true; return; }
  const me = meOf();
  const mine = S.ideas.find((i) => i.status === "shipped" && i.by.uid === me.uid && (!shippedSeen.has(i.id) || i.id === shipShown));
  if (!mine) { box.hidden = true; return; }
  if (shipShown !== mine.id) {
    shipShown = mine.id;
    if (!isPreview()) shippedSeen.add(mine.id);
  }
  box.hidden = false;
  box.innerHTML = `<div class="fl-ship" data-burst><span class="fl-ship-art">${architect(74, "The Architect, Epic")}${stamp("Shipped", "", "", "lime", "sm")}</span><div><h3>Your idea shipped</h3><p>"${esc(mine.title)}" is live. You earned <b>The Architect</b> (Epic, +100 XP).</p><div class="fl-ship-acts"><a class="bt-btn bt-btn--primary bt-btn--sm" href="/trophies">See it in your trophy case</a><button type="button" class="bt-btn bt-btn--secondary bt-btn--sm" data-ship-close>Close</button></div></div></div>`;
  burst(box.querySelector<HTMLElement>("[data-burst]"));
}

function controlsHtml() {
  const c = counts();
  const chips = (["all", ...STATUS_KEYS] as const).map((k) => `<button type="button" class="bt-chip${f.status === k ? " is-active" : ""}" data-filter="${k}" aria-pressed="${f.status === k}">${k === "all" ? "All" : STATUS[k].label} · ${c[k]}</button>`).join("");
  const areas = [["all", "All areas"], ...Object.entries(AREA)].map(([k, l]) => `<button type="button" class="bt-chip bt-chip--small${f.area === k ? " is-active" : ""}" data-area="${k}" aria-pressed="${f.area === k}">${l}</button>`).join("");
  const sorts = [["newest", "Newest"], ["votes", "Most voted"], ["updated", "Recently updated"]].map(([k, l]) => `<button type="button" class="bt-chip bt-chip--small${f.sort === k ? " is-active" : ""}" data-sort="${k}" aria-pressed="${f.sort === k}">${l}</button>`).join("");
  get("[data-fl-controls]").innerHTML = `<div class="bt-filters">${chips}</div><div class="fl-tools"><div class="bt-sortbar"><span class="bt-sortbar-label">Area</span>${areas}<span class="bt-sortbar-label fl-sort-gap">Sort</span>${sorts}</div>${viewSwitchHtml({ key: "lab", label: "View", value: f.view, options: [{ value: "list", icon: "☰", label: "List" }, { value: "road", icon: "▦", label: "Roadmap" }] })}</div>`;
  initViewSwitch(get("[data-fl-controls]"), { onChange: (v: string) => { f.view = v === "road" ? "road" : "list"; viewMemory.set(f.view); drawView(); } });
}

const emptyFilter = () => `<div class="bt-empty fl-empty">${mascot()}<p class="bt-empty-title">No ${f.status === "all" ? "" : `${STATUS[f.status].label.toLowerCase()} `}ideas${f.area !== "all" ? ` for ${areaLabel(f.area)}` : ""} yet</p><p>Try another filter, or post the first one.</p></div>`;
const emptyBoard = () => `<div class="bt-empty fl-empty"><div class="fl-empty-art">${mascot()}${bigFlask()}</div><p class="bt-empty-title">The lab is empty</p><p>Be the first to pitch an idea for the site or the stream.</p><div class="fl-empty-act"><button type="button" class="bt-btn bt-btn--primary" data-fl-new>${I.plus}Post an idea</button></div></div>`;
const errorState = () => `<div class="bt-empty fl-empty"><p class="bt-empty-title">Couldn't load ideas</p><p>Check your connection, then refresh the page.</p><div class="fl-empty-act"><button type="button" class="bt-btn bt-btn--secondary bt-btn--sm" data-fl-retry>Try again</button></div></div>`;

function listHtml() {
  const items = sorted(shown());
  return items.length ? `<div class="bt-list">${items.map((i) => row(i, S.voted.has(i.id), isStaff())).join("")}</div>` : emptyFilter();
}
function roadHtml() {
  const cols: Status[] = ["under_review", "planned", "in_progress", "shipped"];
  const pool = sorted(S.ideas.filter((i) => (isStaff() || !i.hidden) && (f.area === "all" || i.area === f.area)));
  const fresh = pool.filter((i) => i.status === "submitted");
  const declined = pool.filter((i) => i.status === "declined").length;
  const card = (i: Idea) => {
    const on = S.voted.has(i.id);
    const v = voteLocked(i) ? `<span class="fl-mini-vote" aria-label="${i.voteCount} votes">${I.up}${i.voteCount}</span>` : `<button type="button" class="fl-mini-vote${on ? " is-active" : ""}" data-vote="${esc(i.id)}" aria-pressed="${on}" aria-label="${on ? "Remove your vote" : "Vote"}">${I.up}${i.voteCount}</button>`;
    return `<div class="bt-card fl-card" tabindex="0" role="button" data-open="${esc(i.id)}" aria-label="${esc(i.title)}. Open"><b>${esc(i.title)}</b>${i.priority ? `<span>${pBadge(i.priority)}</span>` : ""}<div class="fl-card-foot"><span>${authorText(i.by)}${i.status === "shipped" ? ` ${architect(16)}` : ""}</span>${v}</div></div>`;
  };
  const names = fresh.slice(0, 3).map((i) => esc(i.title)).join(", ") + (fresh.length > 3 ? ` and ${fresh.length - 3} more` : "");
  const strip = fresh.length ? `<div class="fl-new">${sBadge("submitted")}<span><b>${fresh.length} new ${fresh.length === 1 ? "idea" : "ideas"}</b> waiting for a look: ${names}.</span><button type="button" class="bt-btn bt-btn--ghost bt-btn--sm" data-lv="list" data-only="submitted">See them in the list</button></div>` : "";
  return `${strip}<div class="fl-road-wrap"><div class="fl-road">${cols.map((k) => { const items = pool.filter((i) => i.status === k); return `<div class="fl-col${k === "shipped" ? " fl-col--shipped" : ""}"><div class="fl-col-head">${sBadge(k)}<span>${items.length}</span></div>${items.map(card).join("") || '<p class="bt-meta">Nothing here yet.</p>'}</div>`; }).join("")}</div></div>${declined ? `<p class="bt-meta fl-declined-link">${declined} declined ${declined === 1 ? "idea isn't" : "ideas aren't"} shown. <a href="#" data-lv="list" data-only="declined">Show declined</a></p>` : ""}`;
}
function drawView() {
  const box = get("[data-fl-view]");
  box.removeAttribute("aria-busy");
  if (S.error) { box.innerHTML = errorState(); return; }
  if (!S.loaded) return;
  if (!S.ideas.some((i) => isStaff() || !i.hidden)) { box.innerHTML = emptyBoard(); return; }
  box.innerHTML = f.view === "road" ? roadHtml() : listHtml();
  initRowSpotlight(box);
  if (!isPreview()) void fillAuthors(box);   // the live handles (a preview has no profiles to read)
}

/** Redraw everything, keeping keyboard focus on the same control. */
function draw() {
  const a = document.activeElement as HTMLElement | null;
  const key = a && root!.contains(a) ? (a.dataset.filter && `[data-filter="${a.dataset.filter}"]`) || (a.dataset.area && `[data-area="${a.dataset.area}"]`) || (a.dataset.sort && `[data-sort="${a.dataset.sort}"]`) || (a.dataset.open && `[data-open="${a.dataset.open}"]`) : "";
  heroHtml(); joinHtml(); verifyStrip(); shippedMoment(); controlsHtml(); drawView();
  if (key) { const again = root!.querySelector<HTMLElement>(key + (a?.classList.contains("fl-jar") ? ".fl-jar" : ":not(.fl-jar)")) || root!.querySelector<HTMLElement>(key); again?.focus({ preventScroll: true }); }
}

function open(id: string) { void openIdea(id, draw); }

// ---------- events ----------
if (root) {
  root.addEventListener("click", (e) => {
    const t = e.target as Element;
    const vb = t.closest<HTMLElement>("[data-vote]");
    if (vb) { e.preventDefault(); e.stopPropagation(); void handleVote(vb, vb.dataset.vote!, draw); return; }
    const flt = t.closest<HTMLElement>("[data-filter]");
    if (flt) {
      const k = flt.dataset.filter as "all" | Status;
      f.status = flt.classList.contains("fl-jar") && f.status === k ? "all" : k;
      if (f.view === "road") { f.view = "list"; viewMemory.set("list"); }
      draw();
      return;
    }
    const ar = t.closest<HTMLElement>("[data-area]");
    if (ar) { f.area = ar.dataset.area!; draw(); return; }
    const so = t.closest<HTMLElement>("[data-sort]");
    if (so) { f.sort = so.dataset.sort!; draw(); return; }
    const lv = t.closest<HTMLElement>("[data-lv]");
    if (lv) { e.preventDefault(); f.view = "list"; f.status = (lv.dataset.only as Status) || f.status; viewMemory.set("list"); draw(); get("[data-fl-view]").scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" }); return; }
    if (t.closest("[data-fl-resend]")) { void sendVerification().then(() => toast("Sent. Check your inbox."), () => toast("Couldn't send it. Wait a minute and try again.", { kind: "error" })); return; }
    if (t.closest("[data-ship-close]")) { get("[data-fl-ship]").hidden = true; return; }
    if (t.closest("[data-fl-retry]")) { get("[data-fl-view]").setAttribute("aria-busy", "true"); void start(); return; }
    if (t.closest("a, button")) return;   // a profile link or a button inside a row does its own thing
    const o = t.closest<HTMLElement>("[data-open]");
    if (o) open(o.dataset.open!);
  });
  root.addEventListener("keydown", (e) => {
    const o = (e.target as Element).closest<HTMLElement>("[data-open]");
    if (o && e.target === o && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); open(o.dataset.open!); }
  });
  document.addEventListener("fl:posted", () => { f.status = "all"; draw(); });
  document.addEventListener("fl:open", (e) => open((e as CustomEvent<{ id: string }>).detail.id));
}

let started = false;
async function start() {
  await loadBoard();
  draw();
  const id = new URLSearchParams(location.search).get("idea");
  if (id && !started) open(id);
  started = true;
}

if (root) {
  let last = "";
  onAuth((s) => {
    if (s.status === "loading") return;
    const sig = `${s.status}:${s.user?.uid || ""}:${s.roles.join(",")}`;
    if (sig === last) return;
    last = sig;
    void start();
  });
}
