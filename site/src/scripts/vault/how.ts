// /games/how-it-works (docs/specs/game-vault-how-it-works.md; mockup game-vault-how-it-works.html H2 J1).
// The shared How it works behaviour (journey, spotlight, BOOMBOT), plus the Vault's pieces. One read,
// public/vault: the hero's cover wall and counts (games, finished, played in VR from Boomer's VR tag; a
// 0 is hidden), real covers in the scenes, and chapter 02's search (shared/vault-search.js). Everything
// else is local and writes nothing: the Most wanted list you can push around, the score dial, and one
// game's story. Reduced motion: no drifting wall, no reordering slide, the story jumps to its end.
import { initHowItWorks } from "../../../../shared/ui/how-it-works.js";
import { buildIndex, search } from "../../../../shared/vault-search.js";
import { coverHtml } from "../../../../shared/ui/cover.js";
import { dialHtml, initDials } from "../../../../shared/ui/dial.js";
import { litText } from "../../../../shared/ui/cmd.js";
import { initCountUp } from "../../../../shared/ui/count-up.js";
import { loadVault, type VCard } from "./data";
import { esc, badge, STATUS } from "./ui";
import { I } from "./art";

const root = document.querySelector<HTMLElement>("[data-vh]");
const reduce = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const mascot = () => document.getElementById("bt-mascot-tpl")?.innerHTML ?? "";

if (root) {
  initHowItWorks(root);
  initDials(root);
  root.querySelectorAll<HTMLElement>("[data-vh-mascot]").forEach((m) => { m.innerHTML = mascot(); });
  void boot();
}

let index: any = null;
let games: VCard[] = [];

async function boot() {
  try {
    games = (await loadVault()).games;
  } catch (err) {
    console.warn("vault how: the summary didn't load", err);
    games = [];
  }
  index = games.length ? buildIndex(games) : null;
  counts();
  wall();
  covers();
  wants();
  runSearch(root!.querySelector<HTMLInputElement>("[data-vhq]")!.value);
}

// ---------- hero: counts and the cover wall (H2) ----------
function counts() {
  const box = root!.querySelector<HTMLElement>("[data-vh-counts]")!;
  const n = [[games.length, "games in the Vault"], [games.filter((g) => g.status === "finished").length, "finished"], [games.filter((g) => g.tags.includes("VR")).length, "played in VR"]] as const;
  const shown = n.filter(([v]) => v > 0);
  if (!shown.length) return;
  box.innerHTML = shown.map(([v, l]) => `<div><b data-count-to="${v}">${v}</b><small>${l}</small></div>`).join("");
  box.hidden = false;
  initCountUp(box);
}
function wall() {
  const box = root!.querySelector<HTMLElement>("[data-vh-wall]")!;
  const withArt = games.filter((g) => g.cover);
  if (withArt.length < 8) return;   // too few to make a wall: the hero stays plain
  box.innerHTML = [0, 1, 2, 3].map((c) => {
    const col = withArt.filter((_, i) => i % 4 === c);
    const loop = [...col, ...col, ...col, ...col];   // twice the height it scrolls, so the drift never shows a gap
    return `<div class="vh-wall-col">${loop.map((g) => coverHtml(g.cover, { alt: "", size: "sm" })).join("")}</div>`;
  }).join("");
}

// ---------- real covers in the scenes ----------
function covers() {
  const withArt = games.filter((g) => g.cover);
  if (!withArt.length) return;
  const used = new Set<string>();
  const pick = (want: string) => {
    const [kind, nth] = want.split(":");
    const pool = kind === "any" ? withArt : withArt.filter((g) => g.status === kind);
    const fresh = (pool.length ? pool : withArt).filter((g) => !used.has(g.slug));
    const g = fresh[Number(nth) || 0] || fresh[0] || withArt[0];
    used.add(g.slug);
    return g;
  };
  root!.querySelectorAll<HTMLElement>("[data-vh-cover]").forEach((slot) => {
    const g = pick(slot.dataset.vhCover || "any");
    const over = [...slot.children].filter((c) => !c.hasAttribute("data-vh-mascot")).map((c) => c.outerHTML).join("");
    const cls = [...slot.classList].filter((c) => c !== "bt-cover").join(" ");
    slot.outerHTML = coverHtml(g.cover, { cls, alt: "", over });
    if (slot.dataset.vhCover === "any:2") {   // the story's game
      const t = root!.querySelector<HTMLElement>("[data-tick-title]");
      if (t) t.textContent = `${g.title}:`;
    }
  });
}

