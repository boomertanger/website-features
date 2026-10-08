// /schedule/plan: owner and admins get the plan view, Active crew the crew view (same URL, chosen from the viewer's role; the layout's
// crewOnly gate already shows everyone else the "Crew only" gate). Preview (non-production, signed out, ?as=admin or ?as=member) uses
// src/data/preview-planner-plan.json through plan-io.ts and says so; real sessions only ever use the real reads and callables.
import { onAccess } from "./layout";
import { makeIo, whoAmI } from "./plan-io";
import { messageFor } from "../../lib/errors";
import { initCoverFallbacks } from "../../../../shared/ui/cover.js";
initCoverFallbacks();

const root = document.querySelector<HTMLElement>("[data-pp]")!;
const body = root.querySelector<HTMLElement>("[data-pp-body]")!;
const load = root.querySelector<HTMLElement>("[data-pp-load]")!;
const errBox = root.querySelector<HTMLElement>("[data-pp-error]")!;

onAccess(async (s) => {
  try {
    const [io, who] = await Promise.all([makeIo(), whoAmI(s)]);
    if (who.preview) body.insertAdjacentHTML("beforebegin", `<p class="bt-notice pp-previewnote">Preview data for checking the layout. Nothing here is saved.${who.admin ? " Add ?owner=0 to see the admin view without owner buttons." : ""}</p>`);
    if (who.admin) { const { mountPlan } = await import("./plan-view"); await mountPlan(body, io, who); }
    else { const { mountCrew } = await import("./crew-view"); await mountCrew(body, io, who); }
    load.hidden = true; errBox.hidden = true; body.hidden = false; body.setAttribute("aria-busy", "false");
  } catch (err) {
    console.error(err);
    load.hidden = true; body.hidden = true; errBox.hidden = false;
    errBox.querySelector<HTMLElement>("[data-pp-error-text]")!.textContent = messageFor(err, "Check your connection and try again.");
  }
});
errBox.querySelector("[data-pp-retry]")?.addEventListener("click", () => location.reload());
