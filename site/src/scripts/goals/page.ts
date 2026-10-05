// /goals (docs/specs/goal-tracker.md §5): draws the published plan once the member is allowed in. The only
// read is public/goalTracker (data.ts); nothing is written. Sections are filled into the containers in
// pages/goals.astro: the hero card, the road (.bt-road), relaunch readiness, 2027 goals by track, the
// numbers, plus the footer line. Help and the FAQ are static in the page.
import { escapeHtml as esc } from "../../../../shared/ui/dom.js";
import { roadHtml, initRoad } from "../../../../shared/ui/road.js";
import { initChat } from "../../../../shared/ui/chat.js";
import { onAccess } from "./layout";
import {
  loadSnapshot, STATUS, fmt, nextKey, untilText, dateText, dayText, pct, meterHtml, DAY,
  type Snapshot, type GItem, type Level, type Status,
} from "./data";

const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector<T>(sel);
const STALE_MS = 7 * DAY;
const WORDS = ["One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight"];

const badge = (s: Status | null) => { const [t, tone] = STATUS[s ?? "planned"]; return `<span class="bt-badge bt-badge--${tone}"><span class="bt-badge-dot"></span>${t}</span>`; };
const dot = (s: Status | null) => `<span class="gt-dot" data-s="${s ?? "planned"}" aria-label="${STATUS[s ?? "planned"][0]}">${s === "done" ? "✓" : ""}</span>`;
const mascot = (w: number) => {
  const tpl = document.getElementById("bt-mascot-tpl")?.innerHTML ?? "";
  return tpl ? tpl.replace("<svg", `<svg style="width:${w}px"`) : "";
};

let snap: Snapshot;
let byId = new Map<string, GItem>();

/** The level the road stands on: the one in progress, else the first that isn't finished. -1 when all are done. */
function nowLevel(levels: Level[]): number {
  const p = levels.findIndex((l) => l.status === "progress");
  return p >= 0 ? p : levels.findIndex((l) => l.status !== "done" && l.status !== "dropped");
}

// ---------- hero card ----------
let tick = 0;
function countdownHtml(label: string, at: number, now: number) {
  const left = Math.max(0, at - now);
  const d = Math.floor(left / DAY), h = Math.floor((left % DAY) / 3600000), m = Math.floor((left % 3600000) / 60000), s = Math.floor((left % 60000) / 1000);
  const box = (n: number, u: string) => `<div><b>${String(n).padStart(2, "0")}</b><span>${u}</span></div>`;
  return `<div class="gt-ready-top"><div><b>${esc(label)} in</b><small>${esc(dateText(at))}</small></div></div>`
    + `<div class="gt-cd" role="timer" aria-label="${esc(label)} in ${untilText(at, now)}">${box(d, "days")}${box(h, "hours")}${box(m, "min")}${box(s, "sec")}</div>`;
}

function readyCard() {
  const el = $("[data-ready-card]")!;
  const c = snap.config, now = Date.now();
  clearInterval(tick);
  if (c.showAt && c.showAt < now && c.result) {
    el.innerHTML = `<div class="gt-ready-top"><div><b>The result</b><small>${esc(dateText(c.showAt))}</small></div><span class="gt-ready-ic" aria-hidden="true">🏆</span></div><p class="gt-result">${esc(c.result)}</p>`;
    return;
  }
  const next = c.relaunchAt ? nextKey(c, now) : null;
  if (next) {
    const draw = () => { el.innerHTML = countdownHtml(next.label, next.at, Date.now()); };
    draw();
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    tick = window.setInterval(() => { if (Date.now() >= next.at) { clearInterval(tick); readyCard(); } else draw(); }, reduce ? 30000 : 1000);
    return;
  }
  const { done, total, groups } = snap.readiness;
  if (!total) { el.innerHTML = `<div class="gt-ready-top"><div><b>Relaunch readiness</b><small>The list is being written.</small></div></div>`; return; }
  const p = pct(done, total);
  el.innerHTML = `<div class="gt-ready-top"><div><b>Relaunch readiness</b><small>${done} of ${total} done</small></div><span class="gt-pct">${p}<small>%</small></span></div>`
    + meterHtml("gold", done, total, "Relaunch readiness")
    + `<div class="gt-ready-rows">${groups.map((g) => `<span aria-hidden="true">${esc(g.icon)}</span><span class="gt-mini" title="${esc(g.name)}"><i style="--v:${Math.max(4, g.total ? (g.done / g.total) * 100 : 0)}%"></i></span><em>${esc(g.name)} ${g.done}/${g.total}</em>`).join("")}</div>`
    + `<p class="gt-ready-note">The relaunch date gets set when this is close to done.</p>`;
}

