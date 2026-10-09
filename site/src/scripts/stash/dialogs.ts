// Cloud Stash's dialogs (docs/specs/cloud-stash.md §8; mockup "Dialogs and moments"): File details (a private file shows "Show preview", then a 10-minute countdown), Purge one file, Purge
// orphans and stale (the files listed first, then the SWEPT stamp), the Rule editor (Save stays locked until a dry run), Limits and settings, Untracked files, and Run the sweep now. All through
// openModal / confirmAction / modalHeader. Every change goes through the stash callables; the page redraws from the store afterwards.
import { openModal, modalHeader } from "../../../../shared/ui/modal.js";
import { confirmAction } from "../../../../shared/ui/confirm.js";
import { toast } from "../../../../shared/ui/toast.js";
import { burst } from "../../../../shared/ui/burst.js";
import { cloudinaryUrl } from "../../../../shared/ui/lightbox.js";
import { messageFor, reasonOf } from "../../lib/errors";
import { S, itemOf, previewLink, purge, purgeUntracked, dryRun, saveRule, sweepNow, saveSettings, looseEnds, type Dry } from "./store";
import { canChange, isOwner } from "./gate";
import { featureOf, fmtBytes, NEEDS_OVERSEER } from "./status";
import type { Asset, Rule } from "./data";
import { esc, badge, stamp, ago, ageText, plural } from "./ui";
import { IC } from "./art";
import { isLoose, ruleSentence, titleCache } from "./render";
import { STATUS as BUG_STATUS } from "../bugs/status";
import * as T from "./targets";

let redraw: () => void = () => {};
let fall: (ids: string[]) => Promise<void> = async () => {};
/** The page gives the dialogs its redraw and the "row falls away" animation. */
export const hooks = (h: { redraw: () => void; fall: (ids: string[]) => Promise<void> }) => { redraw = h.redraw; fall = h.fall; };

const lockNote = (t: string) => `<span class="cs-lock-note">${IC.lock}${esc(t)}</span>`;
const base = (a: Asset) => a.publicId.split("/").pop() || a.publicId;
const NOUN: Record<string, string> = { bugZapper: "bug report", gameVault: "game", funFactory: "season" };
const looseWhy = (a: Asset) => (a.scan?.state === "orphan" ? `Orphan: its ${NOUN[a.feature] || "item"} was deleted` : `Stale: the ${NOUN[a.feature] || "item"} moved on to a newer file`);

