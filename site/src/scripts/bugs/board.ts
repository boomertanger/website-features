// /bug-zapper, the board (docs/specs/bug-zapper.md §7; mockup Board B). The hero with the porch-light scene (its counters filter), the Join and verify strips, the controls
// (status chips with counts and My reports, How bad, Sort, the List / Board switch remembered in localStorage bt.bugs.view), and the list or the status columns. Reports open in
// the report dialog (deep link ?report=<id>); ?new=1&page=<path> opens the report form with the page filled in. Every state: loading, empty board, empty filter, load error.
// Redraws from the store after every change. The once-only moments run after the first load (moments.ts).
import { initRowSpotlight } from "../../../../shared/ui/effects.js";
import { viewSwitchHtml, initViewSwitch } from "../../../../shared/ui/view-switch.js";
import { toast } from "../../../../shared/ui/toast.js";
import { onAuth, getAuthState, sendVerification } from "../../lib/auth";
import { viewPref } from "../boards/seen";
import { SEVERITY, STATUS, CLOSED_VIEW, type Status, type Severity, type Report } from "./data";
import { S, loadBoard, counts as countsOf } from "./store";
import { isMember, needOf, verifyLine } from "./gate";
import { esc, row, sevBadge, privTag, hiddenTag, statusBadge, tally, visible, mine, isClosedView } from "./ui";
import { sceneHtml, zap } from "./scene";
import { I, DEAD_BUG, mascot } from "./art";
import { handleBite } from "./bite";
import { openReport } from "./report";
import { runMoments } from "./moments";

const root = document.querySelector<HTMLElement>("[data-bz]");
const viewMemory = viewPref("bt.bugs.view", "list", "board");
const f = { status: "all" as "all" | "closed" | Status, sev: "any" as "any" | Severity, sort: "newest", view: viewMemory.get(), mine: false };
const get = (sel: string) => root!.querySelector<HTMLElement>(sel)!;
const DAY = 86400000;

const counts = () => countsOf(visible);
function shown() {
  let list = S.reports.filter(visible);
  if (f.mine) list = list.filter(mine);
  if (f.status === "closed") list = list.filter((r) => isClosedView(r.status));
  else if (f.status !== "all") list = list.filter((r) => r.status === f.status);
  if (f.sev !== "any") list = list.filter((r) => r.severity === f.sev);
  const by: Record<string, (a: Report, b: Report) => number> = {
    newest: (a, b) => b.createdAt - a.createdAt, bites: (a, b) => b.meTooCount - a.meTooCount || b.createdAt - a.createdAt, updated: (a, b) => Math.max(b.updatedAt, b.statusChangedAt) - Math.max(a.updatedAt, a.statusChangedAt),
  };
  return [...list].sort(by[f.sort]);
}

// ---------- pieces ----------
function heroScene() {
  const loaded = S.loaded;
  get("[data-bz-scene]").innerHTML = sceneHtml({ counts: loaded ? counts() : { open: 0, confirmed: 0, in_progress: 0, fixed: 0 }, active: f.status === "all" ? "" : f.status, zapped: loaded ? (S.zapped ?? counts().fixed) : null });
}
function strips() {
  const need = needOf();
  const join = get("[data-bz-join]"), verify = get("[data-bz-verify]");
  join.hidden = need === "ok" || need === "unverified";
  if (!join.hidden) {
    join.innerHTML = `${mascot()}<p>${need === "signedOut" ? "Join free to report bugs and add a “bit me too” when they get you too." : "Finish signing up to report bugs and add a “bit me too”."}</p>${need === "signedOut" ? '<a class="bt-btn bt-btn--primary bt-btn--sm" href="/account" data-signin="join" data-signin-title="Join to report bugs">Join free</a>' : '<button type="button" class="bt-btn bt-btn--primary bt-btn--sm" data-signin="signup">Finish signup</button>'}`;
  }
  verify.hidden = need !== "unverified";
  if (!verify.hidden) {
    const email = getAuthState().user?.email || "";
    verify.innerHTML = `${mascot()}<p>Verify your email to report bugs. ${verifyLine(email)}</p>${email ? '<button type="button" class="bt-btn bt-btn--secondary bt-btn--sm" data-bz-resend>Resend the link</button>' : '<a class="bt-btn bt-btn--secondary bt-btn--sm" href="/account">Open Account</a>'}`;
  }
}
function controls() {
  const c = counts();
  const chips = ([["all", "All"], ["open", "Open"], ["confirmed", "Confirmed"], ["in_progress", "In progress"], ["fixed", "Fixed"], ["closed", "Closed"]] as const)
    .map(([k, t]) => `<button type="button" class="bt-chip${f.status === k ? " is-active" : ""}" aria-pressed="${f.status === k}" data-fstatus="${k}">${t}<span class="bz-n">${c[k] ?? 0}</span></button>`).join("");
  const mineChip = isMember() ? `<button type="button" class="bt-chip${f.mine ? " is-active" : ""}" aria-pressed="${f.mine}" data-mine>My reports</button>` : "";
  const sevs = [["any", "Any"], ...(Object.keys(SEVERITY) as Severity[]).map((k) => [k, SEVERITY[k].label])].map(([k, t]) => `<button type="button" class="bt-chip bt-chip--small${f.sev === k ? " is-active" : ""}" aria-pressed="${f.sev === k}" data-fsev="${k}">${t}</button>`).join("");
  const sorts = [["newest", "Newest"], ["bites", "Most bit"], ["updated", "Recently updated"]].map(([k, t]) => `<button type="button" class="bt-chip bt-chip--small${f.sort === k ? " is-active" : ""}" aria-pressed="${f.sort === k}" data-sort="${k}">${t}</button>`).join("");
  get("[data-bz-controls]").innerHTML = `<div class="bt-filters bz-chiprow" role="group" aria-label="Status">${chips}${mineChip}</div>
    <div class="bz-controls-row"><div class="bt-sortbar"><span class="bt-sortbar-label">How bad</span>${sevs}</div><div class="bt-sortbar"><span class="bt-sortbar-label">Sort</span>${sorts}</div>${viewSwitchHtml({ key: "bugs", label: "View", value: f.view, options: [{ value: "list", icon: "☰", label: "List" }, { value: "board", icon: "▦", label: "Board" }] })}</div>`;
  initViewSwitch(get("[data-bz-controls]"), { onChange: (v: string) => { f.view = v === "board" ? "board" : "list"; viewMemory.set(f.view); drawView(); } });
}

