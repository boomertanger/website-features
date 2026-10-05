// The Goal Tracker's edit dialog (docs/specs/goal-tracker.md §6): openModal in the kit's admin edit mode
// (the banner first), fields as in the mockup. Saves through goalTrackerEdit (model.ts), sending only
// the fields that changed on an edit. Delete asks with confirmAction and says how many children go too.
import { openModal, modalHeader } from "../../../../../shared/ui/modal.js";
import { confirmAction } from "../../../../../shared/ui/confirm.js";
import { escapeHtml as esc } from "../../../../../shared/ui/dom.js";
import { messageFor, reasonOf } from "../../../lib/errors";
import { STATUS, STATUS_ORDER } from "../../goals/data";
import { state, createItem, updateItem, deleteItem, descendants, pathOf, type DItem, type Visibility } from "./model";

const FEATURE = "goal-tracker";
const TYPE_NAME: Record<string, string> = { track: "track", goal: "goal", milestone: "milestone", task: "task" };
const VIS: [Visibility, string, string][] = [["public", "🌐", "Public"], ["members", "👥", "Members"], ["private", "🔒", "Private"]];
const sameJson = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

export interface EditorOptions {
  /** Edit this item... */
  item?: DItem;
  /** ...or add a new one of this type under this parent (null for a track). */
  add?: { type: DItem["type"]; parent: DItem | null };
  onDone: () => void;
}