// ---------- file details ----------
export async function openFile(id: string) {
  const a = S.snap?.assets.find((x) => x.id === id);
  if (!a) return;
  const f = featureOf(a.feature), priv = a.deliveryType === "authenticated";
  const item = await itemOf(a);
  if (item) titleCache.set(a.id, item.title);
  const title = item ? item.title : a.scan?.state === "orphan" ? `Its ${NOUN[a.feature] || "item"} is gone` : base(a);
  let timer = 0, left = 600;
  const m = openModal({ title, wide: true, feature: "cloud-stash", content: "", onClose: () => clearInterval(timer) } as Parameters<typeof openModal>[0]);
  const modal = m.modal;
  const preview = (state: "idle" | "shown" | "expired", url = "") => {
    if (!priv) return `<div class="cs-preview"><img src="${esc(cloudinaryUrl(a.url, "w_900,c_limit,f_auto,q_auto"))}" alt="" loading="lazy" class="cs-preview-img"></div>`;
    if (state === "shown") return `<div class="cs-preview">${url ? `<img src="${esc(url)}" alt="Private file preview" class="cs-preview-img">` : '<span class="cs-art cs-art--shot"></span>'}<span class="cs-expiry" data-expiry>Link expires in 10:00</span></div>`;
    return `<div class="cs-preview"><div class="cs-preview-lock">${IC.lock}<span>${state === "expired" ? "Link expired. Show it again." : "Private file. Only staff can see it, through a link that works for 10 minutes."}</span><button type="button" class="bt-btn bt-btn--sm bt-btn--secondary" data-show>${IC.eye}Show preview</button></div></div>`;
  };
  const draw = (state: "idle" | "shown" | "expired" = "idle", url = "") => {
    const dueRule = a.scan?.due ? S.snap?.rules.find((r) => r.id === a.scan!.due) : null;
    const acts = S.log.filter((e) => e.itemTitle === a.publicId || e.details?.publicId === a.publicId);
    modal.innerHTML = `${modalHeader(esc(title), `${f.ic} ${esc(f.name)} · ${priv ? "Private file" : "Public file"}`)}
      ${preview(state, url)}
      <div class="bt-modal-section"><dl class="cs-kv"><dt>File</dt><dd><span class="bt-code">${esc(a.publicId)}</span></dd><dt>Size</dt><dd>${fmtBytes(a.sizeBytes)}</dd><dt>Uploaded</dt><dd>${esc(ageText(a.createdAt))} ago</dd>
        <dt>Belongs to</dt><dd>${item ? `${item.link ? `<a href="${esc(item.link)}">${esc(item.title)}</a>` : esc(item.title)} <span class="bt-meta">${esc(item.kind)}</span>` : a.scan?.state === "orphan" ? `Nothing: its ${NOUN[a.feature] || "item"} was deleted` : "Nothing we can find"}</dd>
        ${dueRule ? `<dt>Sweep</dt><dd>${badge("blue", "Due")} by “${esc(dueRule.name)}”</dd>` : ""}${a.scan?.state === "stale" ? `<dt>Status</dt><dd>${badge("gold", "Stale")} the item points at a newer file</dd>` : ""}</dl></div>
      <div class="bt-modal-section"><p class="bt-section-label">Admin activity</p>${acts.length ? `<div class="bt-history">${acts.map((e) => `<div class="bt-history-item"><div class="bt-history-line"><span class="bt-history-dot bt-history-dot--blue"></span><span class="bt-history-rule"></span></div><div class="bt-history-body"><div><strong style="font-weight:600">${e.action === "preview" ? "Preview opened" : esc(e.action)}</strong></div><div class="bt-meta">${esc(e.actorName)}, ${esc(ago(e.createdAt))}</div></div></div>`).join("")}</div>` : '<p class="bt-section-text" style="color:var(--bt-text-faint)">Nothing yet.</p>'}</div>
      <div class="bt-modal-actions"><button type="button" class="bt-btn bt-btn--secondary" data-bt-close>Close</button>${canChange(S.tier) ? `<button type="button" class="bt-btn bt-btn--danger" data-purge>${IC.trash}Purge file</button>` : lockNote(`Purging ${NEEDS_OVERSEER.toLowerCase()}`)}</div>`;
  };
  draw();
  modal.addEventListener("click", async (e) => {
    const t = e.target as Element;
    if (t.closest("[data-show]")) {
      const btn = t.closest<HTMLButtonElement>("[data-show]")!;
      btn.disabled = true;
      try {
        const r = await previewLink(a.id);
        draw("shown", r.url); left = r.expiresInS || 600; clearInterval(timer);
        timer = window.setInterval(() => { const el = modal.querySelector("[data-expiry]"); if (!el) return clearInterval(timer); left--; el.textContent = `Link expires in ${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`; if (left <= 0) { clearInterval(timer); draw("expired"); } }, 1000);
      } catch (err) { btn.disabled = false; toast(messageFor(err, "Couldn't open the preview. Try again."), { kind: "error" }); }
      return;
    }
    if (t.closest("[data-purge]")) { m.close(); purgeOne(a.id); }
  });
}

// ---------- purge one ----------
export function purgeOne(id: string) {
  const a = S.snap?.assets.find((x) => x.id === id);
  if (!a) return;
  const target = a.scan?.state === "orphan" ? `Its ${NOUN[a.feature] || "item"} is already gone, so nothing else changes.` : `It also clears it from the ${NOUN[a.feature] || "item"} it belongs to.`;
  void confirmAction({
    title: "Purge this file?", message: `This deletes ${base(a)} (${fmtBytes(a.sizeBytes)}) from Cloudinary for good. ${target} It can't be undone.`, confirmLabel: "Purge file", busyLabel: "Purging…", feature: "cloud-stash",
    onConfirm: async () => {
      let r;
      try { r = await purge([id]); } catch (err) { throw new Error(messageFor(err, "Couldn't purge it. Try again.")); }
      if (!r.results[0]?.ok) throw new Error(r.results[0]?.error || "Couldn't purge it. Try again.");
    },
  }).then(async (ok: boolean) => { if (ok) { await fall([id]); toast("Purged."); redraw(); } });
}

