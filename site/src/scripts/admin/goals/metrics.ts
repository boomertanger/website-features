// The Metrics tab (docs/specs/goal-tracker.md §6): a table of every metric. Automatic ones (Twitch
// followers, YouTube subscribers, TikTok from the manual card, Fan Club members) count themselves every
// morning and show their value; typed-in ones have a number box and Save (goalTrackerSetMetric). Add,
// edit and delete a metric in a small dialog. A metric measured in USD is income: it starts private and
// showing it needs a confirmation.
import { openModal, modalHeader } from "../../../../../shared/ui/modal.js";
import { confirmAction } from "../../../../../shared/ui/confirm.js";
import { toast } from "../../../../../shared/ui/toast.js";
import { escapeHtml as esc } from "../../../../../shared/ui/dom.js";
import { messageFor, reasonOf } from "../../../lib/errors";
import { fmt, dateText } from "../../goals/data";
import { state, setMetric, saveMetric, deleteMetric, type DMetric, type Visibility } from "./model";

const FEATURE = "goal-tracker";
const VIS: Record<string, string> = { public: "🌐", members: "👥", private: "🔒" };
const VIS_NAME: Record<string, string> = { public: "Public", members: "Members", private: "Private (admins only)" };
const sourceText = (m: DMetric) => (m.source === "manual" ? "Typed in" : m.source === "auto:tiktokFollowers" ? "Automatic, or the manual card on /admin" : "Automatic");

