// site/src/scripts/base-camp/kind-words-admin.ts — /admin/kind-words (docs/specs/base-camp.md "Kind Words engine", Admin). Admins read every card
// (the rules allow it) and the private review note (private/review: the reject note and the crew name-check hit). Tabs in ?tab= (pending | approved
// | hidden | rejected), board in ?board= (all | newfoundland | skipper). Approve stamps POSTED and the card leaves the queue; Reject asks for an
// optional private note (the author never sees it); Feature / Unfeature on approved cards; Hide on pending or approved ones. Every change goes
// through kindReview; nothing is ever deleted. Display gating only: the callable checks admin on the server.
import { whenReady } from "../../lib/auth";
import { messageFor } from "../../lib/errors";
import { db, doc, getDoc, collection, getDocs, query, where, getCount, limit, SITE_ID } from "../../lib/db";
import { confirmAction } from "../../../../shared/ui/confirm.js";
import { toast } from "../../../../shared/ui/toast.js";
import { SHIELD_ICON } from "../../../../shared/ui/admin-menu.js";
import { cardHtml, type Card, type Board } from "./kind-words";
import { puffinArt } from "./kind-words-art";
import { esc, RM } from "./ui";

const root = document.querySelector<HTMLElement>("[data-kwa]");
type Tab = "pending" | "approved" | "hidden" | "rejected";
const TABS: [Tab, string][] = [["pending", "Pending"], ["approved", "Approved"], ["hidden", "Hidden"], ["rejected", "Rejected"]];
const BOARD_NAMES: Record<Board, string> = { newfoundland: "Newfoundland", skipper: "Skipper" };
const ms = (t: Card["createdAt"]) => (t == null ? 0 : typeof t === "number" ? t : t.toMillis?.() ?? 0);
const ago = (t: number) => {
  if (!t) return "just now";
  const m = Math.round((Date.now() - t) / 60000);
  if (m < 1) return "just now"; if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60); if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24); return d === 1 ? "Yesterday" : `${d} days ago`;
};

const params = new URLSearchParams(location.search);
let tab: Tab = (TABS.some(([t]) => t === params.get("tab")) ? params.get("tab") : "pending") as Tab;
let board: Board | "all" = (["newfoundland", "skipper"].includes(params.get("board") || "") ? params.get("board") : "all") as Board | "all";
let cards: (Card & { review?: { rejectNote?: string | null; nameFlag?: { handle?: string | null } | null } })[] = [];
let counts: Record<Tab, number> = { pending: 0, approved: 0, hidden: 0, rejected: 0 };

whenReady().then(async (s) => {
  if (!root) return;
  if (!s.user || !s.isAdmin) {
    root.innerHTML = `<div class="bt-empty"><p class="bt-empty-title">Admins only</p><p>The Kind words queue is for the site's admins.</p><a class="bt-btn bt-btn--secondary" href="/">Back to the site</a></div>`;
    return;
  }
  shell();
  await load();
});

function shell() {
  root!.innerHTML = `<div class="kwa">
    <header class="kwa-hero"><div><span class="bt-admin-tag">${SHIELD_ICON}Admin only</span><h1 class="bt-title">Kind words</h1><p>Read every postcard and note before it goes up. Approved ones appear on Base Camp right away.</p></div>${puffinArt({ cls: "kwa-puffin" })}</header>
    <div class="kwa-bar">
      <div class="bt-pills" role="tablist" aria-label="Queue" style="grid-template-columns:repeat(4,auto);width:fit-content">${TABS.map(([t, l]) => `<button type="button" role="tab" data-tab="${t}" aria-selected="${t === tab}" class="${t === tab ? "is-on" : ""}">${l} <span class="bt-pills-n" data-n="${t}">…</span></button>`).join("")}</div>
      <div class="kwa-chips" role="group" aria-label="Board">${[["all", "All boards"], ["newfoundland", "Newfoundland"], ["skipper", "Skipper"]].map(([b, l]) => `<button type="button" class="bt-chip${b === board ? " is-on" : ""}" aria-pressed="${b === board}" data-board="${b}">${l}</button>`).join("")}</div>
    </div>
    <div data-kwa-list></div>
  </div>`;
  root!.addEventListener("click", onClick);
}

