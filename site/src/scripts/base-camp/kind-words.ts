// site/src/scripts/base-camp/kind-words.ts — the Kind Words wall and composer (docs/specs/base-camp.md "Kind Words engine"), one engine for every
// board: mountKindWords(el) reads el.dataset.kindWords ("newfoundland" = Puffin Post postcards, "skipper" = Paw Notes pinned notes,
// "boomer" = Notes for Boomer on Mail Call: torn notebook pages with a gold margin and a mascot seal).
//   Wall      approved cards from sites/boomertanger/kindWords (featured first, then newest), 12 at a time with Load more. A signed-in author also
//             sees their own: pending shows "Under review" (teal) with Withdraw, rejected a quiet "Not posted" (never the reason). Empty state: the
//             puffin (Newfoundland) or the mascot (Skipper).
//   Composer  openModal() with the connection chips, an optional town (Newfoundland), the story with a live counter and a live preview; Send
//             calls kindSubmit. Sent moment: the puffin flies off with the postcard / the note gets pinned to the wall with the paw pin /
//             Boomer's note drops onto the pile.
//   Visitors  read the wall; the write button is a lock card that opens the Join free dialog (E1).
// Every piece of user text is escaped; nothing is ever rendered as HTML. Writes only through the callables.
import { onAuth, type AuthState } from "../../lib/auth";
import { messageFor } from "../../lib/errors";
import { openModal } from "../../../../shared/ui/modal.js";
import { announceOverlay } from "../../../../shared/ui/navgroup.js";
import { confirmAction } from "../../../../shared/ui/confirm.js";
import { toast } from "../../../../shared/ui/toast.js";
import { esc, lockCard, RM } from "./ui";
import { puffinArt, puffinHero, sentSky, stampMini, postmark, pawPin } from "./kind-words-art";

export type Board = "newfoundland" | "skipper" | "boomer";
export interface Card { id: string; board: Board; uid: string; handle: string | null; connection: string; place: string | null; text: string; status: string; featured?: boolean; createdAt?: { toMillis(): number } | number | null }

