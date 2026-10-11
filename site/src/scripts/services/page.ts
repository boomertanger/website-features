// /services, the member page (docs/specs/service-hub.md §8; mockup section 2, P3 collection wall with P2 as the List): the hero with the progress
// ring (core services rated / core services open to you) and the next badge in a .bt-tease, the Core services / Vault games / Streams chips, the
// Not rated yet / Rated / Can test filters, a search, and the wall (.bt-wall) or the checklist by area. A tile opens the rating dialog (or the
// test from Can test). The layout is kept in localStorage "bt.services.layout". Data: public/services and my/{uid} (one read each, data.ts).
import { onAuth, type AuthState } from "../../lib/auth";
import { messageFor } from "../../lib/errors";
import { RATE_ICON, RATE_LABEL } from "../../../../shared/ui/rate.js";
import { escapeHtml as esc } from "../../../../shared/ui/dom.js";
import { IC, TYPES } from "../services-admin/ui";
import { gate, services, my, whoOf, rateable, isCore, toPick, BADGES, LADDER, type Service, type My } from "./data";
import { openRate, openTest } from "./dialogs";

type Kind = "core" | "vault" | "streams";
type Filter = "" | "todo" | "rated" | "test";
type Layout = "wall" | "list";
const LAYOUT_KEY = "bt.services.layout";

const page = document.querySelector<HTMLElement>("[data-sv-page]")!;
const root = document.querySelector<HTMLElement>("[data-sv-root]")!;

let layout: Layout = "wall";
try { if (localStorage.getItem(LAYOUT_KEY) === "list") layout = "list"; } catch { /* storage off */ }
const S = { all: [] as Service[], my: null as My | null, kind: "core" as Kind, filter: "" as Filter, q: "" };

async function start() {
  root.innerHTML = `<div class="sv-empty" aria-busy="true">${mascot()}<p>Loading the services…</p></div>`;
  try {
    const [all, m] = await Promise.all([services(), my()]);
    S.all = all; S.my = m;
  } catch (err) {
    root.innerHTML = `<div class="sv-empty">${mascot()}<p>Couldn't load the services: ${esc(messageFor(err))}</p><button type="button" class="bt-btn bt-btn--secondary" data-sv-retry>Try again</button></div>`;
    return;
  }
  render();
}
for (const ev of ["sv:rated", "sv:tested", "sv:my"]) document.addEventListener(ev, () => { if (S.my) render(); });

