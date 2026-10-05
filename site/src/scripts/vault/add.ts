// Add a game (docs/specs/game-vault.md §3; round 2 D3 + D4, round 1 D1a–D1n). Three steps on a
// gold rail: Find it (paste a Steam link or search by name; vaultLookup lists up to 8 games, the
// ones already in the Vault say so), Checks (vaultAddGame runs the server's checks; the list
// shows the real result it returns, ticked one by one), In the Vault (the cover drops in, the
// lock spins shut, the lamp lights). Beside it, "How it'll look": the card as it'll sit in the
// Vault with your name on it. Visitors get the Join dialog titled "Join to add games",
// unverified members the verify prompt. Can't find it? Add it by hand (always queued), with an
// optional cover.
import { openModal, modalHeader } from "../../../../shared/ui/modal.js";
import { coverHtml } from "../../../../shared/ui/cover.js";
import { call } from "../../lib/call";
import { messageFor, reasonOf } from "../../lib/errors";
import { requireVerified, handleOf, isStaff, isAdmin } from "./gate";
import { esc, vcard, badge } from "./ui";
import { I, lockRing } from "./art";
import { coverPicker, uploadSigned } from "./crop";
import type { VCard, Cover } from "./data";

interface Candidate { igdbId: number | null; steamAppId: string | null; title: string; year: number | null; cover: Cover | null; input: unknown; inVault: string | null }
interface Check { id: string; label: string; state: "pass" | "fail" | "review" | "skipped" }
interface AddReply { ok: boolean; decision: "added" | "duplicate" | "queued" | "refused"; code: string; message: string; checks: Check[]; slug?: string; title?: string; wantedCount?: number; status?: string; queueId?: string }

const SUB = "Paste a Steam link or search by name. We fill in the details.";
const CHECK_LABELS: [string, string][] = [["found", "Found it"], ["notDuplicate", "Not already in the Vault"], ["fullGame", "A full game"], ["fits", "Fits the Vault"], ["safe", "Safe for the channel"]];
const isLink = (q: string) => /steampowered\.com\/app\/\d+|^\d{3,9}$|igdb\.com\/games\//i.test(q.trim());
const reduce = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
// The How it works page (docs/specs/game-vault-how-it-works.md §1): how adding works, and the house rules
// a refusal points to. They open in a new tab, so what you typed here stays.
const HOW_ADD = '<a class="bt-link-btn" href="/games/how-it-works#s-add" target="_blank" rel="noopener">How adding works</a>';
const RULES_LINK = '<a href="/games/how-it-works#s-fair" target="_blank" rel="noopener">See the house rules</a>';