// ---------- purge orphans and stale ----------
export function purgeLoose() {
  const list = (S.snap?.assets || []).filter(isLoose);
  if (!list.length) { toast("No orphans or stale files to purge.", { kind: "info" }); return; }
  const batch = list.slice(0, 50), more = list.length - batch.length;
  const bytes = batch.reduce((n, a) => n + a.sizeBytes, 0);
  const m = openModal({ title: `Purge ${plural(batch.length, "loose file")}?`, feature: "cloud-stash", content: "" });
  const modal = m.modal;
  modal.innerHTML = `${modalHeader(`Purge ${plural(batch.length, "loose file")}?`, `${fmtBytes(bytes)} in total`)}
    <ul class="cs-log">${batch.map((a) => `<li><span aria-hidden="true">🗂</span><span class="bt-code">${esc(base(a))}</span><time>${fmtBytes(a.sizeBytes)}</time><small>${esc(looseWhy(a))}</small></li>`).join("")}</ul>
    ${more ? `<p class="bt-hint">${plural(more, "more file")} will wait: purge up to 50 at a time.</p>` : ""}
    <p class="bt-section-text" style="color:var(--bt-text-muted)">These files are deleted from Cloudinary for good, then their records. Nothing still in use is touched. It can't be undone.</p>
    <p class="bt-error" hidden data-err></p>
    <div class="bt-modal-actions"><button type="button" class="bt-btn bt-btn--secondary" data-bt-close>Cancel</button><button type="button" class="bt-btn bt-btn--danger" data-go>Purge ${plural(batch.length, "file")}</button></div>`;
  modal.querySelector<HTMLButtonElement>("[data-go]")!.addEventListener("click", async (e) => {
    const go = e.currentTarget as HTMLButtonElement, err = modal.querySelector<HTMLElement>("[data-err]")!;
    go.disabled = true; go.innerHTML = '<span class="bt-spinner" aria-hidden="true"></span>Purging…'; err.hidden = true; m.setDismissible(false);
    try {
      const r = await purge(batch.map((a) => a.id));
      m.setDismissible(true);
      const failed = r.results.filter((x) => !x.ok).length;
      sweptView(modal, m.close, { files: r.purged + r.results.filter((x) => x.already).length, bytes: r.bytes, failed, title: `${plural(r.purged, "loose file")} gone` });
      redraw();
    } catch (ex) { m.setDismissible(true); err.textContent = messageFor(ex, "Couldn't purge them. Try again."); err.hidden = false; go.disabled = false; go.textContent = `Purge ${plural(batch.length, "file")}`; }
  });
}

/** The celebration: the SWEPT stamp slams in with a burst, then the numbers. */
export function sweptView(modal: HTMLElement, close: () => void, o: { files: number; bytes: number; failed?: number; title?: string }) {
  modal.innerHTML = `${modalHeader("All swept")}<div class="cs-done" data-burst>${stamp({ kicker: plural(o.files, "file"), label: "Swept", sub: `${fmtBytes(o.bytes)} freed`, tone: "lime" })}<h3>${esc(o.title || `${plural(o.files, "file")} gone`)}</h3><p>Deleted from Cloudinary first, then their records. Each one is in the admin log.${o.failed ? ` ${plural(o.failed, "file")} couldn't be purged: try again.` : ""}</p></div><div class="bt-modal-actions"><button type="button" class="bt-btn bt-btn--primary" data-bt-close>Done</button></div>`;
  burst(modal.querySelector<HTMLElement>(".bt-stamp"), { colors: ["var(--bt-lime)", "var(--bt-title)", "var(--bt-primary-soft)"], n: 18 });
  modal.querySelector("[data-bt-close]")?.addEventListener("click", close);
}

