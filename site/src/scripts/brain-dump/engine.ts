// Brain Dump's board engine (docs/specs/brain-dump.md §3), ported from the reference engine in docs/design/mockups/brain-dump.html, which
// ported the Bump Board prototype with its known gaps fixed. Same behavior; don't redesign it. Used by /brain-dump (a Firestore store,
// scripts/brain-dump/store.ts) and by How it works' practice board (no store: in memory, never saved).
//
//   const board = mount(root, { initial, store, on, mascot });
//     root     the board's markup (.bd-hero … .bd-grid … .bd-foot, pages/brain-dump/index.astro or the practice board)
//     initial  () => a saved board (migrated here) or null for the default board
//     store    { save(state) } called after every change, with a plain copy; omitted = in memory
//     on       (event) => void: "capture", "move", "check", "goal" (the practice board's Try this list)
//     mascot   the mascot's <svg> markup, for the empty Inbox
//   board.state() · board.replace(state) (another device's save) · board.isEditing() · board.setSaved(text)
//
// Undo instead of confirmations (kit toast with an Undo action, 6 s, one at a time). Item, title and goal edits commit on focusout (blur
// doesn't bubble); Enter commits. Paste is plain text. Dragging a card uses pointer events with a floating copy in a portal on <body>.
// The rules' limits are kept here too, so a save can't be refused: at most 40 categories, 300 Inbox items, a goal of 300 characters.
import { toast } from "../../../../shared/ui/toast.js";

export type Color = "ember" | "pink" | "gold" | "lime" | "teal" | "blue";
export type Size = "sm" | "wide" | "half";
export interface Item { id: string; text: string; done: boolean; starred: boolean }
export interface InboxItem { id: string; text: string }
export interface Category { id: string; title: string; color: Color; size: Size; placeholder: string; items: Item[] }
export interface BoardState { goal: string; goalDone: boolean; startDate: string; inbox: { items: InboxItem[] }; categories: Category[] }
export interface BoardStore { save(state: BoardState): void }
export interface MountOpts { initial?: () => unknown; store?: BoardStore | null; on?: (ev: string) => void; mascot?: string }
export interface BoardApi { state(): BoardState; replace(s: unknown): void; isEditing(): boolean; setSaved(text: string): void }

export const LIMITS = { categories: 40, inbox: 300, goal: 300 };
export const COLORS: Color[] = ["ember", "pink", "gold", "lime", "teal", "blue"];
const COLOR_NAMES: Record<Color, string> = { ember: "Ember", pink: "Pink", gold: "Gold", lime: "Lime", teal: "Teal", blue: "Blue" };
const TONE: Record<Color, string> = { ember: "var(--bd-ember)", pink: "var(--bt-pink)", gold: "var(--bt-gold)", lime: "var(--bt-lime)", teal: "var(--bt-teal)", blue: "var(--bt-blue)" };
const LEGACY: Record<string, Color> = { coral: "ember", plum: "pink", moss: "lime", sage: "teal", sky: "blue" };
// card sizes (§9a): S a third, M half, L full width; the size button cycles in this order
const SIZES: Size[] = ["sm", "half", "wide"];
const SIZE_NAME: Record<Size, string> = { sm: "Small", half: "Medium", wide: "Large" };
const SIZE_LETTER: Record<Size, string> = { sm: "S", half: "M", wide: "L" };
const SIZE_HINT: Record<Size, string> = { sm: "a third", half: "half", wide: "full width" };

const ICON = {
  grip: '<svg viewBox="0 0 16 16" aria-hidden="true"><g fill="currentColor"><circle cx="5.5" cy="3.5" r="1.4"/><circle cx="10.5" cy="3.5" r="1.4"/><circle cx="5.5" cy="8" r="1.4"/><circle cx="10.5" cy="8" r="1.4"/><circle cx="5.5" cy="12.5" r="1.4"/><circle cx="10.5" cy="12.5" r="1.4"/></g></svg>',
  up: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 10l4.5-4.5 4.5 4.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  down: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 6l4.5 4.5 4.5-4.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  x: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  starOff: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.8l1.9 3.9 4.3.6-3.1 3 .7 4.3L8 11.6l-3.8 2 .7-4.3-3.1-3 4.3-.6z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>',
  starOn: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.8l1.9 3.9 4.3.6-3.1 3 .7 4.3L8 11.6l-3.8 2 .7-4.3-3.1-3 4.3-.6z" fill="currentColor" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>',
};

export const uid = () => "id-" + Math.random().toString(36).slice(2, 10);
export function todayISO() { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); }
const esc = (s: unknown) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const cat = (title: string, color: Color, size: Size, placeholder: string): Category => ({ id: uid(), title, color, size, placeholder, items: [] });