// ---------- the road ----------
function levelPanel(n: number): string {
  const l = snap.levels.find((x) => x.n === n) ?? snap.levels[0];
  if (!l) return "";
  const ms = snap.items.filter((i) => i.type === "milestone" && i.level === l.n).sort((a, b) => a.order - b.order);
  const lv = l.boss ? "Final boss" : `Level ${l.n}`;
  const flagged = ms.some((m) => m.relaunch?.needed);
  return `<div class="gt-level" aria-live="polite"><div class="gt-level-head"><span class="gt-level-ic" aria-hidden="true">${esc(l.icon)}</span><div><small>${lv}${l.when ? ` · ${esc(l.when)}` : ""}</small><h3>${esc(l.name)}</h3></div>${badge(l.status)}</div>`
    + (l.blurb ? `<p>${esc(l.blurb)}</p>` : "")
    + (ms.length ? `<ul class="gt-ms">${ms.map((m) => `<li data-s="${m.status ?? "planned"}">${dot(m.status)}<b>${esc(m.title)}</b>${m.dueDate ? `<small>${esc(dayText(m.dueDate))}</small>` : ""}</li>`).join("")}</ul>` : `<p class="gt-level-more">Nothing is planned here yet.</p>`)
    + (flagged ? `<p class="gt-level-more">The relaunch items are also in Relaunch readiness below.</p>` : "") + `</div>`;
}

function drawRoad() {
  const host = $("[data-road]")!;
  const levels = snap.levels;
  if (!levels.length) { host.innerHTML = `<p class="gt-level-more">The road is being drawn.</p>`; return; }
  const now = nowLevel(levels);
  const sel = levels[now >= 0 ? now : levels.length - 1].n;
  host.innerHTML = roadHtml({
    levels: levels.map((l, i) => ({ n: l.n, icon: l.icon, name: l.name, when: l.when, lv: l.boss ? "Final boss" : `Level ${l.n}`, boss: l.boss, state: l.status === "done" ? "done" : i === now ? "now" : "later" })),
    selected: sel, label: "Levels", mascot: mascot(34), panelHtml: levelPanel(sel),
  });
  initRoad(host, { renderPanel: levelPanel });
  const boss = levels.some((l) => l.boss);
  const n = levels.filter((l) => !l.boss).length;
  $("[data-road-lede]")!.textContent = `${WORDS[n - 1] ?? n} level${n === 1 ? "" : "s"}${boss ? ", then the final boss" : ""}. Pick a level to see what's in it.`;
}

// ---------- relaunch readiness ----------
function drawGroups() {
  const host = $("[data-groups]")!;
  const { groups } = snap.readiness;
  if (!groups.length) { host.innerHTML = `<p class="gt-level-more">Nothing is flagged for the relaunch yet.</p>`; return; }
  host.innerHTML = groups.map((g) => {
    const items = g.items.map((id) => byId.get(id)).filter((i): i is GItem => !!i);
    return `<div class="gt-group"><div class="gt-group-head"><span aria-hidden="true">${esc(g.icon)}</span><h3>${esc(g.name)}</h3><em>${g.done} of ${g.total}</em></div>`
      + meterHtml("gold", g.done, g.total, g.name)
      + `<ul>${items.map((i) => `<li data-s="${i.status ?? "planned"}">${dot(i.status)}${esc(i.title)}${i.status === "progress" ? "<small>In progress</small>" : ""}</li>`).join("")}</ul></div>`;
  }).join("");
}

// ---------- 2027 goals ----------
let curTrack = "";
function drawGoals() {
  const tracks = snap.items.filter((i) => i.type === "track").sort((a, b) => a.order - b.order)
    .map((t) => ({ t, goals: snap.items.filter((g) => g.type === "goal" && g.parentId === t.id).sort((a, b) => a.order - b.order) }))
    .filter((x) => x.goals.length);
  const host = $("[data-tracks]")!, list = $("[data-goals]")!;
  if (!tracks.length) { host.innerHTML = ""; list.innerHTML = `<p class="gt-level-more">The goals are being written.</p>`; return; }
  if (!tracks.some((x) => x.t.id === curTrack)) curTrack = tracks[0].t.id;
  host.innerHTML = tracks.map(({ t, goals }) => `<button type="button" class="bt-chip${t.id === curTrack ? " is-active" : ""}" aria-pressed="${t.id === curTrack}" data-track="${esc(t.id)}"><span aria-hidden="true">${esc(t.icon)}</span>${esc(t.title)}<em>${goals.filter((g) => g.status === "done").length}/${goals.length}</em></button>`).join("");
  const goals = tracks.find((x) => x.t.id === curTrack)!.goals;
  list.innerHTML = goals.map((g) => {
    const m = g.metricId ? snap.metrics[g.metricId] : null;
    const meter = m && g.target && m.value != null
      ? meterHtml("blue", m.value, g.target, g.title, `<div class="bt-meter-legend"><span>${fmt(m.value)} ${esc(m.unit)}</span><span>Goal ${fmt(g.target)}</span></div>`) : "";
    return `<div class="gt-goal"><b>${esc(g.title)}</b>${badge(g.status)}${g.description ? `<p>${esc(g.description)}</p>` : ""}${meter}${g.help ? `<div class="gt-goal-help"><span>You can help</span>${esc(g.help)}</div>` : ""}</div>`;
  }).join("");
}

