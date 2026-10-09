// The main control (the centre of the Cockpit): before the stream, today's streams to pick; while live, the check-in. This first version shows the
// picked stream and what the controls will do; the start, delay, cancel and unscheduled-stream dialogs and the live check-in come next.
import { crPanelHtml } from "../../../../shared/ui/cr-panel.js";
import type { Ctx } from "./state";
import { current } from "./state";
import { fmtTime, plural } from "./model";
import { esc, mascotHtml } from "./ui";

export function stageHtml(ctx: Ctx): string {
  const st = current(ctx);
  if (!st) {
    return crPanelHtml({ id: "lc-stage", cls: "lc-a-stage", title: "Tonight", icon: "controls", bodyHtml: `<div class="lc-empty">${mascotHtml()}<p>No stream is scheduled in the next 12 hours.</p></div>` });
  }
  return crPanelHtml({
    id: "lc-stage", cls: "lc-a-stage", title: ctx.mode === "live" ? "Check-in" : "Tonight", icon: "controls",
    bodyHtml: `<div class="lc-pick-row is-on"><span class="bt-badge bt-badge--gold">${esc(fmtTime(st.start))}</span><div><b>${esc(st.title)}</b><small>${esc(plural(st.plannedGames.length, "game"))} planned</small></div></div>`,
  });
}

export function initStage(_ctx: Ctx) { /* the actions arrive with the start dialogs */ }
