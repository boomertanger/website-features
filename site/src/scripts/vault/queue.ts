// /games/queue (staff: mods and admins; round 2 F3): the triage deck. One item at a time on a big
// card with exactly what the server checked (ticks, and the teal flag that sent it here).
// Approve (admin green) flies it off to the right, Reject asks for a reason the member will see
// and flies it left, Skip moves on; with the deck focused, A / R / S do the same. Cover
// suggestions show the suggestion beside the current cover (signed previews from vaultQueueList,
// valid 10 minutes), with "Replace with my own". Everyone else gets a polite staff-only state.
import { coverHtml } from "../../../../shared/ui/cover.js";
import { initDeck, flyOut } from "../../../../shared/ui/deck.js";
import { openModal, modalHeader } from "../../../../shared/ui/modal.js";
import { whenReady, onAuth } from "../../lib/auth";
import { call } from "../../lib/call";
import { messageFor } from "../../lib/errors";
import { isStaff } from "./gate";
import { esc, tag } from "./ui";
import { coverPicker, uploadSigned } from "./crop";
import { refreshQueueCount } from "./layout";
import type { Cover } from "./data";

interface QItem {
  id: string; kind: "add" | "cover"; reason: string; code: string | null; checks: { id: string; state: string }[];
  submittedBy: string | null; createdAt: number | null; slug: string | null; title: string;
  game: { title: string; summary?: string; cover: Cover | null; tags: string[]; links?: Record<string, string>; ids?: { igdb?: number; steam?: string }; developers?: string[]; releaseStatus?: string } | null;
  coverPreview: string | null;
}

const root = document.querySelector<HTMLElement>("[data-queue]");
const LABEL: Record<string, string> = { found: "Found it", notDuplicate: "Not already in the Vault", fullGame: "A full game", fits: "Fits the Vault", safe: "Safe for the channel" };
const REASONS = {
  add: ["Not a horror game", "Already in the Vault", "Not right for the channel", "Not a real game", "Something else"],
  cover: ["Not this game's cover or art", "Low quality or blurry", "Not right for the channel", "Something else"],
};
const PREVIEW_MS = 9 * 60 * 1000;   // signed previews last 10 minutes; re-list a little before

let items: QItem[] = [], i = 0, total = 0, skipped = 0, loadedAt = 0, busy = false;