export async function openAddGame(q = "") {
  if (!(await requireVerified("Join to add games"))) return;
  const me = handleOf();
  const boomer = isAdmin();
  let pick: Candidate | null = null, results: Candidate[] = [], seq = 0, timer = 0;

  const m = openModal({ title: "Add a game", wide: true, feature: "game-vault", content: "" });
  const steps = (n: number) => `<div class="gv-steps3" style="--p:${(n - 1) / 2}"><div class="${n >= 1 ? "is-on" : ""}"><i>1</i>Find it</div><div class="${n >= 2 ? "is-on" : ""}"><i>2</i>Checks</div><div class="${n >= 3 ? "is-on" : ""}"><i>3</i>In the Vault</div></div>`;
  const previewCard = (c: Candidate | null) => {
    const g: VCard = { slug: "preview", title: c?.title || "Your game", sortTitle: "", altNames: [], status: "wishlist", origin: boomer ? "boomer" : "community", by: boomer ? null : me, wanted: boomer ? 0 : 1, cover: c?.cover || null, release: null, releaseStatus: "released", developers: [], tags: [], ttb: null, score: null, verdict: null, streams: 0, minutes: 0, last: null, added: null, statusAt: null };
    return `<div class="gv-preview" aria-hidden="true"><span class="bt-label">How it'll look</span>${vcard(g, { key: false })}<span class="bt-hint">${boomer ? "It goes on the Wishlist as one of yours." : `Your name goes on it: Community pick by @${esc(me)}.`}</span></div>`;
  };
  const body = (html: string) => { m.modal.innerHTML = html; m.modal.querySelector<HTMLElement>("input, button:not([data-bt-close])")?.focus(); };
  const header = (title: string, sub = "") => modalHeader(esc(title), sub);

  // ---------- step 1: find it ----------
  function find(prefill = q, notice = "") {
    body(`${header("Add a game", SUB)}${steps(1)}<div class="gv-dsplit"><div class="gv-dmain">
      <label class="bt-search">${I.search}<input class="bt-input" type="search" data-q autocomplete="off" placeholder="Steam link or game name" aria-label="Steam link or game name" value="${esc(prefill)}"></label>
      <p class="bt-hint">Like store.steampowered.com/app/1205040 or “Granny”.</p>
      <div data-notice role="status">${notice}</div>
      <div class="gv-results" data-results aria-live="polite"></div>
      <div class="gv-dlinks"><button type="button" class="bt-link-btn" data-byhand>Can't find it? Add it by hand</button>${HOW_ADD}</div>
      ${boomer ? "" : '<p class="bt-fine bt-fine--left">New adds land on the Wishlist as your Community pick. You can add 5 a day.</p>'}
    </div><div data-preview>${previewCard(null)}</div></div>
    <div class="bt-modal-actions"><button type="button" class="bt-btn bt-btn--secondary" data-bt-close>Cancel</button><button type="button" class="bt-btn bt-btn--primary" data-go disabled>Add to the Vault</button></div>`);
    const input = m.modal.querySelector<HTMLInputElement>("[data-q]")!;
    input.addEventListener("input", () => { pick = null; syncPick(); clearTimeout(timer); timer = window.setTimeout(() => lookup(input.value), isLink(input.value) ? 0 : 450); });
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); clearTimeout(timer); lookup(input.value); } });
    m.modal.querySelector("[data-byhand]")!.addEventListener("click", () => byHand(input.value.trim()));
    m.modal.querySelector("[data-go]")!.addEventListener("click", () => { if (pick) check(pick); });
    m.modal.querySelector("[data-results]")!.addEventListener("click", (e) => {
      const b = (e.target as Element).closest<HTMLElement>("[data-pick]");
      if (!b) return;
      pick = results[Number(b.dataset.pick)];
      syncPick();
    });
    if (prefill.trim()) lookup(prefill, !!notice);   // a notice from the last try stays until they type
  }
  function syncPick() {
    m.modal.querySelectorAll<HTMLElement>("[data-pick]").forEach((b) => {
      const on = pick === results[Number(b.dataset.pick)];
      b.setAttribute("aria-pressed", String(on));
      const act = b.querySelector(".bt-pick-act"); if (act) act.textContent = on ? "Selected" : "Pick";
    });
    const go = m.modal.querySelector<HTMLButtonElement>("[data-go]"); if (go) go.disabled = !pick;
    const pv = m.modal.querySelector("[data-preview]"); if (pv) pv.innerHTML = previewCard(pick);
  }
  async function lookup(raw: string, keepNotice = false) {
    const query = raw.trim();
    const box = m.modal.querySelector<HTMLElement>("[data-results]"), note = m.modal.querySelector<HTMLElement>("[data-notice]");
    if (!box || !note) return;
    if (!keepNotice) note.innerHTML = "";
    if (query.length < 2) { box.innerHTML = ""; results = []; return; }
    const my = ++seq;
    box.innerHTML = '<div class="bt-notice" style="display:flex;gap:10px;align-items:center"><span class="bt-spinner"></span>Looking…</div>';
    try {
      const r = await call<{ candidates: Candidate[] }>("vaultLookup", { query });
      if (my !== seq) return;
      results = r.candidates || [];
      if (!results.length) { box.innerHTML = `<div class="bt-notice">We couldn't find that one. Paste its Steam link, or <button type="button" class="bt-link-btn" data-byhand2>add it by hand</button>.</div>`; box.querySelector("[data-byhand2]")!.addEventListener("click", () => byHand(query)); return; }
      box.innerHTML = `<div class="bt-pick-list">${results.map((c, i) => {
        const small = [c.year, c.steamAppId && !c.igdbId ? "on Steam" : ""].filter(Boolean).join(", ") || "Year unknown";
        return c.inVault
          ? `<a class="bt-pick is-in" href="/games/${encodeURIComponent(c.inVault)}">${coverHtml(c.cover, { cls: "bt-cover--sm", size: "sm" })}<span class="bt-pick-main"><b>${esc(c.title)}</b><small>${esc(small)}</small></span><span class="bt-tag">In the Vault</span></a>`
          : `<button type="button" class="bt-pick" data-pick="${i}" aria-pressed="false">${coverHtml(c.cover, { cls: "bt-cover--sm", size: "sm" })}<span class="bt-pick-main"><b>${esc(c.title)}</b><small>${esc(small)}</small></span><span class="bt-pick-act">Pick</span></button>`;
      }).join("")}</div>`;
      if (results.length === 1 && !results[0].inVault) { pick = results[0]; syncPick(); }
    } catch (err) {
      if (my !== seq) return;
      const why = reasonOf(err);
      box.innerHTML = "";
      note.innerHTML = why === "igdbDown"
        ? '<div class="bt-notice">Search is having trouble right now. Paste a Steam link instead, it still works.</div>'
        : `<div class="bt-notice bt-notice--error">${esc(messageFor(err))}</div>`;
    }
  }

  // ---------- step 2: the checks ----------
  const checkList = (checks: Check[] | null, running: number) => `<ul class="gv-checks" data-checks>${CHECK_LABELS.map(([id, label], i) => {
    const c = checks?.find((x) => x.id === id);
    const st = c ? ({ pass: "is-ok", fail: "is-fail", review: "is-review", skipped: "" } as const)[c.state] : i === running ? "is-run" : "";
    const mark = c ? ({ pass: "✓", fail: "×", review: "!", skipped: "" } as const)[c.state] : i === running ? '<span class="bt-spinner"></span>' : "";
    return `<li class="${st}"><span class="gv-ck" aria-hidden="true">${mark}</span>${esc(c?.label || label)}${c?.state === "review" ? " (a mod takes a look)" : ""}</li>`;
  }).join("")}</ul>`;
  async function check(c: Candidate) {
    body(`${header("Add a game")}${steps(2)}<div class="gv-dsplit"><div class="gv-dmain"><div class="gv-chosen">${coverHtml(c.cover, { cls: "bt-cover--sm" })}<div><b>${esc(c.title)}</b><div class="bt-meta">${c.year || ""}</div></div></div><div data-list>${checkList(null, 0)}</div><p class="bt-sr-only" role="status" data-say>Checking the Vault…</p><div data-err role="alert"></div></div>${previewCard(c)}</div><div class="bt-modal-actions"><button type="button" class="bt-btn bt-btn--primary" disabled><span class="bt-spinner"></span>Adding…</button></div>`);
    let r: AddReply;
    try { r = await call<AddReply>("vaultAddGame", { input: c.input }); }
    catch (err) { return problem(err, c); }
    // Reveal the server's real result one check at a time (all at once under reduced motion).
    const list = m.modal.querySelector<HTMLElement>("[data-list]")!;
    const shown = r.checks.filter((x) => x.state !== "skipped");
    for (let i = 1; i <= shown.length; i++) {
      list.innerHTML = checkList(r.checks.map((x) => (shown.indexOf(x) >= 0 && shown.indexOf(x) < i ? x : { ...x, state: "skipped" as const })).filter((x) => x.state !== "skipped"), i);
      if (!reduce()) await new Promise((res) => setTimeout(res, 260));
    }
    list.innerHTML = checkList(r.checks.filter((x) => x.state !== "skipped"), -1);
    if (!reduce()) await new Promise((res) => setTimeout(res, 300));
    done(r, c);
  }
  function problem(err: unknown, c: Candidate | null) {
    const why = reasonOf(err);
    const until = (err as any)?.details?.until;
    if (why === "addLimit") return result("🗝️", "You've added 5 games today", "Adding opens again tomorrow. Thanks for filling the Vault.", "Add a game", [close()]);
    if (why === "paused") return result("⏸️", `Adding is paused until ${until ? new Date(until).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "next week"}`, "A mod removed one of your recent adds. You can still search and browse the Vault.", "Add a game", [close()]);
    if (why === "igdbDown") return find(c?.title || "", '<div class="bt-notice">Search is having trouble right now. Paste a Steam link instead, it still works.</div>');
    return find(c?.title || "", `<div class="bt-notice bt-notice--error">${esc(messageFor(err))}</div>`);
  }

  // ---------- step 3: the result ----------
  const close = () => '<button type="button" class="bt-btn bt-btn--secondary" data-bt-close>Close</button>';
  const another = () => '<button type="button" class="bt-btn bt-btn--secondary" data-again>Add another</button>';
  const view = (slug: string) => `<a class="bt-btn bt-btn--primary" href="/games/${encodeURIComponent(slug)}">View game</a>`;
  function result(icon: string, title: string, text: string, heading: string, acts: string[], { lock = false, cover = null as Cover | null, step = 0 } = {}) {
    const art = lock
      ? `<div class="gv-lockscene">${lockRing()}<span class="gv-burst" aria-hidden="true"></span>${coverHtml(cover)}</div>`
      : icon ? `<span class="bt-modal-icon" aria-hidden="true">${icon}</span>` : coverHtml(cover);
    body(`${header(heading)}${step ? steps(step) : ""}<div class="gv-result" role="status">${art}<b>${esc(title)}</b><p>${text}</p></div><div class="bt-modal-actions">${acts.join("")}</div>`);
    m.modal.querySelector("[data-again]")?.addEventListener("click", () => { pick = null; results = []; q = ""; find(""); });
  }
  async function refreshVault() { try { (await import("./page")).vaultChanged(); } catch { /* not on /games */ } }
  function done(r: AddReply, c: Candidate) {
    const title = r.title || c.title;
    if (r.decision === "added") {
      refreshVault();
      return result("", `${title} is in the Vault`, boomer ? "It's on the Wishlist. Set its status and score from its page." : "It's on the Wishlist as your Community pick. When Boomer streams it, it moves to Playing and your name stays on it.", "Added to the Vault", [another(), view(r.slug!)], { lock: true, cover: c.cover, step: 3 });
    }
    if (r.decision === "duplicate") {
      refreshVault();
      const want = r.status === "wishlist" && r.wantedCount ? `We counted you in: ${r.wantedCount} ${r.wantedCount === 1 ? "person wants" : "people want"} Boomer to play it.` : `It's ${r.status === "wishlist" ? "on the Wishlist" : `marked ${badge((r.status || "wishlist") as any)}`}.`;
      return result("", `${title} is already here`, want, "Already in the Vault", [another(), view(r.slug!)], { cover: c.cover });
    }
    if (r.decision === "queued") {
      const again = r.code === "alreadyQueued";
      return result("", again ? `${title} is already waiting` : `A mod will look at ${title} soon`, again ? "Someone sent it already. It joins the Vault once a mod approves it." : `It joins the Vault once it's approved.${isStaff() ? "" : " It doesn't count toward your 5 a day unless it's approved."}`, "Sent for a quick check", [another(), '<button type="button" class="bt-btn bt-btn--primary" data-bt-close>Done</button>'], { cover: c.cover });
    }
    // refused: the plain reason (adult and profanity stay vague on purpose), and a way forward
    find(c.title, `<div class="bt-notice bt-notice--error">${esc(r.message || "That game can't be added.")} ${RULES_LINK}.${r.code === "adult" || r.code === "profanity" ? '<br><span class="bt-hint">Think that\'s a mistake? Ask a mod in chat.</span>' : ""}</div>`);
  }

  // ---------- add it by hand ----------
  function byHand(name = "") {
    let blob: Blob | null = null;
    body(`${header("Add it by hand", "We couldn't find this one on Steam or IGDB. A mod checks it first.")}<form class="bt-stack" style="gap:14px" data-form novalidate>
      <div class="bt-field"><label class="bt-label" for="gv-bn">Game name</label><input class="bt-input" id="gv-bn" data-name maxlength="120" required value="${esc(isLink(name) ? "" : name)}"></div>
      <div class="bt-field"><label class="bt-label" for="gv-bl">Where to find it</label><input class="bt-input" id="gv-bl" data-link type="url" placeholder="e.g. an itch.io or store page"><span class="bt-hint">A link helps the mod check it's real.</span></div>
      <div class="bt-field"><span class="bt-label">Cover (optional)</span><div data-cover></div></div>
      <div data-err role="alert"></div>
      <div class="bt-modal-actions"><button type="button" class="bt-btn bt-btn--secondary" data-back>Back</button><button type="submit" class="bt-btn bt-btn--primary" data-send>Send for a check</button></div></form>`);
    coverPicker(m.modal.querySelector<HTMLElement>("[data-cover]")!, { onReady: (b) => { blob = b; } });
    m.modal.querySelector("[data-back]")!.addEventListener("click", () => find(name));
    m.modal.querySelector<HTMLFormElement>("[data-form]")!.addEventListener("submit", async (e) => {
      e.preventDefault();
      const err = m.modal.querySelector<HTMLElement>("[data-err]")!;
      const gameName = m.modal.querySelector<HTMLInputElement>("[data-name]")!.value.trim();
      const link = m.modal.querySelector<HTMLInputElement>("[data-link]")!.value.trim();
      if (!gameName) { err.innerHTML = '<p class="bt-notice bt-notice--error">Type the game\'s name.</p>'; return; }
      if (link && !/^https?:\/\//i.test(link)) { err.innerHTML = '<p class="bt-notice bt-notice--error">The link should start with https://</p>'; return; }
      const send = m.modal.querySelector<HTMLButtonElement>("[data-send]")!;
      send.disabled = true;
      try {
        let pendingCoverId: string | undefined;
        if (blob) {
          send.textContent = "Uploading the cover…";
          const sig = await call<{ uploadUrl: string; fields: Record<string, string>; publicId: string }>("vaultCoverSuggestSignature", {});
          await uploadSigned(sig, blob);
          const sub = await call<{ pendingCoverId: string | null }>("vaultCoverSubmit", { publicId: sig.publicId });
          pendingCoverId = sub.pendingCoverId || undefined;
        }
        send.textContent = "Sending…";
        const r = await call<AddReply>("vaultAddGame", { byHand: { name: gameName, link }, ...(pendingCoverId ? { pendingCoverId } : {}) });
        if (r.decision === "refused") { err.innerHTML = `<p class="bt-notice bt-notice--error">${esc(r.message)} ${RULES_LINK}.</p>`; send.disabled = false; send.textContent = "Send for a check"; return; }
        if (r.decision === "duplicate") return done(r, { igdbId: null, steamAppId: null, title: gameName, year: null, cover: null, input: null, inVault: r.slug || null });
        result("", `A mod will look at ${gameName} soon`, `It joins the Vault once it's approved.${blob ? " Your cover goes with it." : ""}`, "Sent for a quick check", [another(), '<button type="button" class="bt-btn bt-btn--primary" data-bt-close>Done</button>'], { cover: null });
      } catch (e2) {
        err.innerHTML = `<p class="bt-notice bt-notice--error">${esc(messageFor(e2))}</p>`;
        send.disabled = false; send.textContent = "Send for a check";
      }
    });
  }

  find(q);
}

