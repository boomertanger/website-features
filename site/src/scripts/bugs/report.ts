// The report dialog (docs/specs/bug-zapper.md §7; mockup "Report" screen): title, who and when and the page, badges, the staff hidden bar and the private note, the bite
// box, the duplicate link, What happened / What should have happened / Steps, Screenshot and device (the reporter and staff; others see the lock line; the reporter can add
// a screenshot until the report closes), the private thread with its composer (the reporter and staff), the history, Hide for mods and the green admin panel (status,
// priority, the duplicate picker, a note, Save; Admin activity; Edit, Hide, Delete). Opened with openModal (wide); the deep link ?report=<id> is set while it's open.
import { openModal, modalHeader } from "../../../../shared/ui/modal.js";
import { confirmAction } from "../../../../shared/ui/confirm.js";
import { initComposer } from "../../../../shared/ui/composer.js";
import { thumbHtml, initLightboxTriggers } from "../../../../shared/ui/lightbox.js";
import { toast } from "../../../../shared/ui/toast.js";
import { burst } from "../../../../shared/ui/burst.js";
import { getAuthState } from "../../lib/auth";
import { messageFor } from "../../lib/errors";
import { confirmHide } from "../boards/hide";
import { replyHtml, replyBoxHtml, handleGateClick } from "../boards/replies";
import { authorLink, fillAuthors } from "../boards/profiles";
import { STATUS, SEVERITY, PRIORITY, FROZEN, type Status, type Priority, type Severity, type Report, type Reply, type Info, type LogEntry } from "./data";
import { S, byId, freshReport, threadOf, infoOf, logOf, shotLink, reply as postReply, triage, hide, edit, remove, addShot, prepareShot } from "./store";
import { isAdmin, isStaff, canDelete, needOf, isPreview } from "./gate";
import { esc, sevBadge, prioBadge, statusBadge, privTag, hiddenTag, bugFinder, mine, insider, tally, longDate, plural, visible } from "./ui";
import { handleBite } from "./bite";
import { I, LINK, LOCK } from "./art";
import { loadServices, serviceSelectHtml, serviceTagHtml } from "../services-pick";

type Done = () => void;
let current: { id: string; close: () => void } | null = null;

const setReportParam = (id: string | null) => {
  const u = new URL(location.href);
  if (id) u.searchParams.set("report", id); else u.searchParams.delete("report");
  u.searchParams.delete("new"); u.searchParams.delete("page");
  history.replaceState(null, "", u);
};

const reply = (c: Reply, staff: boolean) => replyHtml(c, { staff, px: "bz", icons: { shield: I.shield, eye: I.eyeOff }, date: longDate, hideAttr: "data-hide-reply", author: authorLink });

function historyHtml(r: Report) {
  const list = [...r.statusHistory].reverse();
  return `<div class="bt-history">${list.map((h, i) => {
    const note = h.kind === "note" || !h.status;
    const first = i === list.length - 1 && h.status === "open";
    const m = note ? { label: "Note added", tone: "gray" } : { label: first ? "Reported" : STATUS[h.status!].label, tone: STATUS[h.status!].tone };
    return `<div class="bt-history-item"><div class="bt-history-line"><span class="bt-history-dot bt-history-dot--${m.tone}"></span><span class="bt-history-rule"></span></div><div class="bt-history-body"><div><strong style="font-weight:600">${m.label}</strong>${h.changedBy?.handle ? ` · @${esc(h.changedBy.handle)}` : ""}</div>${h.note ? `<div class="bz-hnote">${esc(h.note)}</div>` : ""}<div class="bt-meta">${longDate(h.changedAt)}</div></div></div>`;
  }).join("")}</div>`;
}

