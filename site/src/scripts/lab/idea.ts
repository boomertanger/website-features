// The idea dialog (docs/specs/feature-lab.md §7; mockup "idea dialog"): title, who and when, badges, the vote box, the description, the
// admin panel (status, priority, note, Save; Admin activity; Edit, Delete), comments with the composer, the history, and Hide for mods.
// Opened with openModal (wide); the deep link ?idea=<id> is set while it's open. Everything re-renders from the store after each action.
import { openModal, modalHeader } from "../../../../shared/ui/modal.js";
import { confirmAction } from "../../../../shared/ui/confirm.js";
import { composerHtml, initComposer } from "../../../../shared/ui/composer.js";
import { toast } from "../../../../shared/ui/toast.js";
import { burst } from "../../../../shared/ui/burst.js";
import { PENCIL_ICON } from "../../../../shared/ui/admin-menu.js";
import { getAuthState } from "../../lib/auth";
import { messageFor } from "../../lib/errors";
import { STATUS, PRIORITY, AREA, voteLocked, type Idea, type Comment, type LogEntry, type Status, type Priority, type Area } from "./data";
import { S, byId, freshIdea, commentsOf, logOf, comment as postComment, triage, hide, edit, remove } from "./store";
import { isAdmin, isStaff, canDelete, needOf, verifyLine } from "./gate";
import { esc, sBadge, pBadge, architect, tally, initialsOf, longDate, areaLabel, plural } from "./ui";
import { handleVote } from "./vote";
import { I } from "./art";

type Done = () => void;
let current: { id: string; close: () => void } | null = null;

const setIdeaParam = (id: string | null) => {
  const u = new URL(location.href);
  if (id) u.searchParams.set("idea", id); else u.searchParams.delete("idea");
  history.replaceState(null, "", u);
};

function commentHtml(c: Comment, staff: boolean) {
  if (c.hidden && !staff) return "";
  const tag = c.staffTag === "admin" ? `<span class="bt-admin-tag bt-admin-tag--small">${I.shield}Admin</span>` : c.staffTag === "mod" ? '<span class="bt-badge bt-badge--teal">Mod</span>' : "";
  const tools = staff && !c.staffTag ? `<span class="fl-cmt-tools"><button type="button" class="bt-btn bt-btn--admin bt-btn--sm" data-hide-comment="${esc(c.id)}" data-hidden="${c.hidden}" aria-label="${c.hidden ? "Unhide comment" : "Hide comment"}">${I.eye}<span class="bt-btn-label">${c.hidden ? "Unhide" : "Hide"}</span></button></span>` : "";
  const who = c.by.handle ? `<a href="/u/${encodeURIComponent(c.by.handle)}">@${esc(c.by.handle)}</a>` : '<span class="bt-meta">Former member</span>';
  const note = c.hidden ? `<span class="bt-comment-hidden-note">Hidden by @${esc(c.hiddenBy?.handle || "a mod")}${c.hiddenReason ? `: ${esc(c.hiddenReason)}` : ""}. Only staff see this.</span>` : "";
  return `<div class="bt-comment${c.hidden ? " bt-comment--hidden" : ""}">${tools}<div class="bt-comment-head"><span class="bt-avatar">${initialsOf(c.by.handle)}</span>${who}${tag}<span class="bt-comment-time">${longDate(c.createdAt)}</span></div><p class="bt-comment-text">${esc(c.text)}</p>${note}</div>`;
}

function historyHtml(i: Idea) {
  const list = [...i.statusHistory].reverse();
  return `<div class="bt-history">${list.map((h) => {
    const note = h.kind === "note";
    const m = note || !h.status ? { label: "Note added", tone: "gray" } : STATUS[h.status];
    const by = h.changedBy?.handle ? `@${esc(h.changedBy.handle)}` : "Former member";
    return `<div class="bt-history-item"><div class="bt-history-line"><span class="bt-history-dot bt-history-dot--${m.tone}"></span><span class="bt-history-rule"></span></div><div class="bt-history-body"><div><strong style="font-weight:600">${m.label}</strong> · ${by}</div>${h.note ? `<div style="color:var(--bt-text-muted);margin-top:2px">${esc(h.note)}</div>` : ""}<div class="bt-meta">${longDate(h.changedAt)}</div></div></div>`;
  }).join("")}</div>`;
}