// ---------------------------------------------------------------------------------------------- what shows
const mascot = () => (document.getElementById("sv-mascot") as HTMLTemplateElement | null)?.innerHTML || "";
const who = () => whoOf();
const ofKind = (k: Kind) => S.all.filter((s) => rateable(s, who()) && (k === "core" ? isCore(s) : k === "vault" ? s.type === "vaultGame" : s.type === "stream"));
const mine = (s: Service) => S.my?.rated[s.id] || null;
const isNew = (s: Service) => { const r = mine(s); return !!r && r.version !== s.version; };
const canTest = (s: Service) => s.checks >= 3;
const tested = (s: Service) => S.my?.tested[s.id] === s.version;
function shown(): Service[] {
  const q = S.q.trim().toLowerCase();
  return ofKind(S.kind)
    .filter((s) => (S.filter === "todo" ? !mine(s) || isNew(s) : S.filter === "rated" ? !!mine(s) : S.filter === "test" ? canTest(s) : true))
    .filter((s) => !q || s.name.toLowerCase().includes(q) || s.area.toLowerCase().includes(q))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// ---------------------------------------------------------------------------------------------- the frame
const LIST_IC = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1"/><circle cx="4.5" cy="12" r="1"/><circle cx="4.5" cy="18" r="1"/></svg>`;
const SCENE = `<svg class="sv-scene" viewBox="0 0 120 80" aria-hidden="true"><rect class="t" x="8" y="10" width="30" height="26" rx="6"/><rect class="t on-love" x="45" y="10" width="30" height="26" rx="6"/><rect class="t on-like" x="82" y="10" width="30" height="26" rx="6"/><rect class="t on-nope" x="8" y="44" width="30" height="26" rx="6"/><rect class="t dash" x="45" y="44" width="30" height="26" rx="6"/><rect class="t on-love pop" x="82" y="44" width="30" height="26" rx="6"/></svg>`;
function nextBadge(m: My, coreLeft: number) {
  const n = Object.keys(m.rated).length;
  const rung = LADDER.find(([at, id]) => n < at && !m.badges[id]);
  const fullHeld = !!m.badges["services-full-coverage"];
  if (!n) return { ic: "🏅", name: BADGES["services-first-rating"].name, tag: "Common", line: "Rate your first service to earn it." };
  if (!fullHeld && coreLeft > 0) return { ic: "🏅", name: BADGES["services-full-coverage"].name, tag: "Rare", line: `Rate every core service open to you. ${coreLeft} to go.${rung ? ` On the way: rate ${rung[0] - n} more for ${BADGES[rung[1]].name}.` : ""}` };
  if (rung) return { ic: "🏅", name: BADGES[rung[1]].name, tag: rung[0] >= 50 ? "Rare" : "Common", line: `Rate ${rung[0] - n} more service${rung[0] - n === 1 ? "" : "s"} (Vault games and streams count too).` };
  return { ic: "🏆", name: "Every rating badge", tag: "Done", line: "You've earned them all. New services still show up here as they arrive." };
}
function render() {
  const m = S.my!, core = ofKind("core"), coreRated = core.filter((s) => mine(s)).length, pct = core.length ? Math.round((coreRated / core.length) * 100) : 0;
  const nb = nextBadge(m, core.length - coreRated);
  const list = shown(), base = ofKind(S.kind);
  const counts = { todo: base.filter((s) => !mine(s) || isNew(s)).length, rated: base.filter((s) => !!mine(s)).length, test: base.filter(canTest).length };
  const chip = (attr: string, val: string, on: boolean, label: string, cls = "") => `<button type="button" class="bt-chip bt-chip--small${on ? " is-active" : ""}${cls}" ${attr}="${val}" aria-pressed="${on}">${label}</button>`;
  root.innerHTML = `
    <div class="sv-hero">${SCENE}<div class="sv-hero-txt"><h1 class="bt-title">Rate the site</h1><p>Tell Boomer what you love and what's not working. Your ratings are private: only Boomer and the admins see them.</p></div>
      <div class="sv-ring" style="--p:${pct}%" role="img" aria-label="${coreRated} of ${core.length} core services rated"><b>${coreRated}<small>/ ${core.length}</small></b></div></div>
    <div class="bt-tease"><span class="bt-tease-ic" aria-hidden="true">${nb.ic}</span><span class="bt-tease-txt"><b>${esc(nb.name)} <span class="bt-badge ${nb.tag === "Rare" ? "bt-badge--gold" : nb.tag === "Done" ? "bt-badge--lime" : "bt-badge--gray"}">${nb.tag}</span></b><small>${esc(nb.line)}</small></span></div>
    <div class="sv-tools">
      <div class="sv-chips" role="group" aria-label="Which services">${chip("data-kind", "core", S.kind === "core", "Core services")}${chip("data-kind", "vault", S.kind === "vault", "Vault games")}${chip("data-kind", "streams", S.kind === "streams", "Streams")}</div>
      <span class="sv-sp"></span>
      <div class="bt-view-switch" role="radiogroup" aria-label="Layout"><button type="button" role="radio" data-layout="wall" aria-checked="${layout === "wall"}">${IC.grid}Wall</button><button type="button" role="radio" data-layout="list" aria-checked="${layout === "list"}">${LIST_IC}List</button></div>
    </div>
    <div class="sv-tools">
      <div class="sv-chips" role="group" aria-label="Filter">${chip("data-filter", "todo", S.filter === "todo", `Not rated yet · ${counts.todo}`)}${chip("data-filter", "rated", S.filter === "rated", `Rated · ${counts.rated}`)}${counts.test ? chip("data-filter", "test", S.filter === "test", `Can test · ${counts.test}`) : ""}</div>
      <span class="sv-sp"></span>
      <label class="sv-search">${IC.search}<input class="bt-input" type="search" placeholder="Search" aria-label="Search services" value="${esc(S.q)}" data-sv-q></label>
    </div>
    <div data-sv-body>${body(list, base)}</div>`;
}
function body(list: Service[], base: Service[]) {
  if (!base.length) return empty(S.kind === "streams" ? "No streams to rate right now. Each stream can be rated for 14 days after it ends." : S.kind === "vault" ? "No Vault games to rate yet." : "Nothing to rate yet.");
  if (!list.length) return empty(S.q ? "No service matches that search." : S.filter === "todo" ? "Every one rated. Boomer thanks you." : S.filter === "rated" ? "Nothing rated yet. Tap a tile to start." : "Nothing to test here yet.");
  const note = S.filter === "test" ? `<p class="bt-fineprint">Tap a service to run its checks on your phone or desktop. Each version counts once.</p>` : layout === "wall" ? `<p class="bt-fineprint">Tiles light up in the color of your rating. "New version" means it changed since you rated it: tap to keep or change your rating.</p>` : "";
  return (layout === "wall" ? wall(list) : checklist(list)) + note;
}
const empty = (t: string) => `<div class="sv-empty">${mascot()}<p>${esc(t)}</p></div>`;
const typeIc = (s: Service) => IC[s.type] || IC.feature;
const typeName = (s: Service) => TYPES[s.type]?.[1] || s.type;

function wall(list: Service[]) {
  const test = S.filter === "test";
  return `<div class="bt-wall">${list.map((s) => {
    const r = mine(s), pick = r ? toPick(r.value) : null, nw = isNew(s);
    const q = test ? `<span class="bt-wall-q">${tested(s) ? "Tested" : "Test"}</span>` : nw ? `<span class="bt-wall-q">New version</span>` : r ? "" : `<span class="bt-wall-q">Rate</span>`;
    const label = test ? `Test ${s.name}` : r ? `${s.name}: ${RATE_LABEL[pick!]}${nw ? ", new version" : ""}. Change` : `Rate ${s.name}`;
    return `<button type="button" class="bt-wall-tile${r && !test ? " is-rated" : ""}${nw && !test ? " is-new" : ""}"${pick && !test ? ` data-v="${pick}"` : ""} data-id="${esc(s.id)}" aria-label="${esc(label)}">${pick && !test ? `<span class="bt-wall-badge">${RATE_ICON[pick]}</span>` : ""}${typeIc(s)}<b>${esc(s.name)}</b>${q}</button>`;
  }).join("")}</div>`;
}
function checklist(list: Service[]) {
  const test = S.filter === "test";
  const areas = [...new Set(list.map((s) => s.area || "Other"))].sort();
  return areas.map((a) => {
    const it = list.filter((s) => (s.area || "Other") === a), done = it.filter((s) => (test ? tested(s) : !!mine(s) && !isNew(s))).length;
    return `<section class="sv-area" aria-label="${esc(a)}"><div class="sv-area-h"><span class="bt-label">${esc(a)}</span><span class="bt-meta">${done} of ${it.length}${test ? " tested" : ""}</span></div>${it.map((s) => {
      const r = mine(s), pick = r ? toPick(r.value) : null, nw = isNew(s);
      const tick = test ? (tested(s) ? IC.check : "") : pick ? RATE_ICON[pick] : "";
      const btn = test ? (tested(s) ? "Test again" : "Test") : r ? (nw ? "Keep or change" : "Change") : "Rate";
      return `<button type="button" class="sv-check" data-id="${esc(s.id)}"${pick && !test ? ` data-v="${pick}"` : ""}><span class="sv-tick${tick ? " is-done" : ""}" aria-hidden="true">${tick}</span><span class="sv-check-txt"><span class="sv-name">${esc(s.name)}</span><span class="sv-type">${esc(typeName(s))} · v${esc(s.version)}${!test && r ? ` · ${esc(RATE_LABEL[pick!])}` : ""}${!test && nw ? " · new version" : ""}</span></span><span class="bt-btn bt-btn--sm ${r || test ? "bt-btn--ghost" : "bt-btn--primary"}">${btn}</span></button>`;
    }).join("")}</section>`;
  }).join("");
}

// ---------------------------------------------------------------------------------------------- events
root.addEventListener("click", (e) => {
  const t = e.target as HTMLElement;
  if (t.closest("[data-sv-retry]")) { void start(); return; }
  const k = t.closest<HTMLElement>("[data-kind]"); if (k) { S.kind = k.dataset.kind as Kind; S.filter = ""; render(); return; }
  const f = t.closest<HTMLElement>("[data-filter]"); if (f) { const v = f.dataset.filter as Filter; S.filter = S.filter === v ? "" : v; render(); return; }
  const l = t.closest<HTMLElement>("[data-layout]");
  if (l) { layout = l.dataset.layout as Layout; try { localStorage.setItem(LAYOUT_KEY, layout); } catch { /* storage off */ } render(); return; }
  const tile = t.closest<HTMLElement>("[data-id]");
  if (tile) {
    const id = tile.dataset.id!;
    if (S.filter === "test") void openTest({ serviceId: id });
    else void openRate({ serviceId: id });
  }
});
root.addEventListener("input", (e) => {
  const t = e.target as HTMLInputElement;
  if (!t.matches("[data-sv-q]")) return;
  S.q = t.value;
  const b = root.querySelector<HTMLElement>("[data-sv-body]");
  if (b) b.innerHTML = body(shown(), ofKind(S.kind));
});

// ---------------------------------------------------------------------------------------------- the gate (last: onAuth can call back straight away, and everything above must exist by then)
let started = false;
onAuth((s: AuthState) => {
  const access = gate.isPreview(s) ? "page" : s.status === "loading" ? "loading" : s.status === "signedOut" ? "join" : s.status === "needsSignup" ? "signup" : "page";
  page.dataset.access = access;
  if (access === "page" && !started) { started = true; void start(); }
});