const LOG_LABEL: Record<string, string> = { title: "title", whatHappened: "what happened", expected: "what should have happened", steps: "steps", page: "page", severity: "how bad", serviceId: "part of the site" };
function logTitle(e: LogEntry): { label: string; note: string } {
  const keys = Object.keys(e.changes || {});
  if (e.action === "edit") return { label: e.details?.removedShot ? "Removed the screenshot" + (keys.length ? ` and edited ${keys.map((k) => LOG_LABEL[k] || k).join(", ")}` : "") : `Edited ${keys.map((k) => LOG_LABEL[k] || k).join(", ") || "the report"}`, note: e.reason ? `Reason: ${e.reason}` : "" };
  if (e.action === "triage") {
    const parts: string[] = [];
    const st: any = e.changes?.status, pr: any = e.changes?.priority;
    if (st) parts.push(`Moved to ${STATUS[st.after as Status]?.label || st.after}`);
    if (pr) parts.push(pr.after ? `${PRIORITY[pr.after as Priority]?.label || pr.after} priority` : "Cleared the priority");
    return { label: parts.join(", ") || "Added a note", note: e.reason || "" };
  }
  if (e.action === "hide" || e.action === "unhide") return { label: `${e.action === "hide" ? "Hid" : "Unhid"} ${e.details?.replyId ? "a reply" : "the report"}`, note: e.reason ? `Reason: ${e.reason}` : "" };
  return { label: e.action, note: e.reason };
}
const activityHtml = (log: LogEntry[]) => (log.length
  ? `<div class="bt-history">${log.map((e) => { const t = logTitle(e); return `<div class="bt-history-item"><div class="bt-history-line"><span class="bt-history-dot bt-history-dot--blue"></span><span class="bt-history-rule"></span></div><div class="bt-history-body"><div><strong style="font-weight:600">${esc(t.label)}</strong></div>${t.note ? `<div class="bz-hnote">${esc(t.note)}</div>` : ""}<div class="bt-meta">${esc(e.actorName)}, ${longDate(e.createdAt)}</div></div></div>`; }).join("")}</div>`
  : '<p class="bt-section-text" style="color:var(--bt-text-faint)">No admin activity yet.</p>');

function biteBox(r: Report) {
  const on = S.bit.has(r.id);
  const need = needOf();
  if (r.private) return "";
  const t = tally(r, on);
  if (r.status === "duplicate") return `<div class="bz-bitebox">${t}<p>This one is a duplicate. Add your “bit me too” to the original instead.</p></div>`;
  if (r.status === "fixed") return `<div class="bz-bitebox">${t}<p><b>Zapped.</b> ${plural(r.meTooCount, "member")} hit this, and each got a heads-up when it was fixed. Still happening? Report it again and mention this one.</p></div>`;
  if (r.status === "wont_fix") return `<div class="bz-bitebox">${t}<p>Closed without a change. The note in the history says why.</p></div>`;
  if (need === "signedOut") return `<div class="bz-bitebox">${t}<p><b>${plural(r.meTooCount, "member")}</b> hit this too. Happening to you as well?</p><button type="button" class="bt-btn bt-btn--primary bt-btn--sm" data-join-dlg>Join to add yours</button></div>`;
  if (mine(r)) return `<div class="bz-bitebox">${t}<p>You reported this. <b>${plural(r.meTooCount, "member")}</b> hit it too.</p></div>`;
  if (on) return `<div class="bz-bitebox">${t}<p><b>You and ${r.meTooCount - 1} ${r.meTooCount - 1 === 1 ? "other" : "others"}</b> hit this. You'll hear when it's fixed.</p></div>`;
  return `<div class="bz-bitebox">${t}<p><b>${plural(r.meTooCount, "member")}</b> hit this too. Happening to you as well? Tap the bug.${r.status === "cant_reproduce" ? " It helps the team find it." : ""}</p></div>`;
}

function stepsHtml(steps: string) {
  const lines = steps.split("\n").map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return "";
  const numbered = lines.every((l) => /^\d+[.)]\s*/.test(l));
  return `<div class="bt-modal-section"><span class="bt-section-label">Steps to reproduce</span>${numbered ? `<ol class="bz-steps">${lines.map((l) => `<li>${esc(l.replace(/^\d+[.)]\s*/, ""))}</li>`).join("")}</ol>` : `<p class="bt-section-text">${esc(steps)}</p>`}</div>`;
}