const FIELD_LABEL: Record<string, string> = { title: "title", description: "description", area: "area" };
function logTitle(e: LogEntry): { label: string; note: string } {
  const keys = Object.keys(e.changes || {});
  if (e.action === "edit") return { label: `Edited ${keys.map((k) => FIELD_LABEL[k] || k).join(", ") || "the idea"}`, note: e.reason ? `Reason: ${e.reason}` : "" };
  if (e.action === "triage") {
    const parts: string[] = [];
    const st: any = e.changes?.status, pr: any = e.changes?.priority;
    if (st) parts.push(`Moved to ${STATUS[st.after as Status]?.label || st.after}`);
    if (pr) parts.push(pr.after ? `Priority ${PRIORITY[pr.after as Priority]?.label || pr.after}` : "Cleared the priority");
    return { label: parts.join(", ") || "Added a note", note: e.reason || "" };
  }
  if (e.action === "hide" || e.action === "unhide") return { label: `${e.action === "hide" ? "Hid" : "Unhid"} ${e.details?.commentId ? "a comment" : "the idea"}`, note: e.reason ? `Reason: ${e.reason}` : "" };
  return { label: e.action, note: e.reason };
}
function activityHtml(log: LogEntry[]) {
  if (!log.length) return `<p class="bt-hint">No admin changes yet.</p>`;
  return `<div class="bt-history">${log.map((e) => { const t = logTitle(e); return `<div class="bt-history-item"><div class="bt-history-line"><span class="bt-history-dot bt-history-dot--blue"></span><span class="bt-history-rule"></span></div><div class="bt-history-body"><div><strong style="font-weight:600">${esc(t.label)}</strong></div>${t.note ? `<div style="color:var(--bt-text-muted);margin-top:2px">${esc(t.note)}</div>` : ""}<div class="bt-meta">${esc(e.actorName)}, ${longDate(e.createdAt)}</div></div></div>`; }).join("")}</div>`;
}

function adminPanel(i: Idea, log: LogEntry[], mayDelete: boolean) {
  return `<div class="bt-admin-panel"><span class="bt-admin-tag">${I.shield}Admin only</span>
    <div class="bt-form-grid"><div class="bt-field"><label class="bt-label" for="fl-st">Status</label><select class="bt-select" id="fl-st" data-f="status">${(Object.keys(STATUS) as Status[]).map((k) => `<option value="${k}"${k === i.status ? " selected" : ""}>${STATUS[k].label}</option>`).join("")}</select></div>
    <div class="bt-field"><label class="bt-label" for="fl-pr">Priority</label><select class="bt-select" id="fl-pr" data-f="priority"><option value="">—</option>${(Object.keys(PRIORITY) as Priority[]).map((k) => `<option value="${k}"${k === i.priority ? " selected" : ""}>${PRIORITY[k].label}</option>`).join("")}</select></div></div>
    <div class="bt-field"><label class="bt-label" for="fl-note">Note (optional, added to history)</label><textarea class="bt-textarea" id="fl-note" data-f="note" rows="2" maxlength="1000" placeholder="Shown to everyone in the history"></textarea></div>
    <div class="fl-save"><p class="bt-error" hidden data-save-err></p><p class="bt-hint">Notes appear in the history. Moving an idea to Shipped gives its author The Architect.</p><div class="bt-form-actions"><button type="button" class="bt-btn bt-btn--admin" data-save disabled>Save changes</button></div></div>
    <div class="bt-modal-section"><p class="bt-section-label">Admin activity</p>${activityHtml(log)}</div>
    ${mayDelete ? "" : '<p class="bt-hint">As a Steward you can hide this idea. Deleting needs the owner or a Right Hand.</p>'}</div>`;
}