export const BOARDS: Record<Board, {
  title: [string, string]; heading: string; intro: string; write: string; send: string; connAsk: string; place: boolean; empty: string; subtitle: string;
  connections: string[]; sentTitle: string; sentText: string; lock: [string, string];
}> = {
  newfoundland: {
    title: ["PUFFIN", "POST"], heading: "Send a postcard to the Rock",
    intro: "Got a kind story about Newfoundland or a Newfoundlander, or just a few kind words? Send them in. Every one is read before it goes up.",
    write: "Write a postcard", send: "Send by puffin", connAsk: "How do you know the Rock?", place: true, empty: "No postcards yet",
    subtitle: "Share a kind story or a few kind words about Newfoundland or its people. Boomer reads every one before it goes up.",
    connections: ["I'm from here", "I live here now", "I've visited", "Never been, but…"],
    sentTitle: "It's on its way", sentText: "Your postcard is with the puffin. It goes up on the wall once Boomer has read it. Until then you'll see it there marked <b>Under review</b>.",
    lock: ["Sign in to send one", "Anyone can read these. Joining the Fan Club is free and lets you add yours."],
  },
  skipper: {
    title: ["PAW", "NOTES"], heading: "Leave a note for Skipper", intro: "",
    write: "Leave a note", send: "Pin it up", connAsk: "How do you know Skipper?", place: false, empty: "No notes yet",
    subtitle: "Tell her she's a good girl, share a story about your own dog, or just say hi. Boomer reads every note before it goes up.",
    connections: ["Watches her on stream", "Met her in person", "Corgi owner", "Just a fan"],
    sentTitle: "Pinned for Skipper", sentText: "Your note is up on the board for Boomer to read first. Once he has, everyone can see it. Until then it's marked <b>Under review</b> for you.",
    lock: ["Sign in to leave one", "Anyone can read these. Joining the Fan Club is free and lets you add yours."],
  },
  boomer: {
    title: ["NOTES", "FOR BOOMER"], heading: "Leave a note for Boomer", intro: "",
    write: "Leave a note", send: "Drop it in", connAsk: "How do you watch?", place: false, empty: "No notes yet",
    subtitle: "A thank-you, a favorite moment, or just hi. Boomer reads every note before it goes up.",
    connections: ["Watches on Twitch", "Watches on TikTok", "Watches on YouTube", "Fan Club member"],
    sentTitle: "On the pile", sentText: "Your note is on Boomer's desk with the rest of the mail. It goes up once he has read it. Until then it's marked <b>Under review</b> for you.",
    lock: ["Sign in to leave one", "Anyone can read these. Joining the Fan Club is free and lets you add yours."],
  },
};
const PAGE = 12, TEXT_MIN = 20, TEXT_MAX = 600, PLACE_MAX = 40;
const TILTS = [-1.2, 0.9, -0.5, 1.3, -1, 0.6];
const ms = (t: Card["createdAt"]) => (t == null ? 0 : typeof t === "number" ? t : t.toMillis?.() ?? 0);
const dayLabel = (t: number) => (t ? new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric" }).toUpperCase() : "TODAY");
const mascot = () => document.getElementById("bt-mascot-tpl")?.innerHTML ?? "";

/** One card as the wall shows it. mine: the author's own (pending or rejected), with its note. */
export function cardHtml(c: Pick<Card, "board" | "handle" | "connection" | "place" | "text" | "featured" | "createdAt" | "status"> & { id?: string }, i: number, { mine = false, admin = false } = {}) {
  const meta = `<span class="kw-from">@${esc(c.handle || "member")}</span><span class="kw-conn">${esc(c.connection)}${c.place ? ` · ${esc(c.place)}` : ""}</span>`;
  const feat = c.featured ? `<span class="kw-feat">★ Featured</span>` : "";
  const pend = !mine || admin ? "" : c.status === "pending"
    ? `<div class="kw-pend"><span class="bt-badge bt-badge--teal">Under review</span><span class="bt-meta">Only you can see this until it's approved.</span><button type="button" class="bt-btn bt-btn--ghost bt-btn--sm" data-kw-withdraw="${esc(c.id || "")}">Withdraw</button></div>`
    : c.status === "rejected" ? `<div class="kw-pend"><span class="bt-meta">Not posted</span></div>` : "";
  const cls = `${mine && !admin ? " is-mine" : ""}${c.featured ? " is-feat" : ""}`;
  const text = `<p class="kw-text">${esc(c.text)}</p>`;
  if (c.board === "boomer") {
    const seal = mascot().replace('class="bt-mascot', 'class="bt-mascot mc-seal');
    return `<article class="kw-card mc-note${cls}" style="--tilt:${[-1, 0.9, -0.6, 1.2, -0.8][i % 5]}deg">${feat}${text}<div class="kw-meta">${meta}</div>${pend}${seal}</article>`;
  }
  if (c.board === "skipper") {
    return `<article class="kw-card pn-note pn-note--${(i % 4) + 1}${cls}" style="--tilt:${[-1.4, 1.1, -0.7, 1.5, -1][i % 5]}deg">${feat}${pawPin()}${text}<div class="kw-meta">${meta}</div>${pend}</article>`;
  }
  return `<article class="kw-card kw-postcard${cls}" style="--tilt:${TILTS[i % TILTS.length]}deg">${feat}
    <div class="kw-pc-l">${text}</div>
    <div class="kw-pc-r">${stampMini()}${mine || admin ? "" : postmark(dayLabel(ms(c.createdAt)))}<div class="kw-addr"><span class="kw-addr-k">From</span>${meta}</div></div>${pend}</article>`;
}

/** Wires one board's slot. */
export function mountKindWords(el: HTMLElement) {
  const board = el.dataset.kindWords as Board;
  const B = BOARDS[board];
  if (!B || el.dataset.kwWired) return;
  el.dataset.kwWired = "1";
  el.classList.add("kw", `kw--${board}`);
  const top = board === "newfoundland"
    ? `<div class="kw-top">${puffinHero()}<div class="kw-intro"><div class="kw-mark"><span>${B.title[0]}</span><span class="kw-mark-2">${B.title[1]}</span></div><h3 class="kw-title">${B.heading}</h3><p>${B.intro}</p><div data-kw-acts></div></div></div>`
    : `<div data-kw-acts></div>`;
  el.innerHTML = `${top}<div class="kw-wall kw-wall--${board}" data-kw-wall aria-live="polite"><p class="bt-meta">Loading…</p></div><div class="kw-more" data-kw-more hidden><button type="button" class="bt-btn bt-btn--secondary" data-kw-load>Load more</button></div>`;
  const acts = el.querySelector<HTMLElement>("[data-kw-acts]")!, wall = el.querySelector<HTMLElement>("[data-kw-wall]")!, more = el.querySelector<HTMLElement>("[data-kw-more]")!;
  let auth: AuthState | null = null, approved: Card[] = [], mine: Card[] = [], shown = PAGE, loaded = false;

  const isMember = () => !!auth?.user && auth.status !== "needsSignup" && auth.status !== "loading";
  function renderActs() {
    const st = !auth || auth.status === "loading" ? "loading" : !auth.user ? "visitor" : auth.status === "needsSignup" ? "signup" : "member";
    acts.innerHTML = st === "member"
      ? `<div class="kw-acts"><button type="button" class="bt-btn bt-btn--primary" data-kw-open>${B.write}</button><span class="bt-meta">Posted with your handle. Links are removed.</span></div>`
      : lockCard({ status: st }, B.lock[0], B.lock[1], `#${el.closest("section")?.id || ""}`, "Join free to add yours");
  }
  function renderWall() {
    if (!loaded) return;
    const own = mine.filter((c) => c.status === "pending" || c.status === "rejected").sort((a, b) => ms(b.createdAt) - ms(a.createdAt));
    const list = approved.slice(0, shown);
    if (!list.length && !own.length) {
      wall.classList.add("is-empty");
      wall.innerHTML = `<div class="bt-empty kw-empty">${board === "newfoundland" ? puffinArt({ cls: "kw-empty-puffin" }) : mascot()}<p class="bt-empty-title">${B.empty}</p><p>Be the first to send one.</p></div>`;
      more.hidden = true;
      return;
    }
    wall.classList.remove("is-empty");
    wall.innerHTML = own.map((c, i) => cardHtml(c, i, { mine: true })).join("") + list.map((c, i) => cardHtml(c, i + own.length)).join("");
    more.hidden = approved.length <= shown;
  }
  async function load() {
    try {
      const { db, collection, getDocs, query, where, SITE_ID } = await import("../../lib/db");
      const col = collection(db, "sites", SITE_ID, "kindWords");
      const [a, m] = await Promise.all([
        getDocs(query(col, where("board", "==", board), where("status", "==", "approved"))),
        auth?.user ? getDocs(query(col, where("uid", "==", auth.user.uid), where("board", "==", board))) : Promise.resolve(null),
      ]);
      approved = a.docs.map((d) => ({ id: d.id, ...d.data() }) as Card).sort((x, y) => Number(!!y.featured) - Number(!!x.featured) || ms(y.createdAt) - ms(x.createdAt));
      mine = m ? m.docs.map((d) => ({ id: d.id, ...d.data() }) as Card) : [];
      loaded = true;
      renderWall();
    } catch (err) {
      console.warn("kind words: couldn't load the wall", err);
      wall.innerHTML = `<div class="bt-lock-card bc-lock"><span class="bt-lock-card-ic" aria-hidden="true">⚠️</span><div><b>Couldn't load the ${board === "newfoundland" ? "postcards" : "notes"}</b><p>The rest of the page still works.</p></div><button type="button" class="bt-btn bt-btn--secondary bt-btn--sm" data-kw-retry>Try again</button></div>`;
    }
  }

  el.addEventListener("click", async (e) => {
    const t = (e.target as Element).closest<HTMLElement>("[data-kw-open], [data-kw-load], [data-kw-withdraw], [data-kw-retry]");
    if (!t) return;
    if (t.matches("[data-kw-load]")) { shown += PAGE; renderWall(); return; }
    if (t.matches("[data-kw-retry]")) { wall.innerHTML = `<p class="bt-meta">Loading…</p>`; void load(); return; }
    if (t.matches("[data-kw-open]")) { openComposer(board, auth, () => load()); return; }
    const id = t.dataset.kwWithdraw!;
    await confirmAction({
      title: "Withdraw it?", message: "It comes off the queue and won't be posted. You can write another one.", confirmLabel: "Withdraw", busyLabel: "Withdrawing…", feature: "kind-words",
      onConfirm: async () => { const { call } = await import("../../lib/call"); await call("kindWithdraw", { id }); },
    }).then((ok) => { if (ok) { toast("Withdrawn."); void load(); } });
  });

  onAuth((s) => {
    const before = auth?.user?.uid ?? null;
    auth = s;
    renderActs();
    if (s.status === "loading") return;
    if (!loaded || before !== (s.user?.uid ?? null)) void load();
  });
}

/** The composer dialog. */
function openComposer(board: Board, auth: AuthState | null, done: () => void) {
  const B = BOARDS[board];
  const handle = auth?.profile?.handle || "you";
  let conn = "";
  announceOverlay("kind-words");
  const m = openModal({
    feature: "kind-words", wide: false,
    content: `<div class="kw-modal">
      <div class="bt-modal-header"><div class="bt-modal-heading"><h2 class="bt-modal-title">${B.write}</h2><p class="bt-modal-subtitle">${B.subtitle}</p></div><button type="button" class="bt-modal-x" data-bt-close aria-label="Close">✕</button></div>
      <div class="bt-modal-section"><span class="bt-label" id="kw-conn-l">${B.connAsk}</span><div class="kw-chips" role="group" aria-labelledby="kw-conn-l">${B.connections.map((c) => `<button type="button" class="bt-chip" aria-pressed="false" data-kw-conn="${esc(c)}">${esc(c)}</button>`).join("")}</div></div>
      ${B.place ? `<div class="bt-modal-section bt-field"><label class="bt-label" for="kw-town">Town <span class="bt-hint">(optional)</span></label><input class="bt-input" id="kw-town" maxlength="${PLACE_MAX}" placeholder="e.g. Twillingate" autocomplete="off"></div>` : ""}
      <div class="bt-modal-section bt-field"><label class="bt-label" for="kw-text">${board === "skipper" ? "Your note" : "Your story"}</label><textarea class="bt-textarea" id="kw-text" maxlength="${TEXT_MAX}" rows="5"></textarea>
        <div class="kw-countrow"><span class="bt-hint">${TEXT_MIN} to ${TEXT_MAX} characters. Links are removed.</span><span class="bt-count" data-kw-count>0 / ${TEXT_MAX}</span></div></div>
      <div class="bt-modal-section"><span class="bt-label">Preview</span><div class="kw-preview" data-kw-preview></div></div>
      <p class="bt-error" data-kw-err role="alert" hidden></p>
      <div class="bt-modal-actions"><button type="button" class="bt-btn bt-btn--secondary" data-bt-close>Cancel</button><button type="button" class="bt-btn bt-btn--primary" data-kw-send disabled>${B.send}</button></div>
    </div>`,
  });
  const box = m.modal;
  const text = box.querySelector<HTMLTextAreaElement>("#kw-text")!, town = box.querySelector<HTMLInputElement>("#kw-town");
  const count = box.querySelector<HTMLElement>("[data-kw-count]")!, preview = box.querySelector<HTMLElement>("[data-kw-preview]")!;
  const send = box.querySelector<HTMLButtonElement>("[data-kw-send]")!, err = box.querySelector<HTMLElement>("[data-kw-err]")!;
  const stripLinks = (s: string) => s.replace(/\b(?:[a-z][a-z0-9+.-]*:\/\/|www\.)\S+/gi, " ").replace(/\s+/g, " ").trim();
  const update = () => {
    const clean = stripLinks(text.value);
    count.textContent = `${text.value.length} / ${TEXT_MAX}`;
    preview.innerHTML = cardHtml({ board, handle, connection: conn || B.connections[0], place: town?.value.trim() || null, text: clean || (board === "skipper" ? "Your note shows here." : "Your story shows here."), status: "approved", createdAt: Date.now() }, 0);
    send.disabled = !conn || clean.length < TEXT_MIN || clean.length > TEXT_MAX;
  };
  box.querySelectorAll<HTMLButtonElement>("[data-kw-conn]").forEach((b) => b.addEventListener("click", () => {
    conn = b.dataset.kwConn!;
    box.querySelectorAll<HTMLButtonElement>("[data-kw-conn]").forEach((x) => { const on = x === b; x.classList.toggle("is-on", on); x.setAttribute("aria-pressed", String(on)); });
    update();
  }));
  text.addEventListener("input", update); town?.addEventListener("input", update);
  m.setBeforeClose(async () => !text.value.trim() || send.dataset.sent === "1" || confirmAction({ title: "Discard it?", message: "What you wrote won't be kept.", confirmLabel: "Discard", danger: true, feature: "kind-words", onConfirm: async () => {} }));
  update();
  send.addEventListener("click", async () => {
    err.hidden = true;
    send.disabled = true; send.textContent = "Sending…";
    try {
      const { call } = await import("../../lib/call");
      const r = await call<{ linksRemoved: number }>("kindSubmit", { board, connection: conn, place: town?.value.trim() || null, text: text.value });
      send.dataset.sent = "1";
      showSent(box, board, { handle, connection: conn, place: town?.value.trim() || null, text: stripLinks(text.value) }, r.linksRemoved, () => m.close());
      done();
    } catch (e) {
      err.textContent = messageFor(e); err.hidden = false;
      send.textContent = B.send; update();
    }
  });
}

/** The celebratory moment, in the same dialog: the puffin flies off with the postcard, or the note gets pinned with the paw pin. */
function showSent(box: HTMLElement, board: Board, c: { handle: string; connection: string; place: string | null; text: string }, linksRemoved: number, close: () => void) {
  const B = BOARDS[board];
  const art = board === "newfoundland" ? sentSky()
    : board === "boomer" ? `<div class="kw-pile"><span class="kw-pile-under" aria-hidden="true"></span><span class="kw-pile-under kw-pile-under--2" aria-hidden="true"></span>${cardHtml({ board, ...c, status: "approved" }, 0)}</div>`
    : `<div class="kw-pinstage">${cardHtml({ board, ...c, status: "approved" }, 0)}</div>`;
  box.innerHTML = `<div class="kw-modal kw-sent kw-sent--${board}">${art}<h2 class="bt-modal-title kw-sent-title">${B.sentTitle}</h2><p class="kw-sent-p">${B.sentText}</p>${linksRemoved ? `<p class="kw-sent-p bt-meta">${linksRemoved === 1 ? "A link was" : "Links were"} removed.</p>` : ""}<div class="bt-modal-actions kw-sent-acts"><button type="button" class="bt-btn bt-btn--primary" data-kw-back>Back to the wall</button></div></div>`;
  if (!RM()) requestAnimationFrame(() => box.querySelector(".kw-sent")?.classList.add("is-go"));
  box.querySelector<HTMLButtonElement>("[data-kw-back]")!.addEventListener("click", close);
  box.querySelector<HTMLButtonElement>("[data-kw-back]")!.focus();
}

/** Every [data-kind-words] slot under root. */
export function mountAllKindWords(root: ParentNode = document) {
  root.querySelectorAll<HTMLElement>("[data-kind-words]").forEach(mountKindWords);
}
