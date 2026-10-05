// /admin/goals (docs/specs/goal-tracker.md §6): the publish bar, the four tabs and the first read of the
// draft. Runs once an admin is allowed in (scripts/goals/layout.ts). Every edit is a draft: the bar counts
// the unpublished changes and Publish makes the members' page match (goalTrackerPublish).
import { toast } from "../../../../../shared/ui/toast.js";
import { messageFor } from "../../../lib/errors";
import { onAccess } from "../../goals/layout";
import { state, loadDraft, publish } from "./model";
import { initPlan } from "./plan";
import { initRelaunch } from "./relaunch";
import { initMetrics } from "./metrics";
import { initSettings } from "./settings";

const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector<T>(sel)!;
const TABS = ["plan", "relaunch", "metrics", "settings"];

const bar = $("[data-pub]");
const text = $("[data-pub-text]");
const btnPublish = $<HTMLButtonElement>("[data-publish]");
const btnRetry = $<HTMLButtonElement>("[data-retry-load]");
let failed = false;

/** The publish bar: N unpublished changes / Everything is published / Couldn't publish. */
function syncBar() {
  const n = state.draft.config.pendingChanges;
  if (failed) {
    bar.dataset.state = "failed";
    text.textContent = "Couldn't publish. Members still see the last version.";
    btnPublish.textContent = "Retry";
    btnPublish.disabled = false;
    return;
  }
  const never = !state.draft.config.lastPublishedAt && state.draft.items.length > 0;
  bar.dataset.state = n || never ? "dirty" : "clean";
  text.textContent = n ? `${n} unpublished change${n === 1 ? "" : "s"}` : never ? "Nothing is published yet" : "Everything is published";
  btnPublish.textContent = "Publish";
  btnPublish.disabled = !n && !never;
}

function showTab(id: string) {
  const tab = TABS.includes(id) ? id : "plan";
  document.querySelectorAll<HTMLElement>("[data-tab]").forEach((a) => { if (a.dataset.tab === tab) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current"); });
  document.querySelectorAll<HTMLElement>("[data-pane]").forEach((p) => { p.hidden = p.dataset.pane !== tab; });
}

function start() {
  const changed = () => { syncBar(); relaunch.render(); };
  const plan = initPlan($("[data-pane=plan]"), changed);
  const relaunch = initRelaunch($("[data-pane=relaunch]"), () => { syncBar(); plan.render(); });
  const metrics = initMetrics($("[data-pane=metrics]"), () => { syncBar(); });
  const settings = initSettings($("[data-pane=settings]"), () => { syncBar(); relaunch.render(); });
  const renderAll = () => { plan.render(); relaunch.render(); metrics.render(); settings.render(); syncBar(); };

  async function load() {
    $("[data-admin-load]").hidden = false;
    $("[data-admin-error]").hidden = true;
    try {
      await loadDraft();
      $("[data-admin-load]").hidden = true;
      $("[data-admin-body]").hidden = false;
      renderAll();
    } catch (err) {
      console.error("goal tracker admin: couldn't read the draft", err);
      $("[data-admin-load]").hidden = true;
      $("[data-admin-error]").hidden = false;
    }
  }
  btnRetry.addEventListener("click", () => void load());

  btnPublish.addEventListener("click", async () => {
    btnPublish.disabled = true; btnPublish.textContent = "Publishing…";
    try {
      await publish();
      failed = false;
      await loadDraft();   // the server cleared the flags and the count
      renderAll();
      toast("Published. Members see the new plan.");
    } catch (err) {
      failed = true;
      syncBar();
      toast(messageFor(err), { kind: "error" });
    }
  });

  document.querySelectorAll<HTMLElement>("[data-tab]").forEach((a) => a.addEventListener("click", (e) => {
    e.preventDefault();
    history.replaceState(null, "", `#${a.dataset.tab}`);
    showTab(a.dataset.tab!);
  }));
  addEventListener("hashchange", () => showTab(location.hash.slice(1)));
  showTab(location.hash.slice(1));
  void load();
}

onAccess(start);