function dialogHtml(i: Idea, cmts: Comment[], log: LogEntry[], mayDelete: boolean) {
  const s = getAuthState();
  const staff = isStaff(s), adminOn = isAdmin(s), need = needOf(s);
  const voted = S.voted.has(i.id);
  const locked = voteLocked(i);
  const visible = cmts.filter((c) => !c.hidden).length;
  const edited = i.editedAt ? `<br><span class="bt-edited">${PENCIL_ICON}Edited by an admin on ${longDate(i.editedAt)}</span>` : "";
  const who = i.by.handle ? `<a href="/u/${encodeURIComponent(i.by.handle)}">@${esc(i.by.handle)}</a>` : "Former member";
  const sub = `<span class="bt-meta">Requested by ${who} on ${longDate(i.createdAt)} · ${areaLabel(i.area)}</span>${edited}`;
  const tools = adminOn ? `<button type="button" class="bt-btn bt-btn--sm bt-btn--admin" data-edit aria-label="Edit">${I.pencil}<span class="bt-btn-label">Edit</span></button>` : "";
  const line = locked ? (i.status === "shipped" ? "Shipped. Voting is closed; the count stays as a thank-you." : "Voting is closed.")
    : need === "signedOut" ? "Join free to vote. Votes help decide what gets built next." : voted ? "You voted for this. Tap again to take it back." : "Want this too? Vote for it.";
  const gate = need === "signedOut"
    ? `<div class="fl-gate"><p><b>Join the conversation.</b> Members can comment, vote and post their own ideas. It's free.</p><div class="bt-modal-actions"><button type="button" class="bt-btn bt-btn--primary bt-btn--sm" data-join-dlg>Join free</button><button type="button" class="bt-btn bt-btn--secondary bt-btn--sm" data-signin-dlg>Sign in</button></div></div>`
    : need === "needsSignup" ? `<div class="fl-gate"><p><b>Finish signing up to join in.</b> Pick your handle and you can comment, vote and post ideas.</p><div class="bt-modal-actions"><button type="button" class="bt-btn bt-btn--primary bt-btn--sm" data-finish-dlg>Finish signup</button></div></div>`
    : need === "unverified" ? `<div class="fl-gate fl-gate--warn"><p><b>Verify your email to post, vote and comment.</b> ${verifyLine(s.user?.email || "")}</p><div class="bt-modal-actions">${s.user?.email ? '<button type="button" class="bt-btn bt-btn--secondary bt-btn--sm" data-resend-dlg>Send a new link</button>' : '<a class="bt-btn bt-btn--secondary bt-btn--sm" href="/account">Open Account</a>'}</div></div>`
    : composerHtml({ placeholder: "Ask a question or add context…", maxLength: 1000, id: "fl-cmt" });
  const hideBtn = staff ? `<button type="button" class="bt-btn bt-btn--admin" data-hide-idea data-hidden="${i.hidden}">${I.eye}${i.hidden ? "Unhide idea" : "Hide idea"}</button>` : "";
  const danger = adminOn && mayDelete ? `<button type="button" class="bt-btn bt-btn--danger" data-delete>${I.trash}Delete idea</button>` : "";
  return `${modalHeader(esc(i.title), sub, tools)}
    <div class="fl-dlg-badges">${i.hidden ? '<span class="bt-badge bt-badge--gray">Hidden</span>' : ""}${sBadge(i.status)}${pBadge(i.priority)}${i.status === "shipped" ? `<span class="bt-meta">${architect(18)} ${i.by.handle ? `@${esc(i.by.handle)}` : "The author"} earned The Architect</span>` : ""}</div>
    <div class="fl-dlg-vote">${tally(i, voted)}<p>${line}</p></div>
    <div class="bt-modal-section"><p class="bt-section-label">Description</p><p class="bt-section-text">${esc(i.description)}</p></div>
    ${adminOn ? adminPanel(i, log, mayDelete) : ""}
    <div class="bt-modal-section"><p class="bt-section-label">Comments · ${visible}</p><div class="bt-comments">${cmts.map((c) => commentHtml(c, staff)).join("") || '<p class="bt-hint">No comments yet. Be the first.</p>'}</div><div style="margin-top:var(--bt-space-3)">${gate}</div></div>
    <div class="bt-modal-section"><p class="bt-section-label">History</p>${historyHtml(i)}</div>
    <div class="bt-modal-actions">${danger}${hideBtn}<button type="button" class="bt-btn bt-btn--secondary" data-bt-close>Close</button></div>`;
}