export function defaultState(): BoardState {
  return {
    goal: "", goalDone: false, startDate: todayISO(), inbox: { items: [] },
    categories: [
      cat("I need to call", "ember", "sm", "Add someone to call…"),
      cat("I need to text", "pink", "sm", "Add someone to text…"),
      cat("I need to email", "gold", "sm", "Add an email to send…"),
      cat("I need to schedule", "lime", "sm", "Add something to schedule…"),
      cat("I need to follow through", "teal", "sm", "Add something to follow through on…"),
      cat("I need to speak with", "blue", "sm", "Add someone to speak with…"),
      cat("I want to research / look into / learn about", "ember", "wide", "Add something to look into…"),
      cat("I want to make / create", "gold", "wide", "Add something to make…"),
      cat("What I want to do", "lime", "half", "Add something you want to do…"),
      cat("Top priorities", "blue", "half", "Add a top priority…"),
    ],
  };
}

/** Any saved shape (this one, older ones, the prototype's) -> a board; missing or corrupt -> the default board. */
export function migrate(raw: unknown): BoardState {
  const s = raw as any;
  if (!s || typeof s !== "object" || !Array.isArray(s.categories)) return defaultState();
  const out: BoardState = {
    goal: typeof s.goal === "string" ? s.goal.slice(0, LIMITS.goal) : "",
    goalDone: !!s.goalDone,
    startDate: typeof s.startDate === "string" && s.startDate ? s.startDate.slice(0, 10) : todayISO(),
    inbox: { items: (Array.isArray(s.inbox?.items) ? s.inbox.items : []).filter((it: any) => it && typeof it.text === "string").map((it: any) => ({ id: String(it.id || uid()), text: it.text })) },
    categories: s.categories.filter((c: any) => c && typeof c === "object").map((c: any) => {
      const color: Color = LEGACY[c.color] || (COLORS.includes(c.color) ? c.color : "gold");
      return {
        id: String(c.id || uid()), title: typeof c.title === "string" && c.title ? c.title : "Untitled", color,
        size: SIZES.includes(c.size) ? c.size : "sm", placeholder: typeof c.placeholder === "string" && c.placeholder ? c.placeholder : "Add something…",
        items: (Array.isArray(c.items) ? c.items : []).filter((it: any) => it && typeof it.text === "string").map((it: any) => ({ id: String(it.id || uid()), text: it.text, done: it.done === true, starred: it.starred === true })),
      };
    }),
  };
  return out;
}

const shared = { portal: null as HTMLElement | null, n: 0, dismissToast: null as null | (() => void) };

