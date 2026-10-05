// The Settings tab (docs/specs/goal-tracker.md §6): the North Star and its story, the levels on the road
// (name, timing text, icon, status, blurb; the last one can be the final boss), the key dates (nominees
// announced and the show, set in America/Chicago) and the result line. Saves through updateConfig as a draft.
// The relaunch date has its own place on the Relaunch tab.
import { toast } from "../../../../../shared/ui/toast.js";
import { escapeHtml as esc } from "../../../../../shared/ui/dom.js";
import { messageFor } from "../../../lib/errors";
import { STATUS, STATUS_ORDER, type Level, type Status } from "../../goals/data";
import { state, saveConfig, chicagoToMs, msToChicago } from "./model";

const MAX_LEVELS = 8;

export function initSettings(host: HTMLElement, onChange: () => void) {
  const form = host.querySelector<HTMLFormElement>("[data-settings]")!;
  const levelsEl = host.querySelector<HTMLElement>("[data-levels]")!;
  const err = host.querySelector<HTMLElement>("[data-settings-err]")!;
  let levels: Level[] = [];
  const f = (name: string) => form.elements.namedItem(name) as HTMLInputElement;

  function levelCard(l: Level, i: number): string {
    const last = i === levels.length - 1;
    return `<fieldset class="gt-level-edit" data-i="${i}"><legend>${l.boss ? "Final boss" : `Level ${l.n}`}</legend>
      <div class="bt-form-grid">
        <div class="bt-field"><label class="bt-label" for="gt-l-name-${i}">Name</label><input class="bt-input" id="gt-l-name-${i}" data-l="name" maxlength="40" value="${esc(l.name)}"></div>
        <div class="bt-field"><label class="bt-label" for="gt-l-when-${i}">Timing</label><input class="bt-input" id="gt-l-when-${i}" data-l="when" maxlength="60" value="${esc(l.when)}" placeholder="e.g. Spring 2027"></div>
        <div class="bt-field"><label class="bt-label" for="gt-l-icon-${i}">Icon</label><input class="bt-input" id="gt-l-icon-${i}" data-l="icon" maxlength="8" value="${esc(l.icon)}"></div>
        <div class="bt-field"><label class="bt-label" for="gt-l-status-${i}">Status</label><select class="bt-select" id="gt-l-status-${i}" data-l="status">${STATUS_ORDER.map((s) => `<option value="${s}"${l.status === s ? " selected" : ""}>${STATUS[s][0]}</option>`).join("")}</select></div>
      </div>
      <div class="bt-field"><label class="bt-label" for="gt-l-blurb-${i}">Blurb</label><textarea class="bt-textarea" id="gt-l-blurb-${i}" data-l="blurb" rows="2" maxlength="300">${esc(l.blurb)}</textarea></div>
      <div class="gt-level-edit-acts">${last ? `<label class="bt-check"><input type="checkbox" data-l="boss"${l.boss ? " checked" : ""}> Final boss</label>` : "<span></span>"}
        <button type="button" class="bt-btn bt-btn--danger bt-btn--sm" data-remove-level="${i}"${levels.length <= 1 ? " disabled" : ""}>Remove</button></div></fieldset>`;
  }
  const drawLevels = () => { levelsEl.innerHTML = levels.map(levelCard).join(""); host.querySelector<HTMLButtonElement>("[data-add-level]")!.disabled = levels.length >= MAX_LEVELS; };

  /** Pulls what's typed into the level cards back into `levels` before adding or removing one. */
  function readLevels() {
    levelsEl.querySelectorAll<HTMLElement>("[data-i]").forEach((card) => {
      const l = levels[Number(card.dataset.i)];
      const v = (k: string) => card.querySelector<HTMLInputElement>(`[data-l="${k}"]`);
      l.name = v("name")!.value.trim(); l.when = v("when")!.value.trim(); l.icon = v("icon")!.value.trim();
      l.status = v("status")!.value as Status; l.blurb = v("blurb")!.value.trim();
      const boss = v("boss");
      if (boss) l.boss = boss.checked || undefined;
    });
  }

  function render() {
    const c = state.draft.config;
    f("northStar").value = c.northStar; f("story").value = c.story; f("result").value = c.result;
    const n = msToChicago(c.nomineesAt), s = msToChicago(c.showAt);
    f("nomineesDay").value = n.day; f("nomineesTime").value = n.time || "19:00";
    f("showDay").value = s.day; f("showTime").value = s.time || "19:00";
    levels = c.levels.map((l) => ({ ...l }));
    drawLevels();
  }

  levelsEl.addEventListener("click", (e) => {
    const rm = (e.target as HTMLElement).closest<HTMLElement>("[data-remove-level]");
    if (!rm) return;
    readLevels();
    levels.splice(Number(rm.dataset.removeLevel), 1);
    const lastLevel = levels[levels.length - 1];
    levels.forEach((l) => { if (l !== lastLevel) delete l.boss; });
    drawLevels();
  });
  host.querySelector("[data-add-level]")!.addEventListener("click", () => {
    if (levels.length >= MAX_LEVELS) return;
    readLevels();
    levels.forEach((l) => delete l.boss);   // the new one is last; a boss stays last, so mark it again if needed
    levels.push({ n: Math.max(-1, ...levels.map((l) => l.n)) + 1, name: "New level", when: "", icon: "⭐", status: "planned", blurb: "" });
    drawLevels();
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    readLevels();
    err.hidden = true;
    const day = (n: string) => f(`${n}Day`).value;
    const btn = form.querySelector<HTMLButtonElement>("[data-save-settings]")!;
    btn.disabled = true; btn.textContent = "Saving…";
    try {
      await saveConfig({
        northStar: f("northStar").value.trim(), story: f("story").value.trim(), result: f("result").value.trim(),
        nomineesAt: day("nominees") ? chicagoToMs(day("nominees"), f("nomineesTime").value || "19:00") : null,
        showAt: day("show") ? chicagoToMs(day("show"), f("showTime").value || "19:00") : null,
        levels,
      });
      toast("Settings saved as a draft");
      onChange();
      render();
    } catch (e2) { err.textContent = messageFor(e2); err.hidden = false; }
    btn.disabled = false; btn.textContent = "Save settings";
  });
  return { render };
}