// ---------- sweep now ----------
export function sweepDialog() {
  const due = (S.snap?.assets || []).filter((a) => a.scan?.due && S.snap?.rules.some((r) => r.id === a.scan!.due && r.enabled));
  const bytes = due.reduce((n, a) => n + a.sizeBytes, 0);
  const on = (S.snap?.rules || []).filter((r) => r.enabled).length;
  if (!on) { toast("No rule is switched on, so there is nothing to sweep.", { kind: "info" }); return; }
  void confirmAction({
    title: "Run the sweep now?", message: `This runs every switched-on rule right now, the same code as the morning sweep. About ${plural(due.length, "file")} (${fmtBytes(bytes)}) are due as of the last scan. It stops after ${S.snap?.settings.runCap} files. It can't be undone.`, confirmLabel: "Run the sweep", busyLabel: "Sweeping…", danger: false, feature: "cloud-stash",
    onConfirm: async () => {
      try { await sweepNow(); } catch (err) { throw new Error(messageFor(err, "The sweep couldn't run. Try again.")); }
    },
  }).then((ok: boolean) => {
    if (!ok) return;
    redraw();
    const sw = S.snap?.sweep;
    if (sw && sw.purged > 0) { const m = openModal({ title: "Swept", feature: "cloud-stash", content: "" }); sweptView(m.modal, m.close, { files: sw.purged, bytes: sw.bytes, title: `${plural(sw.purged, "file")} swept` }); }
    else toast(sw && sw.status !== "ok" ? `The sweep finished: ${sw.status}.` : "The sweep ran. Nothing was due.");
  });
}

