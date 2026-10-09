// /admin/stash: Cloud Stash's tool page (docs/specs/cloud-stash.md §8; mockup P2 Overview and tabs). Draws the hero, banners, tabs and the active tab from the store, wires every
// [data-cs] control, lazily reads the item titles of the rows on screen, and plays the moments (a purged row falls away, the "all clean" confetti). Admins only; layout.ts decides.
import { onAccess } from "./layout";
import { S, load, itemOf, refreshUsage, scanNow } from "./store";
import { tierOf, isPreview } from "./gate";
import { F, TABS, hero, banners, tabsHtml, body, filteredAssets } from "./render";
import { hooks, openFile, purgeOne, purgeLoose, sweepDialog, openRuleEditor, toggleRule, deleteRule, openSettings, openUntracked } from "./dialogs";
import { reduce, esc } from "./ui";
import { toast } from "../../../../shared/ui/toast.js";
import { messageFor } from "../../lib/errors";
import { IC } from "./art";
import { titleCache } from "./render";

const root = document.querySelector<HTMLElement>("[data-cs-root]");
let confettiDone = false;

function tabFromUrl() {
  const t = new URLSearchParams(location.search).get("tab");
  return TABS.some(([k]) => k === t) ? t! : "overview";
}

function confetti() {
  const host = root?.querySelector<HTMLElement>("[data-confetti]");
  if (!host || confettiDone || reduce()) return;
  confettiDone = true;
  const cols = ["var(--bt-lime)", "var(--bt-title)", "var(--bt-primary-soft)", "var(--bt-teal)"];
  const wrap = document.createElement("span");
  wrap.className = "cs-confetti";
  wrap.setAttribute("aria-hidden", "true");
  wrap.innerHTML = Array.from({ length: 14 }, (_, i) => `<i style="--c:${cols[i % cols.length]};--d:${(i * 0.07).toFixed(2)}s;left:${6 + i * 6.5}%"></i>`).join("");
  host.appendChild(wrap);
  setTimeout(() => wrap.remove(), 2400);
}

/** Item titles for the rows on screen (one read each, cached), so a row says "Login button is cut off", not a file name. */
function fillTitles() {
  root?.querySelectorAll<HTMLElement>(".cs-file[data-id]").forEach((row) => {
    const a = S.snap?.assets.find((x) => x.id === row.dataset.id);
    if (!a || titleCache.has(a.id)) { if (a && titleCache.has(a.id)) setTitle(row, titleCache.get(a.id)!, ""); return; }
    void itemOf(a).then((it) => {
      if (!it) return;
      titleCache.set(a.id, it.title);
      if (row.isConnected) setTitle(row, it.title, it.kind);
    });
  });
}
function setTitle(row: HTMLElement, title: string, kind: string) {
  const t = row.querySelector<HTMLElement>("[data-title]"), k = row.querySelector<HTMLElement>("[data-kind]");
  if (t) t.textContent = title;
  if (k && kind) k.textContent = kind;
}

export function draw() {
  if (!root) return;
  const keep = document.activeElement instanceof HTMLElement ? document.activeElement.getAttribute("data-keep") : null;
  root.innerHTML = `${hero()}<div class="cs-body">${S.loaded && !S.error ? banners() : ""}${tabsHtml()}<div class="cs-tabbody" data-tabbody>${body()}</div></div>`;
  const scan = document.querySelector<HTMLElement>('[data-cs="scan"]');
  if (scan) scan.hidden = !S.loaded || S.error;
  fillTitles();
  confetti();
  if (keep) root.querySelector<HTMLElement>(`[data-keep="${keep}"]`)?.focus();
}

/** Redraw only the list part (the search box keeps focus while you type). */
function drawFiles() {
  const slot = root?.querySelector<HTMLElement>("[data-tabbody]");
  if (!slot) return;
  const search = slot.querySelector<HTMLInputElement>("[data-cs-search]");
  const pos = search?.selectionStart ?? null, hadFocus = document.activeElement === search;
  slot.innerHTML = body();
  fillTitles();
  if (hadFocus) { const s = slot.querySelector<HTMLInputElement>("[data-cs-search]"); s?.focus(); if (s && pos != null) s.setSelectionRange(pos, pos); }
}