export function mount(root: HTMLElement, opts: MountOpts = {}): BoardApi {
  const emit = (ev: string) => { try { opts.on?.(ev); } catch { /* a listener never breaks the board */ } };
  const mountId = ++shared.n;
  const MASCOT = opts.mascot || "";
  let state = migrate(opts.initial ? opts.initial() : null);
  const save = () => { opts.store?.save(JSON.parse(JSON.stringify(state))); };

  /* ---------- static shell ---------- */
  const $ = <T extends Element = HTMLElement>(sel: string) => root.querySelector<T>(sel)!;
  const grid = $(".bd-grid");
  const goalText = $(".bd-goal"), goalCheck = $<HTMLInputElement>(".bd-goal-check"), goalRow = $(".bd-goalrow");
  const startDate = $<HTMLInputElement>(".bd-started input");
  const searchInput = $<HTMLInputElement>(".bd-search-input"), starOnlyBtn = $(".bd-staronly");
  const captureForm = $<HTMLFormElement>(".bd-capture"), captureInput = $<HTMLInputElement>(".bd-capture input");
  const live = $(".bd-live");
  const savedEl = root.querySelector<HTMLElement>(".bd-saved");

  if (!shared.portal || !shared.portal.isConnected) {
    shared.portal = document.createElement("div");
    shared.portal.className = "bt-root bt-portal";
    shared.portal.dataset.feature = "brain-dump";
    document.body.appendChild(shared.portal);
  }
  const portal = shared.portal;
  let starOnly = false;

  const findCat = (id?: string) => state.categories.find((c) => c.id === id) || null;
  const findItem = (category: Category | null, id?: string) => (category ? category.items.find((it) => it.id === id) || null : null);
  const isRealCard = (el: Element | null): el is HTMLElement => !!el && el.classList.contains("bd-card") && !el.classList.contains("bd-card--inbox") && !el.classList.contains("bd-card--add");
  const catCards = () => Array.from(grid.children).filter(isRealCard);
  const cardFor = (id: string) => grid.querySelector<HTMLElement>(`.bd-card[data-cat-id="${CSS.escape(id)}"]`);
  const say = (msg: string) => { live.textContent = ""; setTimeout(() => { live.textContent = msg; }, 30); };

  /* ---------- toast with Undo: the kit's toast, one at a time ---------- */
  function showToast(message: string, undoFn: (() => void) | null, kind: "ok" | "info" = "ok") {
    shared.dismissToast?.();
    const dismiss = toast(message, { kind, ms: 6000, action: undoFn ? { label: "Undo", onClick: () => { undoFn(); say("Undone"); } } : null });
    const btns = document.querySelectorAll<HTMLElement>(".bt-toast-host [data-toast-action]");
    if (undoFn && btns.length) btns[btns.length - 1].dataset.pulse = "undo";
    shared.dismissToast = dismiss;
  }

  /* ---------- builders ---------- */
  function setStar(li: HTMLElement, on: boolean) {
    const b = li.querySelector<HTMLElement>(".bd-star")!;
    b.classList.toggle("is-on", on);
    b.innerHTML = on ? ICON.starOn : ICON.starOff;
    b.setAttribute("aria-pressed", String(on));
    li.classList.toggle("is-starred", on);
  }
  function itemEl(catId: string, item: Item) {
    const li = document.createElement("li");
    li.className = "bd-item" + (item.done ? " is-done" : "") + (item.starred ? " is-starred" : "");
    li.dataset.itemId = item.id; li.dataset.catId = catId;
    li.innerHTML =
      '<label class="bt-check"><input type="checkbox" class="bd-check" aria-label="Done"></label>' +
      '<span class="bd-text" contenteditable="true" spellcheck="true" role="textbox" aria-label="Item"></span>' +
      '<span class="bd-acts">' +
        '<button type="button" class="bd-ic bd-star" aria-pressed="false" aria-label="Star"></button>' +
        `<button type="button" class="bd-ic bd-ud bd-up" aria-label="Move up">${ICON.up}</button>` +
        `<button type="button" class="bd-ic bd-ud bd-down" aria-label="Move down">${ICON.down}</button>` +
        `<button type="button" class="bd-ic bd-x bd-del" aria-label="Delete item">${ICON.x}</button>` +
      "</span>";
    li.querySelector<HTMLInputElement>(".bd-check")!.checked = !!item.done;
    li.querySelector(".bd-text")!.textContent = item.text;
    setStar(li, item.starred);
    return li;
  }
  function refreshMoveButtons(card: HTMLElement) {
    const items = card.querySelectorAll(".bd-items > .bd-item");
    items.forEach((li, i) => {
      li.querySelector<HTMLButtonElement>(".bd-up")!.disabled = i === 0;
      li.querySelector<HTMLButtonElement>(".bd-down")!.disabled = i === items.length - 1;
    });
  }
  function updateCount(card: HTMLElement, category: Category) {
    const done = category.items.filter((it) => it.done).length;
    const el = card.querySelector(".bd-count")!;
    el.textContent = `${done}/${category.items.length}`;
    el.setAttribute("aria-label", `${done} of ${category.items.length} done`);
  }
  function rebuildItems(card: HTMLElement, category: Category) {
    const list = card.querySelector(".bd-items")!;
    list.innerHTML = "";
    category.items.forEach((it) => list.appendChild(itemEl(category.id, it)));
    refreshMoveButtons(card); updateCount(card, category);
  }
  function paintSize(card: HTMLElement, category: Category) {
    const b = card.querySelector<HTMLElement>(".bd-size")!, next = SIZES[(SIZES.indexOf(category.size) + 1) % SIZES.length];
    b.textContent = SIZE_LETTER[category.size];
    b.setAttribute("aria-label", `Card size: ${SIZE_NAME[category.size]}. Change to ${SIZE_NAME[next]}`);
    b.title = `Size: ${SIZE_NAME[category.size]} (tap to change)`;
  }
  function labelCard(card: HTMLElement, category: Category) {
    paintSize(card, category);
    card.querySelector(".bd-drag")!.setAttribute("aria-label", `Move ${category.title}. Drag, or press the arrow keys.`);
    card.querySelector(".bd-cat-del")!.setAttribute("aria-label", `Delete ${category.title}`);
    card.setAttribute("aria-label", category.title);
  }
  function cardEl(category: Category) {
    const card = document.createElement("article");
    card.className = `bd-card bd-card--${category.size}`;
    card.dataset.catId = category.id;
    card.style.setProperty("--bd-tone", TONE[category.color]);
    card.innerHTML =
      '<header class="bd-card-head">' +
        '<button type="button" class="bd-ic bd-drag" data-pulse="drag-card"></button>' +
        '<h2 class="bd-card-title" contenteditable="true" spellcheck="true" role="textbox" aria-label="Category name"></h2>' +
        '<span class="bd-count"></span>' +
        '<button type="button" class="bd-ic bd-size" data-pulse="card-size"></button>' +
        `<button type="button" class="bd-ic bd-x bd-cat-del" aria-label="Delete category">${ICON.x}</button>` +
      "</header>" +
      '<ul class="bd-items"></ul>' +
      '<form class="bd-add"><input class="bd-add-input" type="text" enterkeyhint="done" autocomplete="off"><button type="submit" class="bt-btn bt-btn--sm bt-btn--secondary" data-pulse="add-item">Add</button></form>';
    card.querySelector(".bd-drag")!.innerHTML = ICON.grip;
    card.querySelector(".bd-card-title")!.textContent = category.title;
    const input = card.querySelector<HTMLInputElement>(".bd-add-input")!;
    input.placeholder = category.placeholder;
    input.setAttribute("aria-label", category.placeholder.replace(/…$/, ""));
    labelCard(card, category);
    rebuildItems(card, category);
    return card;
  }

  /* inbox: the Move to… list is built fresh every time it's opened (known gap 1) */
  const moveOptionsHtml = () => '<option value="" selected disabled>Move to…</option>' +
    state.categories.map((c) => `<option value="${esc(c.id)}">${esc(c.title || "Untitled")}</option>`).join("");
  const refreshMoveSelect = (sel: HTMLSelectElement) => { if (sel.value) return; sel.innerHTML = moveOptionsHtml(); };
  const refreshAllMoveSelects = () => grid.querySelectorAll<HTMLSelectElement>(".bd-move select").forEach(refreshMoveSelect);
  function inboxItemEl(item: InboxItem) {
    const li = document.createElement("li");
    li.className = "bd-item"; li.dataset.itemId = item.id;
    li.innerHTML =
      '<span class="bd-text" contenteditable="true" spellcheck="true" role="textbox" aria-label="Captured thought"></span>' +
      '<span class="bd-move"><select class="bt-select" aria-label="Move to a category" data-pulse="inbox-move"></select></span>' +
      `<button type="button" class="bd-ic bd-x bd-del" aria-label="Delete captured thought">${ICON.x}</button>`;
    li.querySelector(".bd-text")!.textContent = item.text;
    li.querySelector("select")!.innerHTML = moveOptionsHtml();
    return li;
  }
  const inboxCard = () => grid.querySelector<HTMLElement>('[data-cat-id="inbox"]')!;
  function updateInboxCount(card = inboxCard()) {
    const n = state.inbox.items.length;
    card.querySelector(".bd-count")!.textContent = `${n} waiting`;
    card.querySelector<HTMLElement>(".bd-inbox-empty")!.hidden = n > 0;
  }
  function inboxCardEl() {
    const card = document.createElement("article");
    card.className = "bd-card bd-card--inbox bd-card--wide";
    card.dataset.catId = "inbox";
    card.setAttribute("aria-label", "Inbox");
    card.innerHTML =
      '<header class="bd-card-head"><h2 class="bd-card-title">Inbox</h2><span class="bd-count"></span></header>' +
      '<p class="bd-inbox-sub">Capture now, sort later.</p>' +
      '<ul class="bd-items"></ul>' +
      `<div class="bd-inbox-empty">${MASCOT}<span>Nothing waiting. When a thought pops up, drop it in Quick capture above.</span></div>`;
    const list = card.querySelector(".bd-items")!;
    state.inbox.items.forEach((it) => list.appendChild(inboxItemEl(it)));
    updateInboxCount(card);
    return card;
  }
  function rebuildInbox() {
    const card = inboxCard(), list = card.querySelector(".bd-items")!;
    list.innerHTML = "";
    state.inbox.items.forEach((it) => list.appendChild(inboxItemEl(it)));
    updateInboxCount(card);
  }

  /* add-category card */
  function addCardEl() {
    const card = document.createElement("article");
    card.className = "bd-card bd-card--add";
    const selected = COLORS[state.categories.length % COLORS.length];
    card.innerHTML =
      `<form><label class="bt-sr-only" for="bd-newcat-${mountId}">New category name</label>` +
      `<input class="bt-input" id="bd-newcat-${mountId}" type="text" placeholder="Name a new category…" autocomplete="off" enterkeyhint="done" maxlength="120">` +
      '<div class="bd-swatches" role="radiogroup" aria-label="Card color">' +
      COLORS.map((c) => `<button type="button" class="bd-swatch" role="radio" data-color="${c}" aria-checked="${c === selected}" tabindex="${c === selected ? 0 : -1}" aria-label="${COLOR_NAMES[c]}" style="--bd-tone:${TONE[c]}"></button>`).join("") +
      '</div><div class="bd-sizes" role="radiogroup" aria-label="Card size">' +
      SIZES.map((z) => `<button type="button" class="bt-chip bt-chip--small" role="radio" data-size="${z}" aria-checked="${z === "sm"}" tabindex="${z === "sm" ? 0 : -1}">${SIZE_LETTER[z]} · ${SIZE_HINT[z]}</button>`).join("") +
      '</div><button type="submit" class="bt-btn bt-btn--sm bt-btn--secondary" data-pulse="add-category">+ Add category</button></form>';
    const sw = card.querySelector<HTMLElement>(".bd-swatches")!, sz = card.querySelector<HTMLElement>(".bd-sizes")!;
    // a radio group: a click picks, the arrow keys move and pick (the swatches and the sizes work the same way)
    const radios = (group: HTMLElement, sel: string) => {
      const pick = (b: HTMLElement) => {
        group.querySelectorAll<HTMLElement>(sel).forEach((s) => { s.setAttribute("aria-checked", "false"); s.tabIndex = -1; });
        b.setAttribute("aria-checked", "true"); b.tabIndex = 0;
      };
      group.addEventListener("click", (e) => { const b = (e.target as Element).closest<HTMLElement>(sel); if (b) pick(b); });
      group.addEventListener("keydown", (e) => {
        if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) return;
        e.preventDefault();
        const all = Array.from(group.children) as HTMLElement[], i = all.indexOf(document.activeElement as HTMLElement);
        const n = all[(i + (e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 1) + all.length) % all.length];
        pick(n); n.focus();
      });
      return pick;
    };
    const pick = radios(sw, ".bd-swatch");
    radios(sz, "[data-size]");
    card.querySelector("form")!.addEventListener("submit", (e) => {
      e.preventDefault();
      const input = card.querySelector<HTMLInputElement>("input")!, name = input.value.replace(/\s+/g, " ").trim();
      if (!name) { input.focus(); return; }
      if (state.categories.length >= LIMITS.categories) { showToast(`A board holds up to ${LIMITS.categories} categories. Delete one to add another.`, null, "info"); return; }
      const color = sw.querySelector<HTMLElement>('[aria-checked="true"]')!.dataset.color as Color;
      const size = sz.querySelector<HTMLElement>('[aria-checked="true"]')!.dataset.size as Size;
      const c = cat(name, color, size, "Add something…");
      state.categories.push(c);
      save();
      grid.insertBefore(cardEl(c), card);
      refreshAllMoveSelects();
      input.value = "";
      pick(sw.querySelector<HTMLElement>(`[data-color="${COLORS[state.categories.length % COLORS.length]}"]`)!);
      applyFilters(); updateStats();
      say(`Added ${name}`);
    });
    return card;
  }

  function rebuildGrid() {
    grid.innerHTML = "";
    grid.appendChild(inboxCardEl());
    state.categories.forEach((c) => grid.appendChild(cardEl(c)));
    grid.appendChild(addCardEl());
    applyFilters();
  }
  function updateStats() {
    let total = 0, done = 0, starred = 0;
    state.categories.forEach((c) => { total += c.items.length; c.items.forEach((it) => { if (it.done) done++; if (it.starred) starred++; }); });
    $(".bd-stat-total").textContent = String(total);
    $(".bd-stat-done").textContent = String(done);
    $(".bd-stat-starred").textContent = String(starred);
  }
  function paintHeader() {
    goalText.textContent = state.goal || "";
    goalCheck.checked = !!state.goalDone;
    goalRow.classList.toggle("is-done", !!state.goalDone);
    startDate.value = state.startDate || todayISO();
  }

  /* ---------- editable text: plain-text paste (gap 2), Enter commits ---------- */
  root.addEventListener("paste", (e) => {
    const t = (e.target as Element).closest?.("[contenteditable]");
    if (!t) return;
    e.preventDefault();
    const text = (e.clipboardData?.getData("text/plain") || "").replace(/\s*[\r\n]+\s*/g, " ");
    if (!document.execCommand("insertText", false, text)) {
      const sel = window.getSelection(); if (!sel || !sel.rangeCount) return;
      const r = sel.getRangeAt(0); r.deleteContents(); r.insertNode(document.createTextNode(text)); r.collapse(false);
    }
  });
  root.addEventListener("drop", (e) => { if ((e.target as Element).closest?.("[contenteditable]")) e.preventDefault(); });

  goalText.addEventListener("focusout", () => {
    state.goal = (goalText.textContent || "").replace(/\s+/g, " ").trim().slice(0, LIMITS.goal);
    goalText.textContent = state.goal;
    save();
  });
  goalText.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); goalText.blur(); } });
  goalCheck.addEventListener("change", () => {
    state.goalDone = goalCheck.checked;
    goalRow.classList.toggle("is-done", state.goalDone);
    save();
    if (state.goalDone) { celebrate(); emit("goal"); }
  });
  startDate.addEventListener("change", () => { state.startDate = startDate.value || todayISO(); save(); });

  function celebrate() {
    say("Big goal done. Nice work!");
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const b = document.createElement("span");
    b.className = "bd-burst"; b.setAttribute("aria-hidden", "true");
    const cols = ["var(--bt-gold)", "var(--bd-ember)", "var(--bt-pink)", "var(--bt-teal)", "var(--bt-lime)", "var(--bt-blue)"];
    for (let i = 0; i < 12; i++) {
      const s = document.createElement("i");
      s.style.setProperty("--a", `${i * 30 + Math.random() * 14}deg`);
      s.style.setProperty("--c", cols[i % cols.length]);
      b.appendChild(s);
    }
    goalRow.appendChild(b);
    setTimeout(() => b.remove(), 900);
    const scene = root.querySelector<HTMLElement>(".bd-scene");
    if (scene) { scene.removeAttribute("data-hop"); void scene.offsetWidth; scene.setAttribute("data-hop", ""); }
  }

  captureForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const text = captureInput.value.replace(/\s+/g, " ").trim();
    if (!text) return;
    if (state.inbox.items.length >= LIMITS.inbox) { showToast(`The Inbox holds up to ${LIMITS.inbox} thoughts. Sort a few first.`, null, "info"); return; }
    const item = { id: uid(), text };
    state.inbox.items.push(item);
    save();
    inboxCard().querySelector(".bd-items")!.appendChild(inboxItemEl(item));
    updateInboxCount();
    captureInput.value = ""; captureInput.focus();
    emit("capture");
    say(`Captured. ${state.inbox.items.length} waiting in the Inbox.`);
  });

  /* ---------- drag cards (pointer events, auto-scroll near the edges: gap 4) ---------- */
  grid.addEventListener("pointerdown", (e) => {
    const handle = (e.target as Element).closest<HTMLElement>(".bd-drag");
    if (!handle || e.button > 0) return;
    const card = handle.closest<HTMLElement>(".bd-card");
    if (!isRealCard(card)) return;
    e.preventDefault();
    const startOrder = catCards().map((c) => c.dataset.catId).join();
    const rect = card.getBoundingClientRect();
    const ghost = card.cloneNode(true) as HTMLElement;
    ghost.classList.add("bd-ghost");
    ghost.removeAttribute("data-cat-id");
    ghost.querySelectorAll("[contenteditable]").forEach((n) => n.removeAttribute("contenteditable"));
    ghost.style.cssText += `;left:${rect.left}px;top:${rect.top}px;width:${rect.width}px;height:${rect.height}px;`;
    portal.appendChild(ghost);
    card.classList.add("is-drag-source");
    document.body.classList.add("bd-dragging");
    try { handle.setPointerCapture(e.pointerId); } catch { /* not every pointer can be captured */ }
    const startX = e.clientX, startY = e.clientY;
    let lastX = startX, lastY = startY, raf = 0;

    function place() {
      ghost.style.transform = `translate(${lastX - startX}px,${lastY - startY}px) rotate(1.5deg)`;
      const t = document.elementFromPoint(lastX, lastY);
      const tc = t?.closest(".bd-card") ?? null;
      if (tc && tc !== card && isRealCard(tc) && grid.contains(tc)) {
        const kids = Array.from(grid.children);
        if (kids.indexOf(card!) < kids.indexOf(tc)) grid.insertBefore(card!, tc.nextSibling);
        else grid.insertBefore(card!, tc);
      }
    }
    function tick() {
      const edge = 72;
      let v = 0;
      if (lastY < edge) v = -Math.ceil((edge - lastY) / 4);
      else if (lastY > window.innerHeight - edge) v = Math.ceil((lastY - (window.innerHeight - edge)) / 4);
      if (v) { window.scrollBy(0, v); place(); }
      raf = requestAnimationFrame(tick);
    }
    const onMove = (ev: PointerEvent) => { lastX = ev.clientX; lastY = ev.clientY; place(); };
    function onUp() {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      cancelAnimationFrame(raf);
      ghost.remove();
      card!.classList.remove("is-drag-source");
      document.body.classList.remove("bd-dragging");
      syncOrderFromDom();
      const nowOrder = catCards().map((c) => c.dataset.catId).join();
      if (nowOrder !== startOrder) { save(); refreshAllMoveSelects(); }
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    raf = requestAnimationFrame(tick);
  });
  function syncOrderFromDom() {
    const order = catCards().map((c) => c.dataset.catId);
    state.categories.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
  }

  /* ---------- delegated grid events ---------- */
  grid.addEventListener("submit", (e) => {
    const form = (e.target as Element).closest(".bd-add");
    if (!form) return;
    e.preventDefault();
    const card = form.closest<HTMLElement>(".bd-card")!, category = findCat(card.dataset.catId);
    const input = form.querySelector("input")!, text = input.value.replace(/\s+/g, " ").trim();
    if (!text || !category) return;
    const item: Item = { id: uid(), text, done: false, starred: false };
    category.items.push(item);
    card.querySelector(".bd-items")!.appendChild(itemEl(category.id, item));
    updateCount(card, category); refreshMoveButtons(card); updateStats(); save();
    input.value = ""; input.focus();
    applyFilters();
  });

  grid.addEventListener("change", (e) => {
    const target = e.target as HTMLInputElement;
    const li = target.closest<HTMLElement>(".bd-item");
    if (!li) return;
    if (target.classList.contains("bd-check")) {
      const card = target.closest<HTMLElement>(".bd-card")!, category = findCat(li.dataset.catId), item = findItem(category, li.dataset.itemId);
      if (!item || !category) return;
      item.done = target.checked;
      li.classList.toggle("is-done", item.done);
      updateCount(card, category); updateStats(); save();
      if (item.done) emit("check");
      return;
    }
    if (target.closest(".bd-move")) {
      const sel = target as unknown as HTMLSelectElement, targetId = sel.value;
      if (!targetId) return;
      const targetCat = findCat(targetId);
      if (!targetCat) { sel.innerHTML = moveOptionsHtml(); showToast("That category isn’t on the board anymore. Pick another.", null, "info"); return; }
      const idx = state.inbox.items.findIndex((it) => it.id === li.dataset.itemId);
      if (idx === -1) return;
      const thought = state.inbox.items.splice(idx, 1)[0];
      const newItem: Item = { id: thought.id, text: thought.text, done: false, starred: false };
      targetCat.items.push(newItem);
      li.remove(); updateInboxCount();
      const tc = cardFor(targetId)!;
      tc.querySelector(".bd-items")!.appendChild(itemEl(targetId, newItem));
      updateCount(tc, targetCat); refreshMoveButtons(tc); updateStats(); save(); applyFilters();
      say(`Moved to ${targetCat.title}`);
      emit("move");
    }
  });
  // rebuild the options right before the list opens (mouse, touch, keyboard)
  for (const type of ["pointerdown", "focusin", "keydown"]) {
    grid.addEventListener(type, (e) => { const s = (e.target as Element).closest?.<HTMLSelectElement>(".bd-move select"); if (s) refreshMoveSelect(s); }, true);
  }

  // commit edits on focusout (blur doesn't bubble); empty rules (gap 3)
  grid.addEventListener("focusout", (e) => {
    const t = e.target as HTMLElement;
    if (t.classList.contains("bd-text")) {
      const li = t.closest<HTMLElement>(".bd-item"); if (!li || !li.isConnected) return;
      const text = (t.textContent || "").replace(/\s+/g, " ").trim();
      if (li.dataset.catId) {
        const category = findCat(li.dataset.catId), item = findItem(category, li.dataset.itemId);
        if (!item) return;
        if (!text) { t.textContent = item.text; deleteItem(li, "Emptied"); return; }
        if (text !== item.text) { item.text = text; save(); }
        if (t.textContent !== text) t.textContent = text;
      } else {
        const thought = state.inbox.items.find((it) => it.id === li.dataset.itemId);
        if (!thought) return;
        if (!text) { t.textContent = thought.text; deleteInboxItem(li, "Emptied"); return; }
        if (text !== thought.text) { thought.text = text; save(); }
      }
      applyFilters();
      return;
    }
    if (t.classList.contains("bd-card-title")) {
      const card = t.closest<HTMLElement>(".bd-card")!, c = findCat(card.dataset.catId);
      if (!c) return;
      const title = (t.textContent || "").replace(/\s+/g, " ").trim();
      if (!title) { t.textContent = c.title; say("A category needs a name, so the old one is back."); return; }
      if (title !== c.title) { c.title = title; save(); labelCard(card, c); refreshAllMoveSelects(); }
      t.textContent = title;
      applyFilters();
    }
  });

  grid.addEventListener("keydown", (e) => {
    const t = e.target as HTMLElement;
    if (e.key === "Enter" && (t.classList.contains("bd-text") || t.classList.contains("bd-card-title"))) { e.preventDefault(); t.blur(); return; }
    if (t.classList.contains("bd-drag") && ["ArrowUp", "ArrowLeft", "ArrowDown", "ArrowRight"].includes(e.key)) {
      e.preventDefault();
      const card = t.closest<HTMLElement>(".bd-card")!, cards = catCards(), idx = cards.indexOf(card);
      const dir = e.key === "ArrowUp" || e.key === "ArrowLeft" ? -1 : 1, ti = idx + dir;
      if (ti < 0 || ti >= cards.length) { say(dir < 0 ? "Already first" : "Already last"); return; }
      if (dir < 0) grid.insertBefore(card, cards[ti]); else grid.insertBefore(card, cards[ti].nextSibling);
      syncOrderFromDom(); save(); refreshAllMoveSelects();
      t.focus();
      t.scrollIntoView({ block: "nearest" });
      say(`Moved to ${ti + 1} of ${cards.length}`);
    }
  });

  function deleteItem(li: HTMLElement, verb?: string) {
    const card = li.closest<HTMLElement>(".bd-card")!, category = findCat(li.dataset.catId);
    if (!category) return;
    const idx = category.items.findIndex((it) => it.id === li.dataset.itemId);
    if (idx === -1) return;
    const removed = category.items.splice(idx, 1)[0];
    li.remove(); updateCount(card, category); refreshMoveButtons(card); updateStats(); save(); applyFilters();
    showToast(`${verb || "Deleted"} “${removed.text}”`, () => {
      if (!findCat(category.id)) return;
      category.items.splice(Math.min(idx, category.items.length), 0, removed);
      const c = cardFor(category.id); if (c) rebuildItems(c, category);
      updateStats(); save(); applyFilters();
    });
  }
  function deleteInboxItem(li: HTMLElement, verb?: string) {
    const idx = state.inbox.items.findIndex((it) => it.id === li.dataset.itemId);
    if (idx === -1) return;
    const removed = state.inbox.items.splice(idx, 1)[0];
    li.remove(); updateInboxCount(); save();
    showToast(`${verb || "Deleted"} “${removed.text}”`, () => {
      state.inbox.items.splice(Math.min(idx, state.inbox.items.length), 0, removed);
      rebuildInbox(); save();
    });
  }

  grid.addEventListener("click", (e) => {
    const el = e.target as Element;
    const star = el.closest(".bd-star");
    if (star) {
      const li = star.closest<HTMLElement>(".bd-item")!, item = findItem(findCat(li.dataset.catId), li.dataset.itemId);
      if (!item) return;
      item.starred = !item.starred; setStar(li, item.starred);
      updateStats(); applyFilters(); save();
      return;
    }
    const ud = el.closest(".bd-up, .bd-down");
    if (ud) {
      const li2 = ud.closest<HTMLElement>(".bd-item")!, card = ud.closest<HTMLElement>(".bd-card")!, category = findCat(li2.dataset.catId);
      if (!category) return;
      const i = category.items.findIndex((it) => it.id === li2.dataset.itemId);
      const up = ud.classList.contains("bd-up"), j = up ? i - 1 : i + 1;
      if (i === -1 || j < 0 || j >= category.items.length) return;
      [category.items[i], category.items[j]] = [category.items[j], category.items[i]];
      if (up) li2.parentNode!.insertBefore(li2, li2.previousElementSibling);
      else li2.parentNode!.insertBefore(li2.nextElementSibling!, li2);
      refreshMoveButtons(card); save();
      const again = li2.querySelector<HTMLButtonElement>(up ? ".bd-up" : ".bd-down")!;
      (again.disabled ? li2.querySelector<HTMLButtonElement>(up ? ".bd-down" : ".bd-up")! : again).focus();
      return;
    }
    const del = el.closest(".bd-del");
    if (del) {
      const li3 = del.closest<HTMLElement>(".bd-item")!;
      if (li3.dataset.catId) deleteItem(li3); else deleteInboxItem(li3);
      return;
    }
    const szb = el.closest(".bd-size");
    if (szb) {
      const sc = szb.closest<HTMLElement>(".bd-card")!, scat = findCat(sc.dataset.catId);
      if (!scat) return;
      sc.classList.remove(`bd-card--${scat.size}`);
      scat.size = SIZES[(SIZES.indexOf(scat.size) + 1) % SIZES.length];
      sc.classList.add(`bd-card--${scat.size}`);
      paintSize(sc, scat); save(); say(`Card size: ${SIZE_NAME[scat.size]}`);
      return;
    }
    const cdel = el.closest(".bd-cat-del");
    if (cdel) {
      const card2 = cdel.closest<HTMLElement>(".bd-card")!;
      const ci = state.categories.findIndex((c) => c.id === card2.dataset.catId);
      if (ci === -1) return;
      const removedCat = state.categories.splice(ci, 1)[0];
      card2.remove(); updateStats(); save(); refreshAllMoveSelects();
      const n = removedCat.items.length;
      showToast(`Deleted “${removedCat.title}”${n ? ` and its ${n} item${n === 1 ? "" : "s"}` : ""}`, () => {
        state.categories.splice(Math.min(ci, state.categories.length), 0, removedCat);
        rebuildGrid(); updateStats(); save();
      });
    }
  });

  /* ---------- search + starred only ---------- */
  function applyFilters() {
    const q = searchInput.value.trim().toLowerCase();
    catCards().forEach((card) => {
      const category = findCat(card.dataset.catId);
      const titleMatch = q !== "" && (card.querySelector(".bd-card-title")!.textContent || "").toLowerCase().includes(q);
      let any = false;
      card.querySelectorAll<HTMLElement>(".bd-item").forEach((li) => {
        const item = findItem(category, li.dataset.itemId);
        const text = (li.querySelector(".bd-text")!.textContent || "").toLowerCase();
        const m = (q === "" || text.includes(q)) && (!starOnly || !!item?.starred);
        li.classList.toggle("is-hidden", !m);
        if (m) any = true;
      });
      if (titleMatch && !starOnly) { card.querySelectorAll(".bd-item").forEach((li) => li.classList.remove("is-hidden")); any = true; }
      card.classList.toggle("is-hidden", (q !== "" || starOnly) && !any);
    });
  }
  searchInput.addEventListener("input", applyFilters);
  starOnlyBtn.addEventListener("click", () => {
    starOnly = !starOnly;
    starOnlyBtn.setAttribute("aria-pressed", String(starOnly));
    applyFilters();
  });

  /* ---------- clear checked, reset ---------- */
  $(".bd-clear").addEventListener("click", () => {
    const removed: { cat: Category; item: Item; index: number }[] = [];
    state.categories.forEach((c) => c.items.forEach((it, i) => { if (it.done) removed.push({ cat: c, item: it, index: i }); }));
    if (!removed.length) { showToast("Nothing is checked off yet.", null, "info"); return; }
    state.categories.forEach((c) => { c.items = c.items.filter((it) => !it.done); });
    rebuildGrid(); updateStats(); save();
    showToast(`Cleared ${removed.length} checked`, () => {
      const by: Record<string, typeof removed> = {};
      removed.forEach((r) => { (by[r.cat.id] ||= []).push(r); });
      Object.keys(by).forEach((id) => {
        const c = findCat(id); if (!c) return;
        by[id].sort((a, b) => a.index - b.index).forEach((r) => c.items.splice(Math.min(r.index, c.items.length), 0, r.item));
      });
      rebuildGrid(); updateStats(); save();
    });
  });
  root.querySelector(".bd-reset")?.addEventListener("click", () => {
    const previous = JSON.parse(JSON.stringify(state)) as BoardState;
    state = defaultState();
    paintHeader(); rebuildGrid(); updateStats(); save();
    showToast("Board reset", () => { state = previous; paintHeader(); rebuildGrid(); updateStats(); save(); });
  });

  paintHeader(); rebuildGrid(); updateStats();

  let savedTimer = 0;
  return {
    state: () => state,
    /** Another device's save: redraw everything from it (never saves back). */
    replace(s: unknown) { state = migrate(s); paintHeader(); rebuildGrid(); updateStats(); },
    /** Something editable on the board has focus (so a remote change waits). */
    isEditing: () => { const a = document.activeElement; return !!a && root.contains(a) && (a.matches("[contenteditable], input, select") || !!a.closest("form")); },
    setSaved(text: string) {
      if (!savedEl) return;
      savedEl.textContent = text;
      clearTimeout(savedTimer);
      if (text === "Saved") savedTimer = window.setTimeout(() => { savedEl.textContent = ""; }, 1600);
    },
  };
}