export function openItemEditor({ item, add, onDone }: EditorOptions) {
  const type = item?.type ?? add!.type;
  const { items, metrics, config } = state.draft;
  const parent = item ? (item.parentId ? items.find((i) => i.id === item.parentId) ?? null : null) : add!.parent;
  const trail = item ? pathOf(items, item) : parent ? [...pathOf(items, parent), parent] : [];
  const start = item ?? {
    type, title: "", description: "", help: "", icon: "", status: "planned", startDate: null, dueDate: null,
    visibility: (parent?.visibility === "private" ? "private" : "members") as Visibility, level: type === "milestone" ? (config.levels[0]?.n ?? 0) : null,
    relaunch: { needed: false, weeks: 0, side: "site" as const }, metricId: null, target: null,
  } as Partial<DItem>;
  const has = (f: string) => ({ track: ["title", "description", "icon", "visibility"], goal: ["title", "description", "help", "status", "dueDate", "visibility", "relaunch", "metric"], milestone: ["title", "description", "help", "status", "dueDate", "visibility", "relaunch", "level"], task: ["title", "description", "help", "status", "dueDate", "visibility", "relaunch"] }[type] ?? []).includes(f);
  const children = item ? descendants(items, item.id).length : 0;
  const title = item ? `Edit ${TYPE_NAME[type]}` : `Add ${TYPE_NAME[type]}`;
  const sub = trail.length ? `Under ${trail.map((t) => esc(t.title)).join(" › ")}` : type === "track" ? "A pillar of the plan, like Identity or Collabs." : "";
  const r = start.relaunch || { needed: false, weeks: 0, side: "site" as const };

  const field = (id: string, label: string, control: string, hint = "") => `<div class="bt-field"><label class="bt-label" for="gt-e-${id}">${label}</label>${control}${hint ? `<span class="bt-hint">${hint}</span>` : ""}</div>`;
  const content = `<div class="bt-edit-banner"><span class="bt-admin-tag bt-admin-tag--small">Editing as admin</span><span class="bt-meta">Saved as a draft until you publish</span></div>
  ${modalHeader(title, sub)}
  <form class="bt-form" data-form novalidate>
    ${field("title", "Title", `<input class="bt-input" id="gt-e-title" data-f="title" maxlength="120" value="${esc(start.title || "")}" required>`)}
    ${has("icon") ? field("icon", "Icon (an emoji)", `<input class="bt-input" id="gt-e-icon" data-f="icon" maxlength="8" value="${esc(start.icon || "")}" placeholder="🎭">`) : ""}
    ${has("description") ? field("description", "Description", `<textarea class="bt-textarea" id="gt-e-description" data-f="description" rows="2" maxlength="600">${esc(start.description || "")}</textarea>`) : ""}
    ${has("help") ? field("help", "How you can help (members see this)", `<input class="bt-input" id="gt-e-help" data-f="help" maxlength="200" value="${esc(start.help || "")}" placeholder="e.g. Follow on YouTube and turn on notifications">`) : ""}
    ${has("status") || has("dueDate") ? `<div class="bt-form-grid">
      ${has("status") ? field("status", "Status", `<select class="bt-select" id="gt-e-status" data-f="status">${STATUS_ORDER.map((s) => `<option value="${s}"${start.status === s ? " selected" : ""}>${STATUS[s][0]}</option>`).join("")}</select>`) : ""}
      ${has("dueDate") ? field("dueDate", "Due", `<input class="bt-input" id="gt-e-dueDate" data-f="dueDate" type="date" value="${esc(start.dueDate || "")}">`) : ""}
    </div>` : ""}
    ${has("level") ? field("level", "Level on the road", `<select class="bt-select" id="gt-e-level" data-f="level">${config.levels.map((l) => `<option value="${l.n}"${start.level === l.n ? " selected" : ""}>${l.boss ? "Final boss" : `Level ${l.n}`}: ${esc(l.name)}</option>`).join("")}</select>`) : ""}
    ${has("visibility") ? `<div class="bt-field"><span class="bt-label" id="gt-e-vis-l">Who sees it</span>
      <div class="gt-vis" role="radiogroup" aria-labelledby="gt-e-vis-l">${VIS.map(([v, ic, label]) => `<button type="button" class="bt-chip${start.visibility === v ? " is-active" : ""}" role="radio" aria-checked="${start.visibility === v}" data-vis="${v}">${ic} ${label}</button>`).join("")}</div>
      <span class="bt-hint">It never shows more widely than the item it sits under. Private is admins only.</span></div>` : ""}
    ${has("relaunch") ? `<div class="bt-form-grid">
      <div class="bt-field"><label class="bt-check"><input type="checkbox" data-f="relNeeded"${r.needed ? " checked" : ""}> Needed for relaunch</label></div>
      ${field("relWeeks", "Effort (weeks)", `<input class="bt-input" id="gt-e-relWeeks" data-f="relWeeks" type="number" min="0" max="52" step="0.5" value="${r.weeks}">`)}
      ${field("relSide", "Side", `<select class="bt-select" id="gt-e-relSide" data-f="relSide"><option value="site"${r.side === "site" ? " selected" : ""}>Website</option><option value="stream"${r.side === "stream" ? " selected" : ""}>Stream prep</option></select>`)}
    </div>` : ""}
    ${has("metric") ? `<div class="bt-form-grid">
      ${field("metricId", "Measured by (optional)", `<select class="bt-select" id="gt-e-metricId" data-f="metricId"><option value="">None</option>${Object.values(metrics).map((m) => `<option value="${esc(m.id)}"${start.metricId === m.id ? " selected" : ""}>${esc(m.label)}${m.source === "manual" ? " (typed in)" : ""}</option>`).join("")}</select>`)}
      ${field("target", "Target", `<input class="bt-input" id="gt-e-target" data-f="target" type="number" min="0" step="any" value="${start.target ?? ""}" placeholder="e.g. 1000">`, "Members see a meter when there's a metric and a target.")}
    </div>` : ""}
    ${item ? field("reason", "Reason for the edit (optional)", `<input class="bt-input" id="gt-e-reason" data-f="reason" maxlength="300" placeholder="Only admins see it in the log">`) : ""}
    <p class="bt-notice bt-notice--error" data-err role="alert" hidden></p>
    <div class="bt-modal-actions gt-dlg-acts">
      ${item ? `<button type="button" class="bt-btn bt-btn--danger bt-btn--sm" data-delete>Delete</button>` : ""}
      <button type="button" class="bt-btn bt-btn--secondary" data-bt-close>Cancel</button>
      <button type="submit" class="bt-btn bt-btn--admin" data-save>${item ? "Save changes" : `Add ${TYPE_NAME[type]}`}</button>
    </div>
  </form>`;

  const m = openModal({ title, wide: true, variant: "editing", feature: FEATURE, content });
  const $ = <T extends HTMLElement = HTMLElement>(s: string) => m.modal.querySelector<T>(s)!;
  const val = (f: string) => m.modal.querySelector<HTMLInputElement>(`[data-f="${f}"]`)?.value ?? "";
  const err = $("[data-err]");
  const showErr = (msg: string) => { err.textContent = msg; err.hidden = !msg; if (msg) err.scrollIntoView({ block: "nearest" }); };
  let visibility: Visibility = (start.visibility as Visibility) || "members";

  m.modal.querySelectorAll<HTMLElement>("[data-vis]").forEach((b) => b.addEventListener("click", () => {
    visibility = b.dataset.vis as Visibility;
    m.modal.querySelectorAll<HTMLElement>("[data-vis]").forEach((x) => { const on = x === b; x.classList.toggle("is-active", on); x.setAttribute("aria-checked", String(on)); });
  }));

  /** The values in the form, in the shapes the server stores. */
  function read(): Record<string, unknown> {
    const out: Record<string, unknown> = { title: val("title").trim() };
    if (has("icon")) out.icon = val("icon").trim();
    if (has("description")) out.description = val("description").trim();
    if (has("help")) out.help = val("help").trim();
    if (has("status")) out.status = val("status");
    if (has("dueDate")) out.dueDate = val("dueDate") || null;
    if (has("level")) out.level = Number(val("level"));
    if (has("visibility")) out.visibility = visibility;
    if (has("relaunch")) out.relaunch = { needed: $<HTMLInputElement>('[data-f="relNeeded"]').checked, weeks: Number(val("relWeeks") || 0), side: val("relSide") };
    if (has("metric")) { out.metricId = val("metricId") || null; out.target = val("target") === "" ? null : Number(val("target")); }
    return out;
  }

  async function save(confirmVisible = false): Promise<void> {
    const values = read();
    if (!String(values.title)) return showErr("Give it a title.");
    const btn = $<HTMLButtonElement>("[data-save]");
    btn.disabled = true; btn.textContent = "Saving…";
    showErr("");
    try {
      if (item) {
        const changes: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(values)) if (!sameJson(v, (item as any)[k])) changes[k] = v;
        if ("metricId" in changes || "target" in changes) { changes.metricId = values.metricId; changes.target = values.target; }
        if (Object.keys(changes).length) await updateItem(item.id, changes, { confirmVisible, reason: val("reason").trim() });
      } else {
        await createItem(type, parent?.id ?? null, values, confirmVisible);
      }
      m.close();
      onDone();
    } catch (e) {
      btn.disabled = false; btn.textContent = item ? "Save changes" : `Add ${TYPE_NAME[type]}`;
      if (reasonOf(e) === "confirmIncome") {
        const ok = await confirmAction({
          title: "Show income to members?", message: "This item is about income, so it starts private. Saving it as visible lets members see it on /goals once you publish.",
          confirmLabel: "Show it", busyLabel: "Saving…", danger: false, feature: FEATURE, onConfirm: async () => {},
        });
        if (ok) return save(true);
        return;
      }
      if (reasonOf(e) === "gone") { showErr("This item was deleted in another tab. Close this and reload the page."); return; }
      showErr(messageFor(e));
    }
  }
  $<HTMLFormElement>("[data-form]").addEventListener("submit", (e) => { e.preventDefault(); void save(); });

  m.modal.querySelector("[data-delete]")?.addEventListener("click", () => {
    if (!item) return;
    confirmAction({
      title: `Delete ${item.title}?`,
      message: children ? `This also deletes ${children} item${children === 1 ? "" : "s"} under it. It disappears from /goals the next time you publish. This can't be undone.` : "It disappears from /goals the next time you publish. This can't be undone.",
      confirmLabel: children ? `Delete with ${children} under it` : "Delete", busyLabel: "Deleting…", danger: true, feature: FEATURE,
      onConfirm: async () => {
        try { await deleteItem(item.id, val("reason").trim()); } catch (e) { throw new Error(messageFor(e)); }
        m.close();
        onDone();
      },
    });
  });
  $<HTMLInputElement>('[data-f="title"]').focus();
}