// ---------- the rule editor ----------
export function openRuleEditor(id?: string) {
  const editing = id ? S.snap?.rules.find((r) => r.id === id) || null : null;
  if (id && (!editing || editing.legacy)) return;
  const st = { statuses: new Set<string>(editing ? editing.statuses : T.BUG.statuses), days: editing ? editing.days : 60, name: editing ? editing.name : "Old bug screenshots", on: false };
  let dry: Dry | null = null, stale = false;
  const m = openModal({ title: editing ? "Edit cleanup rule" : "Add a cleanup rule", feature: "cloud-stash", content: "" });
  const modal = m.modal;
  const input = () => ({ name: st.name.trim(), target: T.BUG.key, statuses: T.BUG.statuses.filter((s) => st.statuses.has(s)), days: Number(st.days) });
  const valid = () => { const i = input(); return !!i.name && i.statuses.length > 0 && Number.isInteger(i.days) && i.days >= T.BUG.daysMin && i.days <= T.BUG.daysMax; };
  const sentence = () => { const i = input(); const all = i.statuses.length === T.BUG.statuses.length; return `Delete <b>${esc(T.BUG.label)}</b> when the report has been <b>${all ? "closed" : i.statuses.length ? `closed as ${T.list(i.statuses.map((s) => BUG_STATUS[s as keyof typeof BUG_STATUS]?.label || s))}` : "(pick a status)"}</b> for <b>${Number.isFinite(i.days) ? i.days : "…"} days</b>.`; };
  const draw = (err = "") => {
    modal.innerHTML = `${modalHeader(editing ? "Edit cleanup rule" : "Add a cleanup rule", editing ? esc(editing.name) : "")}
      <div class="bt-field"><label class="bt-label" for="cs-r-name">Name</label><input class="bt-input" id="cs-r-name" maxlength="80" value="${esc(st.name)}" data-f="name"></div>
      <div class="bt-field"><label class="bt-label" for="cs-r-what">What to clean</label><select class="bt-select" id="cs-r-what"><option>${esc(T.BUG.label)}</option><option disabled>More targets arrive with new features</option></select></div>
      <div class="bt-field"><span class="bt-label">When the report is</span><div class="cs-chips" role="group" aria-label="Report statuses">${T.BUG.statuses.map((s) => `<button type="button" class="bt-chip bt-chip--small${st.statuses.has(s) ? " is-active" : ""}" aria-pressed="${st.statuses.has(s)}" data-status="${s}">${esc(BUG_STATUS[s as keyof typeof BUG_STATUS]?.label || s)}</button>`).join("")}</div><p class="bt-hint">Only closed statuses can be picked. Open and In progress reports never lose their pictures.</p></div>
      <div class="bt-field"><label class="bt-label" for="cs-r-days">For at least</label><div class="cs-inline"><input class="bt-input cs-num" id="cs-r-days" type="number" min="${T.BUG.daysMin}" max="${T.BUG.daysMax}" value="${esc(String(st.days))}" data-f="days"><span class="bt-meta">days (${T.BUG.daysMin} to ${T.BUG.daysMax})</span></div></div>
      ${editing ? "" : `<label class="bt-check"><input type="checkbox" data-on ${st.on ? "checked" : ""}><span><b>Switch it on right away.</b> Otherwise it starts off, and you switch it on after checking the numbers.</span></label>`}
      <div class="cs-sentence" data-sentence>${sentence()}</div>
      ${dry && !stale ? `<div class="cs-dry" role="status"><div class="cs-dry-n"><b>${plural(dry.count, "file")}</b><span>${fmtBytes(dry.bytes)} would be deleted if it ran today</span></div>${dry.examples.length ? `<ul>${dry.examples.map((x) => `<li>${esc(x.title)} <em>${fmtBytes(x.bytes)}${x.days != null ? ` · closed ${x.days} days` : ""}</em></li>`).join("")}</ul>` : ""}${dry.truncated ? '<p class="bt-hint">There may be more than it counts.</p>' : ""}</div>` : ""}
      ${err ? `<div class="bt-notice bt-notice--error" role="alert">${esc(err)}</div>` : ""}
      <div class="bt-modal-actions"><button type="button" class="bt-btn bt-btn--secondary" data-dry${valid() ? "" : " disabled"}>${dry ? "Run the dry run again" : "Dry run"}</button><button type="button" class="bt-btn bt-btn--admin" data-save${dry && !stale && valid() ? "" : " disabled"}>Save rule</button></div>
      ${dry && !stale ? "" : `<p class="bt-fineprint">Save unlocks after a dry run, so you always see what a rule would delete first.</p>`}`;
  };
  draw();
  const touched = () => { stale = true; dry = null; const s = modal.querySelector("[data-sentence]"); if (s) s.innerHTML = sentence(); const d = modal.querySelector<HTMLButtonElement>("[data-dry]"); if (d) { d.disabled = !valid(); d.textContent = "Dry run"; } modal.querySelector<HTMLButtonElement>("[data-save]")?.setAttribute("disabled", ""); modal.querySelector(".cs-dry")?.remove(); };
  modal.addEventListener("input", (e) => { const t = e.target as HTMLInputElement; if (t.dataset.f === "name") st.name = t.value; if (t.dataset.f === "days") st.days = t.value as any; if (t.dataset.f) touched(); });
  modal.addEventListener("change", (e) => { const t = e.target as HTMLInputElement; if (t.matches("[data-on]")) st.on = t.checked; });
  modal.addEventListener("click", async (e) => {
    const t = e.target as Element;
    const chip = t.closest<HTMLElement>("[data-status]");
    if (chip) { const s = chip.dataset.status!; if (st.statuses.has(s)) st.statuses.delete(s); else st.statuses.add(s); chip.classList.toggle("is-active", st.statuses.has(s)); chip.setAttribute("aria-pressed", String(st.statuses.has(s))); touched(); return; }
    if (t.closest("[data-dry]")) {
      const btn = t.closest<HTMLButtonElement>("[data-dry]")!;
      btn.disabled = true; btn.innerHTML = '<span class="bt-spinner" aria-hidden="true"></span>Counting…';
      try { dry = await dryRun(input()); stale = false; draw(); }
      catch (err) { draw(messageFor(err, "Couldn't run the dry run. Try again.")); }
      return;
    }
    if (t.closest("[data-save]") && dry && !stale) {
      const btn = t.closest<HTMLButtonElement>("[data-save]")!;
      btn.disabled = true; btn.innerHTML = '<span class="bt-spinner" aria-hidden="true"></span>Saving…';
      try {
        await saveRule({ op: editing ? "update" : "create", id: editing?.id, rule: { ...input(), enabled: editing ? undefined : st.on }, expectCount: dry.count, updatedAtMs: editing?.updatedAt });
        m.close(); toast(editing ? "Rule saved." : st.on ? "Rule added and switched on." : "Rule added (it starts off)."); redraw();
      } catch (err) {
        if (reasonOf(err) === "numbersChanged") { const n = (err as any)?.details?.count; dry = null; stale = true; draw(`The numbers changed since your dry run${typeof n === "number" ? ` (now ${plural(n, "file")})` : ""}. Run it again before saving.`); }
        else if (reasonOf(err) === "conflict") draw("Someone else changed this rule. Close this and open it again.");
        else draw(messageFor(err, "Couldn't save the rule. Try again."));
      }
    }
  });
}