// ---------- 02 the search, on the real Vault ----------
function runSearch(q: string) {
  const res = root!.querySelector<HTMLElement>("[data-vhres]")!;
  const url = root!.querySelector<HTMLAnchorElement>("[data-vhurl]")!;
  const query = q.trim();
  url.href = query ? `/games?q=${encodeURIComponent(query)}` : "/games";
  url.querySelector("[data-vhurl-q]")!.textContent = query ? `?q=${encodeURIComponent(query).replace(/%20/g, "+")}` : "";
  root!.querySelectorAll<HTMLButtonElement>("[data-vht]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.vht === query)));
  if (!index) { res.innerHTML = `<div class="vh-none">${games.length ? "" : "The Vault didn't load. Try the search on the Vault itself."}</div>`; return; }
  if (!query) { res.innerHTML = '<div class="vh-none">Type a game, a developer or a tag.</div>'; return; }
  const hits = search(index, query, { limit: 4 }) as { game: VCard; lit: number[] }[];
  res.innerHTML = hits.length
    ? hits.map(({ game: g, lit }) => `<a class="bt-cmd-item" href="/games/${encodeURIComponent(g.slug)}">${coverHtml(g.cover, { cls: "bt-cover--sm", size: "sm", alt: "" })}<b>${litText(g.title, lit, esc)}</b><small>${esc(g.developers[0] || "")}</small>${badge(g.status)}</a>`).join("")
    : `<div class="vh-none">Nothing in the Vault for “${esc(query)}”. On the Vault, that turns into <b>Add “${esc(query)}”</b>.</div>`;
}

// ---------- 04 Most wanted (try it): local, nothing is saved ----------
interface MW { slug: string; title: string; cover: VCard["cover"]; by: string | null; n: number }
let mw: MW[] = [];
const mine = new Set<string>();
function wants() {
  const wish = games.filter((g) => g.status === "wishlist").sort((a, b) => b.wanted - a.wanted || (b.added || 0) - (a.added || 0));
  const rest = games.filter((g) => g.status !== "wishlist" && g.cover);
  const four = [...wish, ...rest].slice(0, 4);
  mw = four.map((g, i) => ({ slug: g.slug, title: g.title, cover: g.cover, by: g.by, n: 4 - i }));
  drawWants();
}
function drawWants(bumped = "") {
  const box = root!.querySelector<HTMLElement>("[data-mwlist]")!;
  if (!mw.length) { box.innerHTML = '<p class="vh-none">The Vault didn\'t load.</p>'; return; }
  const before = new Map([...box.querySelectorAll<HTMLElement>("[data-mw]")].map((el) => [el.dataset.mw!, el.getBoundingClientRect().top]));
  const list = [...mw].sort((a, b) => b.n - a.n);
  box.innerHTML = list.map((m, i) => `<div class="vh-mw-row" data-mw="${esc(m.slug)}"><span class="vh-mw-rank" style="--rk:${i < 3 ? `var(--bt-rank-${i + 1})` : "var(--bt-text-faint)"}" aria-label="Number ${i + 1}">${i + 1}</span>${coverHtml(m.cover, { alt: "", size: "sm" })}<span><b>${esc(m.title)}</b><small>${m.n} want it${m.by ? ` · picked by @${esc(m.by)}` : ""}</small></span><button type="button" class="bt-btn bt-btn--secondary bt-btn--sm" data-want="${esc(m.slug)}" aria-pressed="${mine.has(m.slug)}">${I.heart}${mine.has(m.slug) ? "Wanted" : "I want this too"}</button></div>`).join("");
  box.querySelectorAll<HTMLElement>("[data-mw]").forEach((el) => {
    const d = (before.get(el.dataset.mw!) ?? 0) - el.getBoundingClientRect().top;
    if (!reduce() && before.size && d) el.animate([{ transform: `translateY(${d}px)` }, { transform: "none" }], { duration: 450, easing: "cubic-bezier(.2,.7,.2,1)" });
    if (el.dataset.mw === bumped && !reduce()) el.classList.add("is-bump");
  });
  if (bumped) box.querySelector<HTMLElement>(`[data-want="${CSS.escape(bumped)}"]`)?.focus();
}

// ---------- 07 one game's story ----------
const STORY = [
  { x: "16.66%", st: "wishlist", streams: 0, hours: 0, cap: "Added to the Vault. Members start wanting it." },
  { x: "50%", st: "playing", streams: 1, hours: 2, cap: "Boomer streams it. Every stream adds to its count and hours, automatically." },
  { x: "50%", st: "playing", streams: 2, hours: 5, cap: "Boomer streams it. Every stream adds to its count and hours, automatically." },
  { x: "50%", st: "playing", streams: 3, hours: 8, cap: "Boomer streams it. Every stream adds to its count and hours, automatically." },
  { x: "83.33%", st: "finished", streams: 3, hours: 8, cap: "He beats it. It moves to Finished and can get his score and review." },
] as const;
let storyT = 0;
function paintStory(i: number) {
  const s = STORY[i], track = root!.querySelector<HTMLElement>("[data-track]")!;
  track.querySelector<HTMLElement>("[data-lane]")!.style.setProperty("--x", s.x);
  track.querySelectorAll<HTMLElement>("[data-node]").forEach((n) => n.classList.toggle("is-lit", n.dataset.node === s.st));
  const set = (k: string, v: string) => { track.querySelector(`[data-tick-${k}]`)!.textContent = v; };
  set("status", STATUS[s.st][0]); set("streams", String(s.streams)); set("hours", `${s.hours} h`); set("cap", s.cap);
  track.querySelector("[data-trk]")!.textContent = i === STORY.length - 1 ? "↺ Play again" : i === 0 ? "▶ Play the story" : "Playing…";
}
function playStory() {
  clearTimeout(storyT);
  if (reduce()) { paintStory(STORY.length - 1); return; }
  let i = 0;
  paintStory(0);
  const next = () => { i++; paintStory(i); if (i < STORY.length - 1) storyT = window.setTimeout(next, 900); };
  storyT = window.setTimeout(next, 400);
}

// ---------- events ----------
root?.addEventListener("input", (e) => {
  const el = e.target as HTMLInputElement;
  if (el.matches("[data-vhq]")) runSearch(el.value);
});
root?.addEventListener("click", (e) => {
  const t = e.target as Element;
  const tip = t.closest<HTMLButtonElement>("[data-vht]");
  if (tip) { const inp = root!.querySelector<HTMLInputElement>("[data-vhq]")!; inp.value = tip.dataset.vht!; runSearch(inp.value); return; }
  const w = t.closest<HTMLButtonElement>("[data-want]");
  if (w) {
    const m = mw.find((x) => x.slug === w.dataset.want);
    if (!m) return;
    if (mine.has(m.slug)) { mine.delete(m.slug); m.n--; } else { mine.add(m.slug); m.n++; }
    drawWants(m.slug);
    return;
  }
  const s = t.closest<HTMLButtonElement>("[data-vhs]");
  if (s) {
    root!.querySelectorAll<HTMLButtonElement>("[data-vhs]").forEach((b) => { const on = b === s; b.classList.toggle("is-active", on); b.setAttribute("aria-pressed", String(on)); });
    const box = root!.querySelector<HTMLElement>("[data-vhdial]")!;
    box.innerHTML = dialHtml(Number(s.dataset.vhs), { caption: "" });
    if (reduce()) box.querySelector("[data-dial]")?.classList.add("is-in");
    else requestAnimationFrame(() => requestAnimationFrame(() => box.querySelector("[data-dial]")?.classList.add("is-in")));
    root!.querySelector("[data-vhverdict]")!.textContent = `“${s.dataset.verdict}”`;
    return;
  }
  if (t.closest("[data-trk]")) playStory();
});