// ---------- the numbers ----------
const NUMS: [string, string, string][] = [["twitchFollowers", "twitch", "TW"], ["youtubeSubscribers", "youtube", "YT"], ["tiktokFollowers", "tiktok", "TT"], ["fanClubMembers", "club", ""]];
function drawNums() {
  const sec = $("#s-nums")!, host = $("[data-nums]")!;
  const rows = NUMS.filter(([id]) => snap.metrics[id]);
  if (!rows.length) { sec.hidden = true; return; }
  sec.hidden = false;
  host.innerHTML = rows.map(([id, key, ab]) => {
    const m = snap.metrics[id];
    const v = m.value;
    const stale = v != null && m.updatedAt != null && Date.now() - m.updatedAt > STALE_MS;
    const goals = snap.items.filter((g) => g.type === "goal" && g.metricId === id && g.target && v != null && g.target > v).map((g) => g.target!);
    const next = goals.length ? Math.min(...goals) : null;
    return `<div class="gt-num${stale ? " is-stale" : ""}"><div class="gt-num-top"><span class="gt-plat gt-plat--${key}">${key === "club" ? mascot(20) : ab}</span>${esc(m.label)}</div>`
      + `<span class="gt-num-n">${v == null ? "—" : fmt(v)}</span>`
      + (v != null && next ? `<div class="gt-mini" role="img" aria-label="${fmt(v)} of ${fmt(next)}"><i style="--v:${Math.min(100, (v / next) * 100)}%"></i></div><small>Next milestone ${fmt(next)}</small>` : "")
      + (v == null ? `<small>Counting soon</small>` : stale ? `<small>Last counted ${esc(dateText(m.updatedAt!))}. Updating.</small>` : "")
      + `</div>`;
  }).join("");
}

// ---------- the page ----------
function draw() {
  byId = new Map(snap.items.map((i) => [i.id, i]));
  $("#h-goal")!.textContent = snap.config.northStar || "Content Creator of the Year";
  const story = $("[data-story]");
  if (story && snap.config.story) story.textContent = snap.config.story;
  readyCard();
  drawRoad();
  drawGroups();
  drawGoals();
  drawNums();
  const when = snap.publishedAt ?? snap.updatedAt;
  $("[data-updated]")!.textContent = when ? `Last updated ${dateText(when)}` : "";
}

function show(state: "page" | "empty" | "error") {
  $("[data-gt-body]")!.hidden = state !== "page";
  $("[data-gt-empty]")!.hidden = state !== "empty";
  $("[data-gt-error]")!.hidden = state !== "error";
}

async function start() {
  try {
    const s = await loadSnapshot();
    if (!s || !s.items.length) { show("empty"); return; }
    snap = s;
    show("page");
    draw();
    // Deep links (#s-road) need the sections to exist before the browser scrolls.
    if (location.hash) document.getElementById(location.hash.slice(1))?.scrollIntoView();
  } catch (err) {
    console.error("goal tracker: couldn't read the plan", err);
    show("error");
  }
}

initChat(document);
$("[data-tracks]")!.addEventListener("click", (e) => {
  const b = (e.target as HTMLElement).closest<HTMLElement>("[data-track]");
  if (!b || !snap) return;
  curTrack = b.dataset.track!;
  drawGoals();
});
document.querySelector("[data-copy]")?.addEventListener("click", async (e) => {
  const btn = e.currentTarget as HTMLButtonElement;
  try { await navigator.clipboard.writeText(location.origin); btn.textContent = "Copied ✓"; } catch { btn.textContent = location.origin; }
  setTimeout(() => { btn.textContent = "Copy the link"; }, 3000);
});
document.querySelector("[data-retry]")?.addEventListener("click", () => { show("page"); void start(); });
onAccess(() => { void start(); });