const emptyBoard = () => `<div class="bt-empty"><div class="bz-empty-art">${mascot()}${DEAD_BUG}</div><p class="bt-empty-title">No bug reports yet</p><p>Spotted something broken on the site or the stream? Be the first to report it.</p><button type="button" class="bt-btn bt-btn--primary" data-bz-new>${I.plus}Report a bug</button></div>`;
const emptyFilter = () => `<div class="bt-empty"><div class="bz-empty-art">${mascot()}</div><p class="bt-empty-title">Nothing matches these filters</p><p>Try another status, or clear the filters to see every report.</p><button type="button" class="bt-btn bt-btn--secondary" data-clear>Clear filters</button></div>`;
const errorState = () => `<div class="bt-empty"><div class="bz-empty-art">${mascot()}</div><p class="bt-empty-title">The board didn't load</p><p>Check your connection, then try again.</p><button type="button" class="bt-btn bt-btn--secondary" data-retry>Try again</button></div>`;

const listHtml = (list: Report[]) => `<div class="bt-list">${list.map((r) => row(r, S.bit.has(r.id))).join("")}</div>`;
function boardHtml(list: Report[]) {
  const cols: Status[] = ["open", "confirmed", "in_progress", "fixed"];
  const waiting = list.filter((r) => r.status === "open").length;
  const admin = document.body.dataset.auth === "admin";
  const strip = waiting ? `<div class="bz-strip bz-strip--gold">${mascot()}<p><b>${waiting} new ${waiting === 1 ? "report" : "reports"}</b> waiting for a look.</p>${admin ? '<button type="button" class="bt-btn bt-btn--admin bt-btn--sm" data-fstatus="open">Show them</button>' : ""}</div>` : "";
  const closedN = S.reports.filter((r) => visible(r) && isClosedView(r.status)).length;
  const recent = Date.now() - 30 * DAY;
  return `${strip}<div class="bz-cols">${cols.map((k) => {
    const items = list.filter((r) => r.status === k && (k !== "fixed" || (r.fixedAt || r.statusChangedAt) >= recent));
    return `<section class="bz-col${k === "fixed" ? " bz-col--fixed" : ""}" aria-label="${STATUS[k].label}"><div class="bz-col-h">${statusBadge(k)}<span class="bt-count">${items.length}</span></div>${items.map((r) => `<div class="bz-card" role="button" tabindex="0" data-open="${esc(r.id)}"><b>${esc(r.title)}</b><span class="bz-badges">${sevBadge(r.severity)}${r.private ? privTag : ""}${r.hidden ? hiddenTag : ""}</span><span class="bz-card-foot"><span>@${esc(r.by.handle || "former member")}</span>${tally(r, false, { mini: true })}</span></div>`).join("") || '<div class="bt-empty bt-empty--compact"><p class="bt-empty-title">None right now</p></div>'}</section>`;
  }).join("")}</div><div class="bz-more"><button type="button" class="bt-btn bt-btn--ghost bt-btn--sm" data-fstatus="closed">Show closed (${closedN})</button>${S.zapped != null && f.view === "board" ? '<span class="bt-meta">Fixed shows the last 30 days.</span>' : ""}</div>`;
}
function drawView() {
  const box = get("[data-bz-view]");
  box.removeAttribute("aria-busy");
  if (S.error) { box.innerHTML = errorState(); return; }
  if (!S.loaded) return;
  if (!S.reports.some(visible)) { box.innerHTML = emptyBoard(); return; }
  const list = shown();
  box.innerHTML = !list.length ? emptyFilter() : f.view === "board" ? boardHtml(list) : listHtml(list);
  initRowSpotlight(box);
}