function sync() {
  const url = new URL(location.href);
  url.searchParams.set("tab", tab);
  if (board === "all") url.searchParams.delete("board"); else url.searchParams.set("board", board);
  history.replaceState(history.state, "", url);
  root!.querySelectorAll<HTMLElement>("[data-tab]").forEach((b) => { const on = b.dataset.tab === tab; b.classList.toggle("is-on", on); b.setAttribute("aria-selected", String(on)); });
  root!.querySelectorAll<HTMLElement>("[data-board]").forEach((b) => { const on = b.dataset.board === board; b.classList.toggle("is-on", on); b.setAttribute("aria-pressed", String(on)); });
}

async function load() {
  const list = root!.querySelector<HTMLElement>("[data-kwa-list]")!;
  list.innerHTML = `<div class="bt-skeleton" style="height:160px"></div>`;
  sync();
  try {
    const col = collection(db, "sites", SITE_ID, "kindWords");
    const scoped = (st: Tab) => (board === "all" ? query(col, where("status", "==", st)) : query(col, where("status", "==", st), where("board", "==", board)));
    const [snap, ...ns] = await Promise.all([getDocs(query(scoped(tab), limit(200))), ...TABS.map(([t]) => getCount(scoped(t)))]);
    TABS.forEach(([t], i) => { counts[t] = ns[i].data().count; });
    cards = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Card).sort((a, b) => (tab === "pending" ? ms(a.createdAt) - ms(b.createdAt) : ms(b.createdAt) - ms(a.createdAt)));
    // the private half: who flagged it, and the reject note (admins only)
    await Promise.all(cards.filter((c) => (c as any).flagged || tab === "rejected").map(async (c) => {
      const r = await getDoc(doc(db, "sites", SITE_ID, "kindWords", c.id, "private", "review"));
      if (r.exists()) (c as any).review = r.data();
    }));
    render();
  } catch (err) {
    console.warn("kind words admin: couldn't load", err);
    list.innerHTML = `<div class="bt-empty"><p class="bt-empty-title">Couldn't load the queue</p><p>${esc(messageFor(err))}</p><button type="button" class="bt-btn bt-btn--secondary" data-retry>Try again</button></div>`;
  }
}