function shotSection(r: Report, info: Info, link: string | null) {
  if (!insider(r)) return `<div class="bz-locked">${LOCK}<span>Screenshots and device details are only visible to the reporter and the team.</span></div>`;
  const device = info.device ? [info.device.browser, info.device.os, info.device.viewport].filter(Boolean) : [];
  const canAdd = mine(r) && !FROZEN.includes(r.status) && !r.closed && !r.shotRef;
  const shot = r.shotRef ? (link ? thumbHtml({ src: link, full: link, alt: "Screenshot attached to the report" }) : '<span class="bt-skeleton" style="height:140px;width:100%"></span>')
    : canAdd ? `<button type="button" class="bt-dropzone" data-add-shot><span><b>Add a screenshot</b></span><span class="bt-hint">JPG, PNG or WebP, up to 10 MB.</span></button><input type="file" accept="image/png,image/jpeg,image/webp" hidden data-shot-file>`
    : '<p class="bt-section-text" style="color:var(--bt-text-faint)">No screenshot.</p>';
  return `<div class="bt-modal-section"><span class="bt-section-label">Screenshot and device</span>${shot}${device.length ? `<div class="bz-device">${device.map((d) => `<span class="bt-tag">${esc(d)}</span>`).join("")}</div>` : ""}<span class="bt-hint">${LOCK.replace("<svg", '<svg width="11" height="11"')} Only ${mine(r) ? "you" : "the reporter"} and the team see these.</span></div>`;
}

function threadSection(r: Report, thread: Reply[]) {
  if (!insider(r)) return "";
  const s = getAuthState();
  const staff = isStaff(), need = needOf(s);
  const who = mine(r) ? "Only you and the team can see this." : "Only the reporter and the team can see this.";
  const items = thread.filter((c) => !c.hidden || staff);
  const box = r.hidden && !staff ? "" : replyBoxHtml(need, { px: "bz", email: s.user?.email || "", composerId: "bz-reply", placeholder: mine(r) ? "Add a detail for the team…" : "Reply to the reporter…", joinLine: "<b>Join to reply.</b> It's free.", finishLine: "<b>Finish signing up to reply.</b> Pick your handle first.", verifyLead: "Verify your email to reply." });
  return `<div class="bt-modal-section"><div class="bz-thread-h">${LOCK}<span class="bt-section-label">Talk with the team</span></div><p class="bt-hint" style="margin:0">${who}</p>${items.length ? `<div class="bt-comments">${items.map((c) => reply(c, staff)).join("")}</div>` : '<p class="bt-section-text" style="color:var(--bt-text-faint)">No messages yet.</p>'}<div style="margin-top:var(--bt-space-3)">${box}</div></div>`;
}

function adminPanel(r: Report, log: LogEntry[], mayDelete: boolean) {
  const opt = (map: Record<string, { label: string }>, cur: string | null, none = "") => (none ? `<option value="">${none}</option>` : "") + Object.entries(map).map(([k, m]) => `<option value="${k}"${k === cur ? " selected" : ""}>${m.label}</option>`).join("");
  return `<div class="bt-admin-panel" data-admin-panel><span class="bt-admin-tag">${I.shield}Admin only</span>
    <div class="bt-form-grid"><div class="bt-field"><label class="bt-label" for="bz-a-status">Status</label><select id="bz-a-status" class="bt-select" data-f="status">${opt(STATUS, r.status)}</select></div>
    <div class="bt-field"><label class="bt-label" for="bz-a-prio">Priority</label><select id="bz-a-prio" class="bt-select" data-f="priority">${opt(PRIORITY, r.priority, "Not set")}</select></div></div>
    <div class="bt-field" data-dup-field ${r.status === "duplicate" ? "" : "hidden"}><span class="bt-label">Duplicate of</span><label class="bt-search bz-pick-search">${I.search}<input class="bt-input" type="search" placeholder="Search reports" aria-label="Search reports to link" data-dup-search autocomplete="off"></label><div class="bt-pick-list" data-dup-list></div><span class="bt-hint">Its reporter gets added as a “bit me too” on the original.</span></div>
    <div class="bt-field"><label class="bt-label" for="bz-a-note">Note (optional, shows in the history)</label><textarea id="bz-a-note" class="bt-textarea" rows="2" maxlength="1000" placeholder="e.g. Reproduced on Chrome and Firefox." data-f="note"></textarea></div>
    <p class="bt-error" hidden data-save-err></p>
    <div class="bt-form-actions"><span class="bz-hint-gold">${bugFinder(18)}Confirming gives the reporter Bug Finder.</span><button type="button" class="bt-btn bt-btn--admin" data-save disabled>Save</button></div>
    <div class="bt-modal-section"><span class="bt-section-label">Admin activity</span>${activityHtml(log)}</div>
    <div class="bt-form-actions" style="justify-content:space-between">${mayDelete ? `<button type="button" class="bt-btn bt-btn--secondary" data-hide-report data-hidden="${r.hidden}">${I.eyeOff}${r.hidden ? "Unhide report" : "Hide report"}</button><button type="button" class="bt-btn bt-btn--danger" data-delete>${I.trash}Delete report</button>` : `<span class="bt-hint">Deleting needs the owner or a Right Hand. Hide it instead.</span><button type="button" class="bt-btn bt-btn--secondary" data-hide-report data-hidden="${r.hidden}">${I.eyeOff}${r.hidden ? "Unhide report" : "Hide report"}</button>`}</div>
  </div>`;
}