/** Switch a rule on or off. On needs a look at the numbers first (a dry run, then a confirmation); off is one tap. */
export async function toggleRule(r: Rule, on: boolean) {
  if (!on) {
    try { await saveRule({ op: "toggle", id: r.id, enabled: false }); toast(`“${r.name}” is off.`); } catch (err) { toast(messageFor(err, "Couldn't switch it off. Try again."), { kind: "error" }); }
    redraw();
    return;
  }
  if (!canChange(S.tier)) return;
  let dry: Dry;
  try { dry = await dryRun({ name: r.name, target: r.target || T.BUG.key, statuses: r.statuses, days: r.days }); } catch (err) { toast(messageFor(err, "Couldn't check the numbers. Try again."), { kind: "error" }); redraw(); return; }
  void confirmAction({
    title: `Switch on “${r.name}”?`, message: `${ruleSentence(r).replace(/<[^>]+>/g, "")} If it ran today it would delete ${plural(dry.count, "file")} (${fmtBytes(dry.bytes)}). It runs every morning at 9:00 AM Pacific.`, confirmLabel: "Switch it on", busyLabel: "Switching on…", danger: false, feature: "cloud-stash",
    onConfirm: async () => {
      try { await saveRule({ op: "toggle", id: r.id, enabled: true, expectCount: dry.count }); }
      catch (err) { throw new Error(reasonOf(err) === "numbersChanged" ? `The numbers changed since you looked (now ${(err as any)?.details?.count} files). Close this and try again.` : messageFor(err, "Couldn't switch it on. Try again.")); }
    },
  }).then((ok: boolean) => { if (ok) toast(`“${r.name}” is on.`); redraw(); });
}

export async function deleteRule(r: Rule) {
  void confirmAction({ title: `Delete “${r.name}”?`, message: "The rule is removed. Files it would have swept stay where they are.", confirmLabel: "Delete rule", busyLabel: "Deleting…", feature: "cloud-stash",
    onConfirm: async () => { try { await saveRule({ op: "delete", id: r.id }); } catch (err) { throw new Error(messageFor(err, "Couldn't delete it. Try again.")); } } }).then((ok: boolean) => { if (ok) { toast("Rule deleted."); redraw(); } });
}

// ---------- limits and settings ----------
export function openSettings() {
  const s = S.snap!.settings, owner = isOwner(S.tier);
  const m = openModal({ title: "Limits and settings", feature: "cloud-stash", content: "" });
  const modal = m.modal;
  const pcts = [60, 65, 70, 75, 80, 85, 90, 95];
  modal.innerHTML = `${modalHeader("Limits and settings")}
    <div class="bt-field"><label class="bt-label" for="cs-s-pause">Pause member uploads at</label><select class="bt-select" id="cs-s-pause">${pcts.map((p) => `<option value="${p}"${p === s.pauseAtPct ? " selected" : ""}>${p}%${p === 60 ? " of the monthly credits" : ""}</option>`).join("")}</select><p class="bt-hint">Staff uploads keep working until 100%. At 100% only the owner can upload.</p></div>
    <div class="bt-field"><div class="cs-inline cs-inline--between"><span class="bt-label">Pause member uploads now</span><button type="button" class="bt-switch" role="switch" aria-checked="${s.manualPause}" aria-label="Pause member uploads now" data-pause></button></div><input class="bt-input" placeholder="Reason, shown to admins and saved to the log" aria-label="Reason" maxlength="200" value="${esc(s.manualPauseReason)}" data-reason></div>
    <div class="bt-field"><label class="bt-label" for="cs-s-ret">Keep the admin log for</label><div class="cs-inline"><input class="bt-input cs-num" id="cs-s-ret" type="number" min="90" max="730" value="${S.snap!.retentionDays ?? 365}"${owner ? "" : " disabled"}>${owner ? "" : lockNote("Owner only")}</div><p class="bt-hint">90 to 730 days. A change applies to new entries only.</p></div>
    <p class="bt-error" hidden data-err></p>
    <div class="bt-modal-actions"><button type="button" class="bt-btn bt-btn--secondary" data-bt-close>Cancel</button><button type="button" class="bt-btn bt-btn--admin" data-save>Save changes</button></div>`;
  modal.addEventListener("click", (e) => { const sw = (e.target as Element).closest<HTMLElement>("[data-pause]"); if (sw) sw.setAttribute("aria-checked", String(sw.getAttribute("aria-checked") !== "true")); });
  modal.querySelector<HTMLButtonElement>("[data-save]")!.addEventListener("click", async (e) => {
    const btn = e.currentTarget as HTMLButtonElement, err = modal.querySelector<HTMLElement>("[data-err]")!;
    err.hidden = true; btn.disabled = true;
    const patch: { pauseAtPct?: number; manualPause?: boolean; reason?: string; retentionDays?: number } = {};
    const pct = Number(modal.querySelector<HTMLSelectElement>("#cs-s-pause")!.value);
    if (pct !== s.pauseAtPct) patch.pauseAtPct = pct;
    const pause = modal.querySelector<HTMLElement>("[data-pause]")!.getAttribute("aria-checked") === "true", reason = modal.querySelector<HTMLInputElement>("[data-reason]")!.value.trim();
    if (pause !== s.manualPause || (pause && reason !== s.manualPauseReason)) { patch.manualPause = pause; patch.reason = reason; }
    const ret = Number(modal.querySelector<HTMLInputElement>("#cs-s-ret")!.value);
    if (owner && ret !== (S.snap!.retentionDays ?? 365)) patch.retentionDays = ret;
    if (!Object.keys(patch).length) { m.close(); return; }
    try {
      // the owner's retention change is its own call (the others are Overseer-level)
      const { retentionDays, ...rest } = patch;
      if (Object.keys(rest).length) await saveSettings(rest);
      if (retentionDays !== undefined) await saveSettings({ retentionDays });
      m.close(); toast("Saved."); redraw();
    } catch (ex) { err.textContent = messageFor(ex, "Couldn't save. Try again."); err.hidden = false; btn.disabled = false; }
  });
}