/** Opens an idea. `onChange` runs after anything that changes the board (a vote, a status, a delete) so the page can redraw. */
export async function openIdea(id: string, onChange: Done = () => {}) {
  current?.close();
  let idea = byId(id) || (await freshIdea(id));
  if (!idea || (idea.hidden && !isStaff())) { toast("This idea is no longer here.", { kind: "info" }); setIdeaParam(null); return; }
  let cmts: Comment[] = [], log: LogEntry[] = [];
  let mayDelete = false, closed = false;
  const m = openModal({ title: idea.title, wide: true, feature: "feature-lab", content: `<div class="fl-dlg-load"><span class="bt-skeleton" style="height:22px;width:60%"></span><span class="bt-skeleton" style="height:90px;margin-top:12px"></span></div>`, onClose: () => { closed = true; if (current?.id === id) current = null; setIdeaParam(null); } });
  current = { id, close: m.close };
  setIdeaParam(id);
  const modal = m.modal;

  const load = async () => {
    const fresh = await freshIdea(id);
    if (!fresh) { toast("This idea is no longer here.", { kind: "info" }); onChange(); m.close(); return false; }
    idea = fresh;
    [cmts, log, mayDelete] = await Promise.all([commentsOf(id).catch(() => cmts), isAdmin() ? logOf(id) : Promise.resolve([] as LogEntry[]), canDelete()]);
    return true;
  };
  const draw = () => {
    if (closed || !idea) return;
    const keep = modal.querySelector<HTMLTextAreaElement>("#fl-cmt")?.value || "";
    const top = modal.scrollTop;
    modal.innerHTML = dialogHtml(idea, cmts, log, mayDelete);
    const box = modal.querySelector<HTMLElement>(".bt-composer");
    if (box) {
      const c = initComposer(box, { busyLabel: "Posting…", onSubmit: async (text: string) => {
        try { await postComment(id, text); } catch (err) { throw new Error(messageFor(err, "Couldn't post your comment. Try again.")); }
        await refresh();
      } });
      const ta = box.querySelector<HTMLTextAreaElement>("textarea");
      if (ta && keep) { ta.value = keep; ta.dispatchEvent(new Event("input")); }
      void c;
    }
    modal.scrollTop = top;
    wirePanel();
  };
  const refresh = async () => { if (await load()) { draw(); onChange(); } };

  function wirePanel() {
    const sel = (k: string) => modal.querySelector<HTMLSelectElement | HTMLTextAreaElement>(`[data-f="${k}"]`);
    const save = modal.querySelector<HTMLButtonElement>("[data-save]");
    if (!save || !idea) return;
    const dirty = () => { save.disabled = !((sel("status") as HTMLSelectElement).value !== idea!.status || ((sel("priority") as HTMLSelectElement).value || null) !== (idea!.priority || null) || (sel("note") as HTMLTextAreaElement).value.trim()); };
    ["status", "priority", "note"].forEach((k) => { sel(k)?.addEventListener("input", dirty); sel(k)?.addEventListener("change", dirty); });
    save.addEventListener("click", async () => {
      const err = modal.querySelector<HTMLElement>("[data-save-err]")!;
      err.hidden = true;
      save.disabled = true;
      const status = (sel("status") as HTMLSelectElement).value as Status;
      try {
        const res = await triage(id, { status, priority: ((sel("priority") as HTMLSelectElement).value || null) as Priority | null, note: (sel("note") as HTMLTextAreaElement).value.trim() });
        toast(res.statusChanged ? `Moved to ${STATUS[status].label}.` : "Saved.");
        await refresh();
        if (res.rewards?.architect) burst(modal.querySelector<HTMLElement>(".fl-dlg-badges") || modal);
      } catch (e) { err.textContent = messageFor(e, "Couldn't save. Try again."); err.hidden = false; dirtyAgain(); }
      function dirtyAgain() { save!.disabled = false; }
    });
  }

  modal.addEventListener("click", async (e) => {
    const t = e.target as Element;
    const vb = t.closest<HTMLElement>("[data-vote]");
    if (vb) { e.preventDefault(); await handleVote(vb, vb.dataset.vote!, async () => { draw(); onChange(); }); return; }
    if (t.closest("[data-join-dlg]")) { const { openSignIn } = await import("../account/dialog"); openSignIn({ mode: "join", title: "Join to vote and comment" }); return; }
    if (t.closest("[data-signin-dlg]")) { const { openSignIn } = await import("../account/dialog"); openSignIn({ mode: "signin" }); return; }
    if (t.closest("[data-finish-dlg]")) { const { openSignIn } = await import("../account/dialog"); openSignIn({}); return; }
    if (t.closest("[data-resend-dlg]")) { const { sendVerification } = await import("../../lib/auth"); try { await sendVerification(); toast("Sent. Check your inbox."); } catch { toast("Couldn't send it. Wait a minute and try again.", { kind: "error" }); } return; }
    if (t.closest("[data-edit]")) { openEdit(idea!, async () => { await refresh(); }); return; }
    const hc = t.closest<HTMLElement>("[data-hide-comment]");
    if (hc) { await toggleHide(id, hc.dataset.hidden !== "true", hc.dataset.hideComment!, idea!.title, refresh); return; }
    const hi = t.closest<HTMLElement>("[data-hide-idea]");
    if (hi) { await toggleHide(id, hi.dataset.hidden !== "true", undefined, idea!.title, refresh); return; }
    if (t.closest("[data-delete]")) {
      const n = idea!.commentCount, v = idea!.voteCount;
      void confirmAction({ title: "Delete this idea?", message: `"${idea!.title}" will be removed, with its ${plural(n, "comment")}, ${plural(v, "vote")} and its activity. This can't be undone.`, confirmLabel: "Delete idea", busyLabel: "Deleting…", feature: "feature-lab",
        onConfirm: async () => { try { await remove(id); } catch (err) { throw new Error(messageFor(err, "Couldn't delete it. Try again.")); } } })
        .then((ok: boolean) => { if (ok) { toast("Idea deleted."); onChange(); m.close(); } });
    }
  });

  if (await load()) { draw(); void modal.focus(); }
}

