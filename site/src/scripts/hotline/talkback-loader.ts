// Talk Back's loader (docs/specs/talk-back.md §1), in BaseLayout on every page; small on purpose. It defines window.btTalkBack.open() and handles
// clicks by delegation, importing the dialog (talkback.ts) only on first use:
//   [data-talkback="question|feedback"][data-service] (optional data-section)   any button, anywhere
//   .bt-ask-pin[data-ask-section]   an Ask pin; the service is the page strip's (.bt-talkback[data-service]); always a question
// The strip's own Talk back buttons call window.btTalkBack.open themselves (scripts/services/strip.ts), so they aren't bound here.
// With the talkBack module off in site.json, open() resolves { result: "off" } and nothing opens (Service Hub hides the half and the pins).
import site from "../../data/site.json";
import type { OpenOpts, Result } from "./talkback";

const on = (site.modules as string[]).includes("talkBack");

function open(opts: OpenOpts = {}): Promise<Result> {
  if (!on) return Promise.resolve({ result: "off" });
  return import("./talkback").then((m) => m.openTalkBack(opts));
}

declare global { interface Window { btTalkBack?: { open: typeof open } } }
window.btTalkBack = { open };

if (on) {
  document.addEventListener("click", (e) => {
    const t = e.target as Element | null;
    const b = t?.closest<HTMLElement>("[data-talkback][data-service]");
    if (b) { e.preventDefault(); void open({ serviceId: b.dataset.service, section: b.dataset.section || null, mode: b.dataset.talkback }); return; }
    const pin = t?.closest<HTMLElement>(".bt-ask-pin[data-ask-section]");
    if (pin) {
      const service = document.querySelector<HTMLElement>(".bt-talkback[data-service]")?.dataset.service;
      if (!service) return;
      e.preventDefault();
      void open({ serviceId: service, section: pin.dataset.askSection, mode: "question" });
    }
  });
}
