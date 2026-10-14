// The practice check-in (docs/specs/control-room.md §7a): a working check-in with the word "lantern" that saves nothing. It lives on
// /live/how-it-works (chapter "Check in at every beat"); scripts/live/how-page.ts mounts it into [data-lp-try].
import { crPanelHtml } from "../../../../shared/ui/cr-panel.js";
import { checkinHtml, initCheckin } from "./pub-ui";

const PRACTICE_WORD = "lantern";
// accents, case, spaces and punctuation are ignored, like the real check-in
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");

/** Draws the practice card into host (and again on "Try again"). */
export function mountPractice(host: HTMLElement) {
  let tries = 5;
  const draw = () => {
    const card = checkinHtml({ dialog: true, state: "entry", beat: "start", time: "5:00", count: 0, countLabel: "checked in (practice)", tries, id: "lp-try", wordLabel: "Type the word you just heard", rooms: ["twitch", "ytLandscape", "ytVertical", "tiktok"] });
    host.innerHTML = crPanelHtml({ cls: "lp-try-card", title: "Practice check-in", icon: "checkin", tagHtml: `<span class="bt-badge bt-badge--gray">Practice</span>`, bodyHtml: `${card}<p class="lp-private">Nothing is saved. This is a practice run.</p>` });
    initCheckin(host, {
      onSubmit: async (word: string) => {
        await new Promise((r) => setTimeout(r, 250));
        if (norm(word) === PRACTICE_WORD) {
          setTimeout(() => host.querySelector(".bt-checkin-done")?.insertAdjacentHTML("beforeend", `<button type="button" class="bt-link-btn" data-lp-again>Try again</button>`), 0);
          return { ok: true, xp: 10, streak: "practice only, nothing is saved" };
        }
        tries--;
        if (tries <= 0) {
          setTimeout(() => host.querySelector(".bt-checkin-note")?.insertAdjacentHTML("beforeend", `<button type="button" class="bt-link-btn" data-lp-again>Try again</button>`), 0);
          return { locked: true };
        }
        return { ok: false, left: tries };
      },
    });
  };
  host.addEventListener("click", (e) => { if ((e.target as Element).closest("[data-lp-again]")) { tries = 5; draw(); } });
  draw();
}