/** Hide (with a required reason) or unhide an idea or one comment. */
async function toggleHide(id: string, hidden: boolean, commentId: string | undefined, title: string, after: () => Promise<void>) {
  const what = commentId ? "comment" : "idea";
  if (!hidden) {
    try { await hide(id, false, "", commentId); toast(`${what === "idea" ? "Idea" : "Comment"} unhidden.`); await after(); }
    catch (err) { toast(messageFor(err, "Couldn't unhide it. Try again."), { kind: "error" }); }
    return;
  }
  void confirmAction({ title: `Hide this ${what}?`, message: commentId ? "Members won't see it. Staff still do, with your reason." : `"${title}" will leave the board for members and visitors. Staff still see it.`, confirmLabel: `Hide ${what}`, busyLabel: "Hiding…", danger: false, feature: "feature-lab",
    bodyHtml: `<div class="bt-field" style="margin-top:var(--bt-space-3)"><label class="bt-label" for="fl-why">Why? (required, staff see it)</label><input class="bt-input" id="fl-why" type="text" maxlength="200" placeholder="Off topic, spam, unkind…"></div>`,
    onConfirm: async (mod: { modal: HTMLElement } | HTMLElement) => {
      const root = (mod as any).modal || mod;
      const reason = (root.querySelector("#fl-why") as HTMLInputElement | null)?.value.trim() || "";
      if (!reason) throw new Error("Say why you are hiding it.");
      try { await hide(id, true, reason, commentId); } catch (err) { throw new Error(messageFor(err, "Couldn't hide it. Try again.")); }
    } }).then(async (ok: boolean) => { if (ok) { toast(`${what === "idea" ? "Idea" : "Comment"} hidden.`); await after(); } });
}