/** Redraw everything, keeping keyboard focus on the same control. */
function draw() {
  const a = document.activeElement as HTMLElement | null;
  const key = a && root!.contains(a) ? (a.dataset.fstatus && `[data-fstatus="${a.dataset.fstatus}"]`) || (a.dataset.fsev && `[data-fsev="${a.dataset.fsev}"]`) || (a.dataset.sort && `[data-sort="${a.dataset.sort}"]`) || (a.dataset.open && `[data-open="${a.dataset.open}"]`) : "";
  const meter = !!a?.classList.contains("bz-meter");
  heroScene(); strips(); controls(); drawView();
  if (key) { const again = (meter ? root!.querySelector<HTMLElement>(`.bz-meter${key}`) : root!.querySelector<HTMLElement>(`.bt-chip${key}, ${key}:not(.bz-meter)`)) || root!.querySelector<HTMLElement>(key); again?.focus({ preventScroll: true }); }
}
const open = (id: string) => void openReport(id, draw);

// ---------- events ----------
if (root) {
  root.addEventListener("click", (e) => {
    const t = e.target as Element;
    const bite = t.closest<HTMLElement>("[data-bite]");
    if (bite) { e.preventDefault(); e.stopPropagation(); void handleBite(bite, bite.dataset.bite!, draw); return; }
    const st = t.closest<HTMLElement>("[data-fstatus]");
    if (st) {
      const k = st.dataset.fstatus as "all" | "closed" | Status;
      f.status = f.status === k && k !== "all" ? "all" : k;
      if (k === "closed") f.view = "list";   // the columns show the four open-to-fixed statuses; closed ones are a list
      draw();
      if (st.classList.contains("bz-meter")) zap(root!.querySelector("[data-scene]"));
      return;
    }
    const sev = t.closest<HTMLElement>("[data-fsev]");
    if (sev) { const k = sev.dataset.fsev as "any" | Severity; f.sev = f.sev === k && k !== "any" ? "any" : k; draw(); return; }
    const so = t.closest<HTMLElement>("[data-sort]");
    if (so) { f.sort = so.dataset.sort!; draw(); return; }
    if (t.closest("[data-mine]")) { f.mine = !f.mine; draw(); return; }
    if (t.closest("[data-clear]")) { f.status = "all"; f.sev = "any"; f.mine = false; draw(); return; }
    if (t.closest("[data-retry]")) { get("[data-bz-view]").setAttribute("aria-busy", "true"); void start(); return; }
    if (t.closest("[data-bz-resend]")) { void sendVerification().then(() => toast("Sent. Check your inbox."), () => toast("Couldn't send it. Wait a minute and try again.", { kind: "error" })); return; }
    if (t.closest("a, button:not([data-open])")) return;   // a profile link or a button inside a row does its own thing
    const o = t.closest<HTMLElement>("[data-open]");
    if (o) open(o.dataset.open!);
  });
  root.addEventListener("keydown", (e) => {
    const o = (e.target as Element).closest<HTMLElement>("[data-open]");
    if (o && e.target === o && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); open(o.dataset.open!); }
  });
  document.addEventListener("bz:posted", () => { f.status = "all"; f.sev = "any"; f.mine = false; draw(); });
  document.addEventListener("bz:open", (e) => open((e as CustomEvent<{ id: string }>).detail.id));
}

let started = false;
async function start() {
  await loadBoard();
  draw();
  if (!started) {
    started = true;
    const p = new URLSearchParams(location.search);
    const id = p.get("report");
    if (id) open(id);
    else if (p.get("new") === "1") {
      const page = (p.get("page") || "").slice(0, 300);
      const u = new URL(location.href); u.searchParams.delete("new"); u.searchParams.delete("page"); history.replaceState(null, "", u);
      const { openForm } = await import("./form");
      void openForm({ page, onSent: () => document.dispatchEvent(new CustomEvent("bz:posted")), openReport: (rid) => open(rid) });
    } else if (needOf() === "ok" && S.loaded) void runMoments();
  } else if (needOf() === "ok") void runMoments();
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