interface Ctx { thread: Reply[]; info: Info; log: LogEntry[]; link: string | null; mayDelete: boolean; dup: Report | null }

function dialogHtml(r: Report, c: Ctx) {
  const staff = isStaff(), adminOn = isAdmin();
  const tools = adminOn ? `<button type="button" class="bt-btn bt-btn--sm bt-btn--admin" data-edit aria-label="Edit">${I.pencil}<span class="bt-btn-label">Edit</span></button>` : "";
  const edited = r.editedAt ? `<br><span class="bt-edited">${I.pencil}Edited by an admin on ${longDate(r.editedAt)}</span>` : "";
  const sub = `Reported by ${authorLink(r.by)} on ${longDate(r.createdAt)} · <span class="bz-page-ref">${LINK}${esc(r.page)}</span>${r.serviceId ? ` ${serviceTagHtml(r.serviceId)}` : ""}${edited}`;
  const dup = r.duplicateOf ? (c.dup && visible(c.dup) && !c.dup.private ? `<div class="bz-dup">${LINK.replace("<svg", '<svg width="16" height="16"')}<span>Duplicate of <a href="/bug-zapper?report=${esc(c.dup.id)}" data-open-report="${esc(c.dup.id)}">${esc(c.dup.title)}</a></span>${statusBadge(c.dup.status)}</div>` : `<div class="bz-dup">${LINK.replace("<svg", '<svg width="16" height="16"')}<span>This one is linked to a report the team is already on.</span></div>`) : "";
  const bars = [
    r.hidden && staff ? `<div class="bz-hiddenbar">${I.eyeOff}<p>Hidden by @${esc(r.hiddenBy?.handle || "a mod")}${r.hiddenReason ? `: ${esc(r.hiddenReason)}` : ""}. Only staff see this.</p><button type="button" class="bt-btn bt-btn--secondary bt-btn--sm" data-hide-report data-hidden="true">Unhide</button></div>` : "",
    r.private ? `<div class="bz-locked">${LOCK}<span>${mine(r) ? "<b>Private report.</b> Only you and the team can see it. It isn't on the public board." : "<b>Private report</b> (security or privacy). Only the reporter and staff see it."}</span></div>` : "",
  ].join("");
  const modHide = staff && !adminOn && !r.hidden ? `<div class="bt-modal-actions"><button type="button" class="bt-btn bt-btn--secondary" data-hide-report data-hidden="false">${I.eyeOff}Hide report</button></div>` : "";
  return `${modalHeader(esc(r.title), sub, tools)}
    <div class="bz-badges">${sevBadge(r.severity)}${statusBadge(r.status)}${r.priority ? prioBadge(r.priority) : ""}${r.private ? privTag : ""}${r.hidden ? hiddenTag : ""}</div>
    ${bars}${biteBox(r)}${dup}
    <div class="bt-modal-section"><span class="bt-section-label">What happened</span><p class="bt-section-text">${esc(r.whatHappened)}</p></div>
    ${r.expected ? `<div class="bt-modal-section"><span class="bt-section-label">What should have happened</span><p class="bt-section-text">${esc(r.expected)}</p></div>` : ""}
    ${stepsHtml(r.steps)}
    ${shotSection(r, c.info, c.link)}${threadSection(r, c.thread)}
    <div class="bt-modal-section"><span class="bt-section-label">History</span>${historyHtml(r)}</div>
    ${modHide}${adminOn ? adminPanel(r, c.log, c.mayDelete) : ""}`;
}