// ---------- untracked files ----------
export function openUntracked() {
  const sc = S.snap?.scan, list = sc?.untracked || [], owner = isOwner(S.tier);
  const m = openModal({ title: "Untracked files", feature: "cloud-stash", content: "" });
  const modal = m.modal;
  const why = (p: { publicId: string; type: string }) => (/^disk-stash\//.test(p.publicId) ? "From the old Squarespace Bug Zapper (upload preset disk-stash)." : /pending\//.test(p.publicId) ? "A cover upload that was never sent. The Vault's own sweep removes it." : "Nothing on the site points at it.");
  modal.innerHTML = `${modalHeader("Untracked files", "In Cloudinary, but the site has no record of them")}
    ${list.length ? `<ul class="cs-log">${list.map((p, i) => `<li><span aria-hidden="true">❔</span><span class="bt-code">${esc(p.publicId)}</span><time>${fmtBytes(p.bytes)} · ${esc(ageText(p.createdAt))}</time><small>${esc(why(p))}${owner ? ` <button type="button" class="bt-btn bt-btn--sm bt-btn--danger-outline" data-purge="${i}">Record and purge</button>` : ` ${lockNote("Owner only")}`}</small></li>`).join("")}</ul>` : `<div class="bt-empty bt-empty--compact cs-empty"><p class="bt-empty-title">None</p><p>${sc ? "The last scan found no untracked files." : "Run a scan to look for them."}</p></div>`}
    ${sc?.truncated || (sc && sc.counts.untracked > list.length) ? `<p class="bt-hint">and ${Math.max(0, (sc?.counts.untracked || 0) - list.length)} more that aren't listed.</p>` : ""}
    <p class="bt-fineprint">Untracked files are never deleted automatically. The owner can record one and purge it through the same safe path as every other file.</p>
    <div class="bt-modal-actions"><button type="button" class="bt-btn bt-btn--secondary" data-bt-close>Close</button></div>`;
  modal.addEventListener("click", (e) => {
    const b = (e.target as Element).closest<HTMLElement>("[data-purge]");
    if (!b || !owner) return;
    const p = list[Number(b.dataset.purge)];
    void confirmAction({ title: "Record and purge this file?", message: `${p.publicId} (${fmtBytes(p.bytes)}) is recorded first, then deleted from Cloudinary for good through the same safe path. It can't be undone.`, confirmLabel: "Record and purge", busyLabel: "Purging…", feature: "cloud-stash",
      onConfirm: async () => { try { await purgeUntracked(p.publicId, p.type); } catch (err) { throw new Error(messageFor(err, "Couldn't purge it. Try again.")); } } })
      .then((ok: boolean) => { if (ok) { toast("Purged."); m.close(); redraw(); if (looseEnds().untracked > 0) openUntracked(); } });
  });
}