async function fall(ids: string[]) {
  if (reduce()) return;
  const rows = ids.map((id) => root?.querySelector<HTMLElement>(`.cs-file[data-id="${CSS.escape(id)}"]`)).filter(Boolean) as HTMLElement[];
  if (!rows.length) return;
  rows.forEach((r) => r.classList.add("is-gone"));
  await new Promise((r) => setTimeout(r, 560));
}

function setTab(tab: string, push = true) {
  F.tab = tab;
  if (push) { const u = new URL(location.href); u.searchParams.set("tab", tab); history.pushState({}, "", u); }
  draw();
}

let busy = false;
async function act(name: string, el: HTMLElement) {
  const id = el.dataset.id || "";
  switch (name) {
    case "tab": setTab(el.dataset.tab || "overview"); break;
    case "filter": F.filter = (el.dataset.filter || "all") as typeof F.filter; F.limit = 50; if (F.tab !== "files") setTab("files"); else draw(); break;
    case "more": F.limit += 50; drawFiles(); break;
    case "file": void openFile(id); break;
    case "purge": purgeOne(id); break;
    case "purge-loose": purgeLoose(); break;
    case "untracked": openUntracked(); break;
    case "sweep": sweepDialog(); break;
    case "settings": openSettings(); break;
    case "rule": openRuleEditor(id || undefined); break;
    case "toggle": { const r = S.snap?.rules.find((x) => x.id === id); if (r) void toggleRule(r, el.getAttribute("aria-checked") !== "true"); break; }
    case "delete-rule": { const r = S.snap?.rules.find((x) => x.id === id); if (r) void deleteRule(r); break; }
    case "retry": await start(); break;
    case "refresh": case "scan": {
      if (busy) return;
      busy = true;
      const btns = [...document.querySelectorAll<HTMLButtonElement>(`[data-cs="${name}"]`)];
      const labels = btns.map((b) => b.innerHTML);
      btns.forEach((b) => { b.disabled = true; b.innerHTML = `<span class="bt-spinner" aria-hidden="true"></span>${name === "scan" ? '<span class="bt-btn-label">Scanning…</span>' : "Refreshing…"}`; });
      try { if (name === "scan") await scanNow(); else await refreshUsage(); toast(name === "scan" ? "Scan done." : "Usage refreshed."); }
      catch (err) { toast(messageFor(err, name === "scan" ? "Couldn't scan. Try again in a bit." : "Couldn't refresh. Try again in a bit."), { kind: "error" }); }
      busy = false;
      btns.forEach((b, i) => { b.disabled = false; b.innerHTML = labels[i]; });
      draw();
      break;
    }
  }
}

async function start() {
  if (!root) return;
  S.loaded = false; S.error = false; draw();
  const tier = (await tierOf()) || "steward";
  await load(tier);
  draw();
}

if (root) {
  F.tab = tabFromUrl();
  hooks({ redraw: draw, fall });
  document.addEventListener("click", (e) => {
    const el = (e.target as Element).closest<HTMLElement>("[data-cs]");
    if (!el || el.closest(".bt-portal")) return;
    if (el.tagName === "A") e.preventDefault();
    // a button inside a clickable row (Purge, eye) acts for itself, not for the row
    if (el.dataset.cs === "file" && (e.target as Element).closest('[data-cs="purge"]')) return;
    void act(el.dataset.cs!, el);
  });
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    const el = (e.target as Element).closest<HTMLElement>('.cs-file[data-cs="file"]');
    if (el && e.target === el) { e.preventDefault(); void act("file", el); }
  });
  document.addEventListener("change", (e) => {
    const t = e.target as HTMLElement;
    if (t.matches("[data-cs-feat]")) { F.feat = (t as HTMLSelectElement).value; F.limit = 50; drawFiles(); }
    else if (t.matches("[data-cs-sort]")) { F.sort = (t as HTMLSelectElement).value; drawFiles(); }
  });
  let q = 0;
  document.addEventListener("input", (e) => {
    const t = e.target as HTMLInputElement;
    if (!t.matches("[data-cs-search]")) return;
    clearTimeout(q);
    q = window.setTimeout(() => { F.q = t.value; F.limit = 50; drawFiles(); }, 180);
  });
  window.addEventListener("popstate", () => { F.tab = tabFromUrl(); draw(); });
  onAccess(() => void start());
  void isPreview; void esc; void IC; void filteredAssets;
}