export function initMetrics(host: HTMLElement, onChange: () => void) {
  const table = host.querySelector<HTMLElement>("[data-metrics]")!;

  function render() {
    const rows = Object.values(state.draft.metrics);
    if (!rows.length) { table.innerHTML = `<tbody><tr><td class="bt-muted">No metrics yet. Load the starting plan on the Plan tab, or add one.</td></tr></tbody>`; return; }
    table.innerHTML = `<thead><tr><th>Metric</th><th class="gt-hide-sm">Source</th><th>Value</th><th class="gt-hide-sm">Updated</th><th>Seen by</th><th><span class="bt-sr-only">Actions</span></th></tr></thead><tbody>${rows.map((m) => {
      const manual = m.source === "manual";
      const value = manual
        ? `<span class="gt-est"><input class="bt-input" type="number" min="0" step="any" value="${m.value ?? ""}" data-val="${esc(m.id)}" aria-label="${esc(m.label)}" style="width:100px"><button type="button" class="bt-btn bt-btn--admin bt-btn--sm" data-save-val="${esc(m.id)}">Save</button></span>`
        : `<span class="gt-tabular">${m.value == null ? "—" : fmt(m.value)}</span>`;
      return `<tr><td>${esc(m.label)}${m.unit ? ` <small class="bt-muted">${esc(m.unit)}</small>` : ""}</td><td class="gt-hide-sm bt-muted">${sourceText(m)}</td><td>${value}</td>`
        + `<td class="gt-hide-sm bt-muted">${m.updatedAt ? esc(dateText(m.updatedAt)) : "—"}</td><td><span title="${VIS_NAME[m.visibility]}" aria-label="${VIS_NAME[m.visibility]}">${VIS[m.visibility]}</span></td>`
        + `<td class="gt-row-acts"><button type="button" class="bt-icon-btn bt-icon-btn--sm" data-edit-metric="${esc(m.id)}" aria-label="Edit ${esc(m.label)}">✎</button></td></tr>`;
    }).join("")}</tbody>`;
  }

  table.addEventListener("click", async (e) => {
    const t = e.target as HTMLElement;
    const save = t.closest<HTMLButtonElement>("[data-save-val]");
    if (save) {
      const id = save.dataset.saveVal!;
      const input = table.querySelector<HTMLInputElement>(`[data-val="${CSS.escape(id)}"]`)!;
      if (input.value === "" || !Number.isFinite(Number(input.value)) || Number(input.value) < 0) { toast("Enter a number from 0 up.", { kind: "error" }); return; }
      save.disabled = true;
      try { await setMetric(id, Number(input.value)); toast("Saved as a draft"); onChange(); }
      catch (err) { toast(messageFor(err), { kind: "error" }); }
      render();
      return;
    }
    const ed = t.closest<HTMLElement>("[data-edit-metric]");
    if (ed) editor(state.draft.metrics[ed.dataset.editMetric!]);
  });
  host.querySelector("[data-add-metric]")!.addEventListener("click", () => editor(null));

  function editor(metric: DMetric | null) {
    const start = metric || { label: "", unit: "", visibility: "members" as Visibility };
    let vis: Visibility = start.visibility;
    const m = openModal({
      title: metric ? `Edit ${metric.label}` : "Add a metric", variant: "editing", feature: FEATURE,
      content: `<div class="bt-edit-banner"><span class="bt-admin-tag bt-admin-tag--small">Editing as admin</span><span class="bt-meta">Saved as a draft until you publish</span></div>
        ${modalHeader(metric ? `Edit ${esc(metric.label)}` : "Add a metric", metric ? esc(sourceText(metric)) : "A number you type in yourself, like average viewers.")}
        <form class="bt-form" data-form novalidate>
          <div class="bt-field"><label class="bt-label" for="gt-m-label">Label</label><input class="bt-input" id="gt-m-label" data-f="label" maxlength="60" value="${esc(start.label)}" required></div>
          <div class="bt-field"><label class="bt-label" for="gt-m-unit">Unit</label><input class="bt-input" id="gt-m-unit" data-f="unit" maxlength="20" value="${esc(start.unit)}" placeholder="e.g. viewers, USD"><span class="bt-hint">A metric measured in USD is income, so it starts private.</span></div>
          <div class="bt-field"><span class="bt-label" id="gt-m-vis">Who sees it</span><div class="gt-vis" role="radiogroup" aria-labelledby="gt-m-vis">${(["public", "members", "private"] as Visibility[]).map((v) => `<button type="button" class="bt-chip${v === vis ? " is-active" : ""}" role="radio" aria-checked="${v === vis}" data-vis="${v}">${VIS[v]} ${VIS_NAME[v].split(" ")[0]}</button>`).join("")}</div></div>
          <p class="bt-notice bt-notice--error" data-err role="alert" hidden></p>
          <div class="bt-modal-actions gt-dlg-acts">
            ${metric ? `<button type="button" class="bt-btn bt-btn--danger bt-btn--sm" data-delete>Delete</button>` : ""}
            <button type="button" class="bt-btn bt-btn--secondary" data-bt-close>Cancel</button>
            <button type="submit" class="bt-btn bt-btn--admin" data-save>${metric ? "Save changes" : "Add metric"}</button>
          </div></form>`,
    });
    const $ = <T extends HTMLElement = HTMLElement>(s: string) => m.modal.querySelector<T>(s)!;
    const err = $("[data-err]");
    const showErr = (msg: string) => { err.textContent = msg; err.hidden = !msg; };
    m.modal.querySelectorAll<HTMLElement>("[data-vis]").forEach((b) => b.addEventListener("click", () => {
      vis = b.dataset.vis as Visibility;
      m.modal.querySelectorAll<HTMLElement>("[data-vis]").forEach((x) => { x.classList.toggle("is-active", x === b); x.setAttribute("aria-checked", String(x === b)); });
    }));
    async function save(confirmVisible = false): Promise<void> {
      const label = $<HTMLInputElement>('[data-f="label"]').value.trim(), unit = $<HTMLInputElement>('[data-f="unit"]').value.trim();
      if (!label) return showErr("Give it a label.");
      const btn = $<HTMLButtonElement>("[data-save]");
      btn.disabled = true; showErr("");
      try {
        await saveMetric(metric?.id ?? null, { label, unit, visibility: vis }, confirmVisible);
        m.close(); render(); onChange(); toast("Saved as a draft");
      } catch (e) {
        btn.disabled = false;
        if (reasonOf(e) === "confirmIncome") {
          const ok = await confirmAction({ title: "Show income to members?", message: "This metric is about income, so it starts private. Saving it as visible lets members see the number on /goals once you publish.", confirmLabel: "Show it", busyLabel: "Saving…", danger: false, feature: FEATURE, onConfirm: async () => {} });
          if (ok) return save(true);
          return;
        }
        showErr(messageFor(e));
      }
    }
    $<HTMLFormElement>("[data-form]").addEventListener("submit", (e) => { e.preventDefault(); void save(); });
    m.modal.querySelector("[data-delete]")?.addEventListener("click", () => {
      const tied = state.draft.items.filter((i) => i.metricId === metric!.id).length;
      confirmAction({
        title: `Delete ${metric!.label}?`, message: tied ? `${tied} goal${tied === 1 ? " is" : "s are"} measured by it and will lose ${tied === 1 ? "its" : "their"} meter. Its history is deleted too. This can't be undone.` : "Its history is deleted too. This can't be undone.",
        confirmLabel: "Delete metric", busyLabel: "Deleting…", danger: true, feature: FEATURE,
        onConfirm: async () => { try { await deleteMetric(metric!.id); } catch (e) { throw new Error(messageFor(e)); } m.close(); render(); onChange(); },
      });
    });
    $<HTMLInputElement>('[data-f="label"]').focus();
  }
  return { render };
}