/** Admin Edit: title, description and area (adminEditItem kind labIdea). Sends only what changed, with the values it loaded. */
function openEdit(i: Idea, done: () => Promise<void>) {
  let area: Area = i.area;
  const m = openModal({ title: "Edit idea", feature: "feature-lab", content: `${modalHeader("Edit idea", "Fix typos and details. The change is marked on the idea and logged under Admin activity.")}
    <div class="bt-field"><span class="bt-label">It's for</span><div class="bt-pills fl-area-pick" role="radiogroup" aria-label="Area">${(Object.keys(AREA) as Area[]).map((k) => `<button type="button" role="radio" aria-checked="${k === area}" class="${k === area ? "is-on" : ""}" data-subarea="${k}">${AREA[k]}</button>`).join("")}</div></div>
    <div class="bt-field"><label class="bt-label" for="fl-et">Title</label><input id="fl-et" class="bt-input" type="text" maxlength="200" value="${esc(i.title)}"></div>
    <div class="bt-field"><label class="bt-label" for="fl-ed">Description</label><textarea id="fl-ed" class="bt-textarea" rows="5" maxlength="2000">${esc(i.description)}</textarea></div>
    <div class="bt-field"><label class="bt-label" for="fl-er">Reason (optional, logged)</label><input id="fl-er" class="bt-input" type="text" maxlength="300" placeholder="Fixed a typo"></div>
    <p class="bt-error" hidden data-err></p>
    <div class="bt-modal-actions"><button type="button" class="bt-btn bt-btn--secondary" data-bt-close>Cancel</button><button type="button" class="bt-btn bt-btn--admin" data-go>Save edit</button></div>` });
  const q = <T extends HTMLElement>(s: string) => m.modal.querySelector<T>(s)!;
  m.modal.addEventListener("click", (e) => {
    const b = (e.target as Element).closest<HTMLElement>("[data-subarea]");
    if (!b) return;
    area = b.dataset.subarea as Area;
    m.modal.querySelectorAll<HTMLElement>("[data-subarea]").forEach((x) => { const on = x === b; x.classList.toggle("is-on", on); x.setAttribute("aria-checked", String(on)); });
  });
  q<HTMLButtonElement>("[data-go]").addEventListener("click", async (e) => {
    const btn = e.currentTarget as HTMLButtonElement, err = q("[data-err]");
    const now = { title: q<HTMLInputElement>("#fl-et").value.trim(), description: q<HTMLTextAreaElement>("#fl-ed").value.trim(), area };
    const was = { title: i.title, description: i.description, area: i.area };
    const changes: Record<string, string> = {}, before: Record<string, string> = {};
    (Object.keys(now) as (keyof typeof now)[]).forEach((k) => { if (now[k] !== was[k]) { changes[k] = now[k]; before[k] = was[k]; } });
    if (!Object.keys(changes).length) { err.textContent = "Nothing was changed."; err.hidden = false; return; }
    btn.disabled = true; err.hidden = true;
    try { await edit(i.id, changes, before, q<HTMLInputElement>("#fl-er").value.trim()); toast("Edit saved."); m.close(); await done(); }
    catch (ex) { err.textContent = messageFor(ex, "Couldn't save the edit. Try again."); err.hidden = false; btn.disabled = false; }
  });
}

export const closeIdea = () => current?.close();
