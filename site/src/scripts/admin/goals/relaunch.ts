// The Relaunch tab (docs/specs/goal-tracker.md §6): done of total, weeks left, an earliest realistic date,
// the website-and-stream side-by-side switch, a week estimate for each unfinished item, and the relaunch
// date and time (America/Chicago) with Save. The estimate is a guide for picking the date, not the date.
// Estimates save through goalTrackerEdit (update relaunch); the date through updateConfig.
import { toast } from "../../../../../shared/ui/toast.js";
import { escapeHtml as esc } from "../../../../../shared/ui/dom.js";
import { messageFor } from "../../../lib/errors";
import { STATUS, pct, meterHtml, dateTimeText } from "../../goals/data";
import { state, relaunchGroups, updateItem, saveConfig, chicagoToMs, msToChicago } from "./model";

const fmtDay = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

export function initRelaunch(host: HTMLElement, onChange: () => void) {
  const stats = host.querySelector<HTMLElement>("[data-relstats]")!;
  const groupsEl = host.querySelector<HTMLElement>("[data-relgroups]")!;
  const par = host.querySelector<HTMLElement>("[data-par]")!;
  const dayEl = host.querySelector<HTMLInputElement>("[data-reldate]")!;
  const timeEl = host.querySelector<HTMLInputElement>("[data-reltime]")!;
  const note = host.querySelector<HTMLElement>("[data-reldate-note]")!;
  let parallel = true;

  function render() {
    const groups = relaunchGroups(state.draft.items);
    const all = groups.flatMap((g) => g.items);
    const done = all.filter((i) => i.status === "done").length;
    const left = (side: string) => all.filter((i) => i.status !== "done" && i.relaunch.side === side).reduce((a, i) => a + (i.relaunch.weeks || 0), 0);
    const site = left("site"), stream = left("stream");
    const weeks = parallel ? Math.max(site, stream) : site + stream;
    const earliest = new Date(); earliest.setDate(earliest.getDate() + Math.round(weeks * 7));
    stats.innerHTML = `<div class="gt-stat"><small>Done</small><b>${done} of ${all.length}</b><small>${pct(done, all.length)}% ready</small></div>`
      + `<div class="gt-stat"><small>Work left</small><b>${weeks} week${weeks === 1 ? "" : "s"}</b><small>Website ${site} · stream prep ${stream}</small></div>`
      + `<div class="gt-stat gt-stat--date"><small>Earliest realistic date</small><b>${all.length && done < all.length ? fmtDay(earliest) : all.length ? "Ready now" : "—"}</b><small>From today, ${fmtDay(new Date())}. A guide for picking the date, not the date.</small></div>`;
    groupsEl.innerHTML = groups.length ? groups.map((g) => {
      const d = g.items.filter((i) => i.status === "done").length;
      return `<div class="gt-group"><div class="gt-group-head"><span aria-hidden="true">${esc(g.icon)}</span><h3>${esc(g.goal.title)}</h3><em>${d} of ${g.items.length}</em></div>`
        + meterHtml("gold", d, g.items.length, g.goal.title)
        + `<ul>${g.items.map((i) => {
          const s = STATUS[i.status || "planned"];
          return `<li data-s="${i.status}"><span class="bt-badge bt-badge--${s[1]}"><span class="bt-badge-dot"></span>${s[0]}</span><span class="gt-grow">${esc(i.title)}${i.visibility === "private" ? ' <small aria-label="Private">🔒</small>' : ""}</span>`
            + (i.status === "done" ? "" : `<label class="gt-est"><input class="bt-input" type="number" min="0" max="52" step="0.5" value="${i.relaunch.weeks}" data-est="${esc(i.id)}" aria-label="Weeks for ${esc(i.title)}"><small>wk</small></label>`) + `</li>`;
        }).join("")}</ul></div>`;
    }).join("") : `<div class="bt-empty bt-empty--compact"><div class="bt-empty-title">Nothing is flagged for the relaunch yet</div><p>Tick Needed for relaunch when you edit an item.</p></div>`;
    const at = state.draft.config.relaunchAt;
    const c = msToChicago(at);
    dayEl.value = c.day; timeEl.value = c.time || "19:00";
    note.textContent = at ? `Set for ${dateTimeText(at)}. Members see a countdown instead of the readiness meter.` : "Leave empty until you're ready. Members see the readiness meter until then, then a countdown.";
  }

  groupsEl.addEventListener("change", async (e) => {
    const input = e.target as HTMLInputElement;
    const id = input.dataset.est;
    if (!id) return;
    const item = state.draft.items.find((i) => i.id === id);
    if (!item) return;
    const weeks = Math.round((Number(input.value) || 0) * 2) / 2;
    try { await updateItem(id, { relaunch: { ...item.relaunch, weeks } }); onChange(); }
    catch (err) { toast(messageFor(err), { kind: "error" }); }
    render();
  });
  par.addEventListener("click", () => { parallel = !parallel; par.setAttribute("aria-checked", String(parallel)); render(); });

  async function saveDate(clear: boolean) {
    if (!clear && !dayEl.value) { toast("Pick a date first, or use Clear date.", { kind: "error" }); return; }
    const btns = host.querySelectorAll<HTMLButtonElement>("[data-save-date], [data-clear-date]");
    btns.forEach((b) => (b.disabled = true));
    try {
      await saveConfig({ relaunchAt: clear ? null : chicagoToMs(dayEl.value, timeEl.value || "19:00") });
      toast(clear ? "Relaunch date cleared (draft)" : "Relaunch date saved as a draft");
      onChange();
    } catch (err) { toast(messageFor(err), { kind: "error" }); }
    btns.forEach((b) => (b.disabled = false));
    render();
  }
  host.querySelector("[data-save-date]")!.addEventListener("click", () => void saveDate(false));
  host.querySelector("[data-clear-date]")!.addEventListener("click", () => void saveDate(true));
  return { render };
}
