// The once-only moments (docs/specs/bug-zapper.md §7), shown on the reporter's next visit and remembered in localStorage bt.bugs.seen (try/catch): "Your bug was
// confirmed" (the Bug Finder medal) and "Your bug got zapped" (a lime FIXED stamp). One per report each, one after the other.
import { openModal, modalHeader } from "../../../../shared/ui/modal.js";
import { burst } from "../../../../shared/ui/burst.js";
import { seenOnce } from "../boards/seen";
import { CONFIRMED_LIKE } from "./status";
import type { Report } from "./data";
import { S } from "./store";
import { isPreview } from "./gate";
import { esc, mine, bugFinder, stamp, longDate, plural } from "./ui";

const seen = seenOnce("bt.bugs.seen");
let showing = false;

function show(html: string, accent: string): Promise<"close" | "go"> {
  return new Promise((resolve) => {
    let out: "close" | "go" = "close";
    const m = openModal({ title: "Bug Zapper", feature: "bug-zapper", content: html, onClose: () => resolve(out) });
    m.modal.querySelectorAll("[data-go]").forEach((b) => b.addEventListener("click", () => { out = "go"; m.close(); }));
    setTimeout(() => burst(m.modal.querySelector<HTMLElement>("[data-art]"), { colors: ["var(--bt-ice)", "var(--bt-lamp)", accent], n: 20 }), 150);
  });
}

/** Runs once after the board loads: the signed-in reporter's confirmed / fixed reports that haven't been celebrated yet. */
export async function runMoments() {
  if (showing || !S.loaded) return;
  showing = true;
  try {
    const list = S.reports.filter((r: Report) => mine(r) && !r.hidden).sort((a, b) => a.statusChangedAt - b.statusChangedAt);
    for (const r of list) {
      if (CONFIRMED_LIKE.includes(r.status) && !seen.has(`c:${r.id}`)) {
        if (!isPreview()) seen.add(`c:${r.id}`);
        const go = await show(`${modalHeader("Your bug was confirmed", "Night Shift counts it toward Exterminator.")}<div class="bz-moment"><span data-art>${bugFinder(96, "Bug Finder")}</span><h3>You earned Bug Finder</h3><p>The team reproduced “${esc(r.title)}”. It's on the list to fix. +25 XP.</p></div><div class="bt-modal-actions"><button type="button" class="bt-btn bt-btn--secondary" data-bt-close>Nice</button><a class="bt-btn bt-btn--primary" href="/trophies" data-go>See your trophy case</a></div>`, "var(--bt-gold)");
        if (go === "go") location.href = "/trophies";
      }
      if (r.status === "fixed" && !seen.has(`f:${r.id}`)) {
        if (!isPreview()) seen.add(`f:${r.id}`);
        const others = Math.max(0, r.meTooCount);
        await show(`${modalHeader("Your bug got zapped")}<div class="bz-moment"><div class="bz-done-art" data-art>${stamp("Fixed", "Bug", longDate(r.fixedAt || r.statusChangedAt).replace(/, \d{4}$/, ""), "lime")}</div><h3>“${esc(r.title)}” is fixed</h3><p>Thanks for reporting it.${others ? ` The ${plural(others, "member")} who hit it got a heads-up too.` : ""}</p></div><div class="bt-modal-actions"><button type="button" class="bt-btn bt-btn--primary" data-bt-close>See the report</button></div>`, "var(--bt-lime)");
      }
    }
  } finally { showing = false; }
}