/** The "this report isn't here" dialog (hidden, private to someone else, deleted). */
function goneDialog(onClose: () => void, why = "It was hidden, deleted, or it's private to its reporter and the team.") {
  const m = openModal({ title: "This report isn't here", feature: "bug-zapper", content: `${modalHeader("This report isn't here")}<p class="bt-section-text">${esc(why)}</p><div class="bt-modal-actions"><button type="button" class="bt-btn bt-btn--secondary" data-bt-close>Back to the board</button></div>`, onClose });
  return m;
}

/** Opens a report. `onChange` runs after anything that changes the board (a bite, a status, a delete) so the page can redraw. */
export async function openReport(id: string, onChange: Done = () => {}) {
  current?.close();
  const first = byId(id) || (await freshReport(id));
  if (!first || !visible(first)) { goneDialog(() => setReportParam(null)); setReportParam(id); return; }
  let report: Report = first, ctx: Ctx = { thread: [], info: { device: null, shot: null }, log: [], link: null, mayDelete: false, dup: null };
  let closed = false;
  const m = openModal({ title: first.title, wide: true, feature: "bug-zapper", content: '<div class="bz-dlg-load"><span class="bt-skeleton" style="height:22px;width:60%"></span><span class="bt-skeleton" style="height:90px;margin-top:12px"></span></div>', onClose: () => { closed = true; if (current?.id === id) current = null; setReportParam(null); } });
  current = { id, close: m.close };
  setReportParam(id);
  const modal = m.modal;

  const load = async (): Promise<boolean> => {
    const fresh = await freshReport(id);
    if (!fresh || !visible(fresh)) { toast("This report isn't here anymore.", { kind: "info" }); onChange(); m.close(); return false; }
    report = fresh;
    const ins = insider(fresh);
    await loadServices({ preview: isPreview() });   // the service tag's name (Service Hub)
    const [thread, info, log, mayDelete] = await Promise.all([ins ? threadOf(id) : Promise.resolve([] as Reply[]), ins ? infoOf(id) : Promise.resolve({ device: null, shot: null } as Info), isAdmin() ? logOf(id) : Promise.resolve([] as LogEntry[]), canDelete()]);
    ctx = { ...ctx, thread, info, log, mayDelete, dup: fresh.duplicateOf ? (byId(fresh.duplicateOf) || (await freshReport(fresh.duplicateOf))) : null };
    if (ins && fresh.shotRef && !ctx.link) { shotLink(id).then((u) => { ctx.link = u; if (!closed) draw(); }).catch(() => {}); }
    if (!fresh.shotRef) ctx.link = null;
    return true;
  };
  const draw = () => {
    if (closed) return;
    const keep = modal.querySelector<HTMLTextAreaElement>("#bz-reply")?.value || "";
    const dirty = { status: val("status"), priority: val("priority"), note: val("note") };
    const top = modal.scrollTop;
    modal.innerHTML = dialogHtml(report, ctx);
    const box = modal.querySelector<HTMLElement>(".bt-composer");
    if (box) {
      initComposer(box, { busyLabel: "Sending…", onSubmit: async (text: string) => {
        try { await postReply(id, text); } catch (err) { throw new Error(messageFor(err, "Couldn't send your message. Try again.")); }
        await refresh();
      } });
      const ta = box.querySelector<HTMLTextAreaElement>("textarea");
      if (ta && keep) { ta.value = keep; ta.dispatchEvent(new Event("input")); }
    }
    initLightboxTriggers(modal);
    if (!isPreview()) void fillAuthors(modal);   // the live handle (a preview has no profiles to read)
    modal.scrollTop = top;
    wirePanel(dirty);
  };
  const val = (k: string) => modal.querySelector<HTMLSelectElement | HTMLTextAreaElement>(`[data-f="${k}"]`)?.value ?? null;
  const refresh = async () => { if (await load()) { draw(); onChange(); } };

  /** The admin panel: Save wakes up when something changed; Duplicate needs its original picked. */
  function wirePanel(keep: { status: string | null; priority: string | null; note: string | null }) {
    const save = modal.querySelector<HTMLButtonElement>("[data-save]");
    if (!save) return;
    const field = (k: string) => modal.querySelector<HTMLSelectElement | HTMLTextAreaElement>(`[data-f="${k}"]`)!;
    if (keep.status) (field("status") as HTMLSelectElement).value = keep.status;
    if (keep.priority != null) (field("priority") as HTMLSelectElement).value = keep.priority;
    if (keep.note) (field("note") as HTMLTextAreaElement).value = keep.note;
    let dupId: string | null = report.duplicateOf;
    const dupField = modal.querySelector<HTMLElement>("[data-dup-field]")!, dupList = modal.querySelector<HTMLElement>("[data-dup-list]")!, dupSearch = modal.querySelector<HTMLInputElement>("[data-dup-search]")!;
    const drawDup = () => {
      const q = dupSearch.value.trim().toLowerCase();
      const list = S.reports.filter((x) => x.id !== id && !x.hidden && (!q || x.title.toLowerCase().includes(q) || x.by.handle.toLowerCase().includes(q))).slice(0, 6);
      dupList.innerHTML = list.map((x) => `<button type="button" class="bt-pick" aria-pressed="${dupId === x.id}" data-pick="${esc(x.id)}"><span class="bt-pick-main"><b>${esc(x.title)}</b><small>@${esc(x.by.handle)} · ${longDate(x.createdAt)} · ${STATUS[x.status].label}${x.private ? " · Private" : ""}</small></span></button>`).join("") || '<p class="bt-hint">No reports match.</p>';
    };
    const changed = () => {
      const st = (field("status") as HTMLSelectElement).value, pr = (field("priority") as HTMLSelectElement).value || null;
      const dupOk = st !== "duplicate" || !!dupId;
      dupField.hidden = st !== "duplicate";
      save.disabled = !dupOk || !(st !== report.status || (pr || null) !== (report.priority || null) || (field("note") as HTMLTextAreaElement).value.trim() || (st === "duplicate" && dupId !== report.duplicateOf));
    };
    ["status", "priority", "note"].forEach((k) => { field(k).addEventListener("input", changed); field(k).addEventListener("change", changed); });
    dupSearch.addEventListener("input", drawDup);
    dupList.addEventListener("click", (e) => { const b = (e.target as Element).closest<HTMLElement>("[data-pick]"); if (!b) return; dupId = b.dataset.pick!; drawDup(); changed(); });
    drawDup(); changed();
    save.addEventListener("click", async () => {
      const err = modal.querySelector<HTMLElement>("[data-save-err]")!;
      err.hidden = true; save.disabled = true;
      const status = (field("status") as HTMLSelectElement).value as Status;
      try {
        const res = await triage(id, { status, priority: ((field("priority") as HTMLSelectElement).value || null) as Priority | null, duplicateOf: status === "duplicate" ? dupId : null, note: (field("note") as HTMLTextAreaElement).value.trim() });
        toast(res.statusChanged ? `Moved to ${STATUS[status].label}.` : "Saved.");
        await refresh();
        if (res.rewards?.badge) burst(modal.querySelector<HTMLElement>(".bz-badges") || modal, { colors: ["var(--bt-ice)", "var(--bt-lamp)", "var(--bt-title)"] });
      } catch (e) { err.textContent = messageFor(e, "Couldn't save. Try again."); err.hidden = false; changed(); }
    });
  }

  modal.addEventListener("click", async (e) => {
    const t = e.target as Element;
    const bite = t.closest<HTMLElement>("[data-bite]");
    if (bite) { e.preventDefault(); await handleBite(bite, bite.dataset.bite!, async () => { draw(); onChange(); }); return; }
    if (await handleGateClick(t, "Join to report bugs")) return;
    const goto = t.closest<HTMLElement>("[data-open-report]");
    if (goto) { e.preventDefault(); void openReport(goto.dataset.openReport!, onChange); return; }
    if (t.closest("[data-edit]")) { openEdit(report, refresh); return; }
    if (t.closest("[data-add-shot]")) { modal.querySelector<HTMLInputElement>("[data-shot-file]")?.click(); return; }
    const hr = t.closest<HTMLElement>("[data-hide-reply]");
    if (hr) { await toggleHide(id, hr.dataset.hidden !== "true", hr.dataset.hideReply!, report.title, refresh); return; }
    const hp = t.closest<HTMLElement>("[data-hide-report]");
    if (hp) { await toggleHide(id, hp.dataset.hidden !== "true", undefined, report.title, refresh); return; }
    if (t.closest("[data-delete]")) {
      void confirmAction({ title: "Delete this report?", message: `"${report.title}" will be removed, with its screenshot, its thread, its ${plural(report.meTooCount, "bit me too", "bit me toos")} and its activity. This can't be undone. Hiding it keeps everything.`, confirmLabel: "Delete report", busyLabel: "Deleting…", feature: "bug-zapper",
        onConfirm: async () => { try { await remove(id); } catch (err) { throw new Error(messageFor(err, "Couldn't delete it. Try again.")); } } })
        .then((ok: boolean) => { if (ok) { toast("Report deleted."); onChange(); m.close(); } });
    }
  });
  modal.addEventListener("change", async (e) => {
    const inp = e.target as HTMLInputElement;
    if (!inp.matches("[data-shot-file]") || !inp.files?.[0]) return;
    try { toast("Uploading…", { kind: "info", ms: 2500 }); await addShot(id, await prepareShot(inp.files[0])); toast("Screenshot added."); await refresh(); }
    catch (err) { toast(messageFor(err, "Couldn't add the screenshot. Try again."), { kind: "error" }); }
  });

  if (await load()) { draw(); void modal.focus(); }
}