const ago = (ms: number | null) => {
  if (!ms) return "";
  const m = Math.round((Date.now() - ms) / 60000);
  if (m < 60) return m <= 1 ? "just now" : `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  return new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

function checksList(q: QItem) {
  const rows = q.checks.filter((c) => c.state !== "skipped").map((c) => c.state === "pass" ? `<li>${LABEL[c.id] || c.id}</li>` : `<li class="is-flag">${LABEL[c.id] || c.id}${c.state === "review" ? `: ${esc(q.reason)}` : ""}</li>`);
  if (!q.checks.some((c) => c.state === "review") && q.reason) rows.push(`<li class="is-flag">${esc(q.reason)}</li>`);
  return `<ul class="bt-deck-checks">${rows.join("")}</ul>`;
}

function card(q: QItem, anim = "") {
  const by = `<div class="gv-qmeta">${q.kind === "cover" ? "Suggested" : "Added"} by @${esc(q.submittedBy || "a member")}${q.createdAt ? `, ${ago(q.createdAt)}` : ""}</div>`;
  const acts = `<div class="bt-deck-acts"><button type="button" class="bt-btn bt-btn--admin" data-act="approve">Approve <kbd>A</kbd></button><button type="button" class="bt-btn bt-btn--secondary" data-act="reject">Reject <kbd>R</kbd></button><button type="button" class="bt-btn bt-btn--ghost" data-act="skip">Skip <kbd>S</kbd></button>${q.kind === "cover" ? '<button type="button" class="bt-btn bt-btn--secondary" data-act="replace">Replace with my own</button>' : ""}</div>`;
  if (q.kind === "cover") {
    const sug = q.coverPreview ? `<span class="bt-cover"><img src="${esc(q.coverPreview)}" alt="Suggested cover" referrerpolicy="no-referrer"></span>` : coverHtml(null);
    return `<article class="bt-deck-card ${anim}"><div class="gv-qcompare"><figure>${coverHtml(null)}<figcaption>Now</figcaption></figure><figure>${sug}<figcaption>Suggested</figcaption></figure></div><div class="bt-deck-body"><h3>${esc(q.title || "A game")}</h3><div class="gv-qmeta">A cover suggestion for a game with none.${q.slug ? ` <a href="/games/${encodeURIComponent(q.slug)}" target="_blank" rel="noopener">Open its page</a>` : ""}</div><ul class="bt-deck-checks"><li>Checked on upload: picture type, size and 3:4</li><li class="is-flag">A mod decides if it's the right art</li></ul>${by}${acts}</div></article>`;
  }
  const g = q.game;
  const where = [g?.ids?.igdb ? "IGDB" : "", g?.ids?.steam ? "Steam" : ""].filter(Boolean);
  const meta = q.code === "queuedByHand" ? `Added by hand.${g?.links?.official ? ` Link: <a href="${esc(g.links.official)}" target="_blank" rel="noopener nofollow">${esc(g.links.official.replace(/^https?:\/\//, ""))}</a>` : " No link given."}` : `${esc(g?.developers?.[0] || "Unknown developer")}. On ${where.join(" and ") || "neither store"}.`;
  const tags = g?.tags?.length ? `<div class="bt-tags">${g.tags.slice(0, 5).map((t) => tag(t)).join("")}</div>` : "";
  const links = g?.links ? Object.entries(g.links).filter(([k, v]) => v && k !== "official").map(([k, v]) => `<a href="${esc(v)}" target="_blank" rel="noopener nofollow">${k === "steam" ? "Steam page" : k}</a>`).join("") : "";
  return `<article class="bt-deck-card ${anim}">${coverHtml(g?.cover || null)}<div class="bt-deck-body"><h3>${esc(g?.title || q.title)}</h3><div class="gv-qmeta">${meta}</div>${g?.summary ? `<p class="gv-qsummary">${esc(g.summary)}</p>` : ""}${tags}${checksList(q)}${links ? `<div class="gv-qlinks">${links}</div>` : ""}${by}${acts}</div></article>`;
}

function render(anim = "") {
  if (!items.length || i >= items.length) {
    root!.innerHTML = `<div class="bt-empty gv-state"><span aria-hidden="true">${document.getElementById("bt-mascot-tpl")?.innerHTML ?? ""}</span><p class="bt-empty-title">${skipped ? `${skipped} skipped` : total ? "Queue cleared" : "Nothing to check"}</p><span>${skipped ? "Check again to go back to the ones you skipped." : total ? "Nice work. New adds that need a look land here." : "Adds that need a look land here. Most go straight into the Vault."}</span><button type="button" class="bt-btn bt-btn--secondary" data-reload>Check again</button></div>`;
    return;
  }
  const left = items.length - i;
  root!.innerHTML = `<div class="bt-deck-count"><span><b>${i + 1}</b> of ${items.length} to check</span><span class="bt-deck-prog" aria-hidden="true">${items.slice(0, 12).map((_, k) => `<i class="${k < i ? "is-done" : ""}"></i>`).join("")}</span></div><div class="bt-deck" tabindex="0" data-deck aria-label="Queue card. Press A to approve, R to reject, S to skip">${left > 1 ? '<span class="bt-deck-ghost"></span>' : ""}${left > 2 ? '<span class="bt-deck-ghost"></span>' : ""}${card(items[i], anim)}</div><p class="bt-hint" data-msg role="status"></p>`;
  const deck = root!.querySelector<HTMLElement>("[data-deck]")!;
  initDeck(deck, { onKey: (k) => act(k) });
}

async function next(kind: "approve" | "reject" | "skip") {
  await flyOut(root!.querySelector(".bt-deck-card"), kind);
  i++;
  if (Date.now() - loadedAt > PREVIEW_MS && i < items.length) { await load(false); return; }
  render(matchMedia("(prefers-reduced-motion: reduce)").matches ? "" : "is-in");
  root!.querySelector<HTMLElement>("[data-deck]")?.focus({ preventScroll: true });
}

function say(msg: string) { const el = root!.querySelector<HTMLElement>("[data-msg]"); if (el) el.textContent = msg; }

async function act(kind: string) {
  if (busy || i >= items.length) return;
  const q = items[i];
  if (kind === "skip") { skipped++; await next("skip"); return; }
  if (kind === "reject") return rejectDialog(q);
  if (kind === "replace") return replaceDialog(q);
  busy = true;
  try {
    const r = await call<{ result: string; slug?: string }>("vaultReviewQueue", { id: q.id, decision: "approve" });
    say(r.result === "duplicate" ? "It was already in the Vault, so it counted as a want." : "");
    refreshQueueCount();
    await next("approve");
  } catch (err) { say(messageFor(err)); }
  finally { busy = false; }
}

function rejectDialog(q: QItem) {
  const reasons = REASONS[q.kind];
  const m = openModal({
    title: `Reject ${q.title}?`, feature: "game-vault",
    content: `${modalHeader(`Reject ${esc(q.game?.title || q.title)}?`, "Pick a reason. The member who sent it sees it.")}<form class="gv-reasons" data-form>${reasons.map((r, k) => `<label class="bt-check"><input type="radio" name="gv-rr" value="${esc(r)}"${k === 0 ? " checked" : ""}><span>${r}</span></label>`).join("")}<div class="bt-field"><label class="bt-label" for="gv-rn">Note (optional)</label><input class="bt-input" id="gv-rn" maxlength="200" placeholder="Anything to add" data-note></div><p class="bt-notice bt-notice--error" data-err hidden></p><div class="bt-modal-actions"><button type="button" class="bt-btn bt-btn--secondary" data-bt-close>Cancel</button><button type="submit" class="bt-btn bt-btn--admin" data-go>Reject</button></div></form>`,
  });
  m.modal.querySelector<HTMLFormElement>("[data-form]")!.addEventListener("submit", async (e) => {
    e.preventDefault();
    const pick = m.modal.querySelector<HTMLInputElement>('input[name="gv-rr"]:checked')!.value;
    const note = m.modal.querySelector<HTMLInputElement>("[data-note]")!.value.trim();
    const go = m.modal.querySelector<HTMLButtonElement>("[data-go]")!;
    go.disabled = true; go.textContent = "Rejecting…";
    try {
      await call("vaultReviewQueue", { id: q.id, decision: "reject", reason: note ? `${pick}. ${note}` : pick });
      m.close();
      refreshQueueCount();
      await next("reject");
    } catch (err) {
      const el = m.modal.querySelector<HTMLElement>("[data-err]")!; el.textContent = messageFor(err); el.hidden = false;
      go.disabled = false; go.textContent = "Reject";
    }
  });
}

function replaceDialog(q: QItem) {
  let blob: Blob | null = null;
  const m = openModal({
    title: `Replace the suggested cover for ${q.title}`, feature: "game-vault",
    content: `${modalHeader("Replace with my own", `${esc(q.title)}. Your cover is used instead and the member's file is deleted.`)}<div data-pick></div><p class="bt-notice bt-notice--error" data-err hidden></p><div class="bt-modal-actions"><button type="button" class="bt-btn bt-btn--secondary" data-bt-close>Cancel</button><button type="button" class="bt-btn bt-btn--admin" data-go disabled>Use my cover</button></div>`,
  });
  const go = m.modal.querySelector<HTMLButtonElement>("[data-go]")!;
  coverPicker(m.modal.querySelector<HTMLElement>("[data-pick]")!, { onReady: (b) => { blob = b; go.disabled = !b; } });
  go.addEventListener("click", async () => {
    if (!blob) return;
    go.disabled = true; go.textContent = "Uploading…";
    try {
      const sig = await call<{ uploadUrl: string; fields: Record<string, string> }>("vaultCoverSignature", {});
      const up = await uploadSigned(sig, blob);
      go.textContent = "Saving…";
      await call("vaultReviewQueue", { id: q.id, decision: "replace", replacementUploadId: up.public_id });
      m.close();
      refreshQueueCount();
      await next("approve");
    } catch (err) {
      const el = m.modal.querySelector<HTMLElement>("[data-err]")!; el.textContent = messageFor(err); el.hidden = false;
      go.disabled = false; go.textContent = "Use my cover";
    }
  });
}

async function load(showLoading = true) {
  if (showLoading) root!.innerHTML = '<div class="gv-loader" role="status"><span class="bt-spinner"></span><span>Loading the queue…</span></div>';
  try {
    const r = await call<{ items: QItem[]; count: number }>("vaultQueueList", {});
    items = r.items || []; total = Math.max(total, items.length); i = 0; skipped = 0; loadedAt = Date.now();
    render("is-in");
  } catch (err) {
    root!.innerHTML = `<div class="bt-empty gv-state"><p class="bt-empty-title">The queue didn't load</p><span>${esc(messageFor(err))}</span><button type="button" class="bt-btn bt-btn--secondary" data-reload>Try again</button></div>`;
  }
}

async function boot() {
  const s = await whenReady();
  if (!isStaff(s)) {
    const visitor = s.status === "signedOut";
    root!.innerHTML = `<div class="bt-empty gv-state"><span aria-hidden="true">${document.getElementById("bt-mascot-tpl")?.innerHTML ?? ""}</span><p class="bt-empty-title">Staff only</p><span>The queue is where mods check new adds and cover suggestions.${visitor ? " Log in if you're a mod." : ""}</span>${visitor ? '<button type="button" class="bt-btn bt-btn--secondary" data-signin="signin">Log in</button>' : '<a class="bt-btn bt-btn--secondary" href="/games">Back to the Vault</a>'}</div>`;
    return;
  }
  load();
}

root?.addEventListener("click", (e) => {
  const el = e.target as Element;
  const b = el.closest<HTMLElement>("[data-act]");
  if (b) { act(b.dataset.act!); return; }
  if (el.closest("[data-reload]")) load();
});
if (root) {
  let started = false, wasStaff = false;
  onAuth((s) => {
    if (s.status === "loading") return;
    if (!started || isStaff(s) !== wasStaff) { started = true; wasStaff = isStaff(s); boot(); }
  });
}