function render() {
  TABS.forEach(([t]) => { const el = root!.querySelector<HTMLElement>(`[data-n="${t}"]`); if (el) el.textContent = String(counts[t]); });
  const list = root!.querySelector<HTMLElement>("[data-kwa-list]")!;
  if (!cards.length) {
    list.innerHTML = tab === "pending"
      ? `<div class="bt-empty kwa-empty">${puffinArt({ cls: "kwa-puffin", fish: false })}<p class="bt-empty-title">All caught up</p><p>Every postcard and note has been read. The puffin is having a nap.</p></div>`
      : `<div class="bt-empty kwa-empty"><p class="bt-empty-title">Nothing here</p><p>No ${tab} cards${board === "all" ? "" : ` on ${BOARD_NAMES[board]}`}.</p></div>`;
    return;
  }
  list.innerHTML = `<div class="kwa-list">${cards.map((c, i) => {
    const flag = (c as any).flagged ? `<span class="bt-badge bt-badge--amber">Names ${c.review?.nameFlag?.handle ? `@${esc(c.review.nameFlag.handle)}` : "someone on the crew"}</span>` : "";
    const note = tab === "rejected" && c.review?.rejectNote ? `<span class="kwa-note">Private note: ${esc(c.review.rejectNote)}</span>` : "";
    const acts = [
      ["pending", "rejected", "hidden"].includes(c.status) ? `<button type="button" class="bt-btn bt-btn--admin bt-btn--sm" data-act="approve" data-id="${esc(c.id)}">Approve</button>` : "",
      ["pending", "approved"].includes(c.status) ? `<button type="button" class="bt-btn bt-btn--secondary bt-btn--sm" data-act="reject" data-id="${esc(c.id)}">Reject</button>` : "",
      c.status === "approved" ? `<button type="button" class="bt-btn bt-btn--ghost bt-btn--sm" data-act="${c.featured ? "unfeature" : "feature"}" data-id="${esc(c.id)}">${c.featured ? "★ Unfeature" : "☆ Feature"}</button>` : "",
      ["pending", "approved"].includes(c.status) ? `<button type="button" class="bt-btn bt-btn--ghost bt-btn--sm" data-act="hide" data-id="${esc(c.id)}">Hide</button>` : "",
    ].join("");
    return `<article class="kwa-item" data-item="${esc(c.id)}">
      <div class="kwa-card">${cardHtml(c, i, { admin: true })}</div>
      <div class="kwa-side"><div class="kwa-meta"><b>@${esc(c.handle || "member")}</b><span>${esc(BOARD_NAMES[c.board])} · ${esc(c.connection)}${c.place ? ` · ${esc(c.place)}` : ""}</span><span class="bt-meta">Sent ${esc(ago(ms(c.createdAt)))}</span>${flag}${note}</div>
      <div class="kwa-acts">${acts}</div></div>
      <span class="kwa-stamped" aria-hidden="true">POSTED</span>
    </article>`;
  }).join("")}</div>`;
}

async function review(id: string, action: string, note?: string) {
  const { call } = await import("../../lib/call");
  return call<{ status: string; featured: boolean }>("kindReview", { id, action, ...(note ? { note } : {}) });
}

async function onClick(e: Event) {
  const t = (e.target as Element).closest<HTMLElement>("[data-tab], [data-board], [data-act], [data-retry]");
  if (!t) return;
  if (t.dataset.tab) { tab = t.dataset.tab as Tab; void load(); return; }
  if (t.dataset.board) { board = t.dataset.board as Board | "all"; void load(); return; }
  if (t.matches("[data-retry]")) { void load(); return; }
  const id = t.dataset.id!, act = t.dataset.act!;
  const item = root!.querySelector<HTMLElement>(`[data-item="${CSS.escape(id)}"]`);
  if (act === "reject") {
    await confirmAction({
      title: "Reject it?", message: "It won't go up. The author sees a quiet \"Not posted\", never your note.", confirmLabel: "Reject", busyLabel: "Rejecting…", feature: "kind-words",
      bodyHtml: `<div class="bt-field kwa-reject"><label class="bt-label" for="kwa-note">Private note <span class="bt-hint">(optional, admins only)</span></label><textarea class="bt-textarea" id="kwa-note" maxlength="300" rows="3" placeholder="Why, for the other admins"></textarea></div>`,
      onConfirm: async (m: HTMLElement) => { await review(id, "reject", m.querySelector<HTMLTextAreaElement>("#kwa-note")!.value.trim()); },
    }).then((ok) => { if (ok) { toast("Rejected."); void load(); } });
    return;
  }
  const btns = item ? [...item.querySelectorAll<HTMLButtonElement>("button")] : [];
  btns.forEach((b) => (b.disabled = true));
  try {
    await review(id, act);
    if (act === "approve" && item) {
      item.classList.add("is-approved");
      toast("Posted.");
      setTimeout(() => { item.classList.add("is-leaving"); setTimeout(() => void load(), RM() ? 0 : 400); }, RM() ? 600 : 1100);
      return;
    }
    toast(act === "feature" ? "Featured." : act === "unfeature" ? "No longer featured." : "Hidden.");
    void load();
  } catch (err) {
    toast(messageFor(err), { kind: "error" });
    btns.forEach((b) => (b.disabled = false));
  }
}