/** Hide (with a required reason) or unhide a report or one thread reply. `hide` says what the click should do: true hides. */
async function toggleHide(id: string, hide_: boolean, replyId: string | undefined, title: string, after: () => Promise<void>) {
  const what = replyId ? "reply" : "report";
  if (!hide_) {
    try { await hide(id, false, "", replyId); toast(`${replyId ? "Reply" : "Report"} unhidden.`); await after(); }
    catch (err) { toast(messageFor(err, "Couldn't unhide it. Try again."), { kind: "error" }); }
    return;
  }
  void confirmHide({ title: `Hide this ${what}?`, message: replyId ? "The reporter won't see it. Staff still do, with your reason." : `"${title}" will leave the board for members and visitors. Staff still see it. You can unhide it later.`, confirmLabel: `Hide ${what}`, feature: "bug-zapper",
    run: async (reason: string) => { try { await hide(id, true, reason, replyId); } catch (err) { throw new Error(messageFor(err, "Couldn't hide it. Try again.")); } },
  }).then(async (ok: boolean) => { if (ok) { toast(`${replyId ? "Reply" : "Report"} hidden.`); await after(); } });
}

/** Admin Edit: title, page, what happened, expected, steps, how bad, and removing the screenshot (adminEditItem kind bugReport). Sends only what changed, with the values it loaded. */
function openEdit(r: Report, done: () => Promise<void>) {
  let severity: Severity = r.severity;
  const m = openModal({ title: "Edit report", feature: "bug-zapper", content: `${modalHeader("Edit report", "Fix typos and details, or correct how bad it is. The change is marked on the report and logged under Admin activity.")}
    <div class="bt-field"><label class="bt-label" for="bz-et">Name</label><input id="bz-et" class="bt-input" type="text" maxlength="200" value="${esc(r.title)}"></div>
    <div class="bt-field"><label class="bt-label" for="bz-ep">Page or feature</label><input id="bz-ep" class="bt-input" type="text" maxlength="300" value="${esc(r.page)}"></div>
    <div data-svc-edit></div>
    <div class="bt-field"><label class="bt-label" for="bz-ew">What happened</label><textarea id="bz-ew" class="bt-textarea" rows="4" maxlength="2000">${esc(r.whatHappened)}</textarea></div>
    <div class="bt-field"><label class="bt-label" for="bz-ex">What should have happened</label><textarea id="bz-ex" class="bt-textarea" rows="2" maxlength="2000">${esc(r.expected)}</textarea></div>
    <div class="bt-field"><label class="bt-label" for="bz-es">Steps</label><textarea id="bz-es" class="bt-textarea" rows="3" maxlength="2000">${esc(r.steps)}</textarea></div>
    <div class="bt-field"><span class="bt-label" id="bz-esv">How bad is it?</span><div class="bz-sev-pick" role="radiogroup" aria-labelledby="bz-esv">${(Object.keys(SEVERITY) as Severity[]).map((k) => `<button type="button" role="radio" aria-checked="${k === severity}" data-sev-pick="${k}">${sevBadge(k)}<span>${SEVERITY[k].help}</span></button>`).join("")}</div></div>
    ${r.shotRef ? `<label class="bt-check"><input type="checkbox" data-remove-shot><span><b>Remove the screenshot.</b> It is deleted from storage for good.</span></label>` : ""}
    <div class="bt-field"><label class="bt-label" for="bz-er">Reason (optional, logged)</label><input id="bz-er" class="bt-input" type="text" maxlength="300" placeholder="Fixed a typo"></div>
    <p class="bt-error" hidden data-err></p>
    <div class="bt-modal-actions"><button type="button" class="bt-btn bt-btn--secondary" data-bt-close>Cancel</button><button type="button" class="bt-btn bt-btn--admin" data-go>Save edit</button></div>` });
  const q = <T extends HTMLElement>(s: string) => m.modal.querySelector<T>(s)!;
  void loadServices({ preview: isPreview() }).then((list) => { const slot = m.modal.querySelector<HTMLElement>("[data-svc-edit]"); if (slot && list.length) slot.innerHTML = serviceSelectHtml({ id: "bz-esvc", label: "Which part of the site?", list, value: r.serviceId || "", none: "Not sure" }); });
  m.modal.addEventListener("click", (e) => {
    const b = (e.target as Element).closest<HTMLElement>("[data-sev-pick]");
    if (!b) return;
    severity = b.dataset.sevPick as Severity;
    m.modal.querySelectorAll<HTMLElement>("[data-sev-pick]").forEach((x) => x.setAttribute("aria-checked", String(x === b)));
  });
  q<HTMLButtonElement>("[data-go]").addEventListener("click", async (e) => {
    const btn = e.currentTarget as HTMLButtonElement, err = q("[data-err]");
    const now: Record<string, string> = { title: q<HTMLInputElement>("#bz-et").value.trim(), page: q<HTMLInputElement>("#bz-ep").value.trim(), whatHappened: q<HTMLTextAreaElement>("#bz-ew").value.trim(), expected: q<HTMLTextAreaElement>("#bz-ex").value.trim(), steps: q<HTMLTextAreaElement>("#bz-es").value.trim(), severity, serviceId: m.modal.querySelector<HTMLSelectElement>("#bz-esvc")?.value ?? (r.serviceId || "") };
    const was: Record<string, string> = { title: r.title, page: r.page, whatHappened: r.whatHappened, expected: r.expected, steps: r.steps, severity: r.severity, serviceId: r.serviceId || "" };
    const changes: Record<string, string> = {}, before: Record<string, string> = {};
    Object.keys(now).forEach((k) => { if (now[k] !== was[k]) { changes[k] = now[k]; before[k] = was[k]; } });
    const removeShot = !!m.modal.querySelector<HTMLInputElement>("[data-remove-shot]")?.checked;
    if (!Object.keys(changes).length && !removeShot) { err.textContent = "Nothing was changed."; err.hidden = false; return; }
    btn.disabled = true; err.hidden = true;
    try { await edit(r.id, changes, before, q<HTMLInputElement>("#bz-er").value.trim(), removeShot); toast("Edit saved."); m.close(); await done(); }
    catch (ex) { err.textContent = messageFor(ex, "Couldn't save the edit. Try again."); err.hidden = false; btn.disabled = false; }
  });
}

export const closeReport = () => current?.close();
