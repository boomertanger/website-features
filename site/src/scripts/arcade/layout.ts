// Arcade layout behaviour (docs/specs/arcade-step1.md §3, §7):
// - members-only pages: a visitor gets the Join dialog once per visit (sessionStorage),
//   on the Join tab titled "Join to enter the Arcade"; closing it leaves the gate.
// - [data-play-now]: scroll to the footer game and cue the splat (D2).
// - [data-resend]: resend the verification email (the "verify your email" notices).
import { whenReady, sendVerification } from "../../lib/auth";
import { playNow } from "./play-now";
import { initSegNavs } from "../../../../shared/ui/seg-nav.js";
import { initPowerWordmarks } from "../../../../shared/ui/wordmark.js";

initSegNavs();          // the top bar's Games / Leaderboards / How it works
initPowerWordmarks();   // touch screens: the BOOMARCADE gold shine plays once as it comes into view

const GATE_KEY = "bt-arcade-join-shown";

if (document.querySelector(".ar[data-members-only]")) {
  whenReady().then(async (s) => {
    if (s.status !== "signedOut") return;
    try {
      if (sessionStorage.getItem(GATE_KEY)) return;
      sessionStorage.setItem(GATE_KEY, "1");
    } catch { /* storage blocked: open it anyway */ }
    const { openSignIn } = await import("../account/dialog");
    openSignIn({ mode: "join", title: "Join to enter the Arcade" });
  });
}

document.addEventListener("click", (ev) => {
  const t = (ev.target as Element | null)?.closest("[data-play-now]");
  if (!t) return;
  ev.preventDefault();
  playNow();
});

// [data-resend] next to a "verify your email" notice: resend the verification email.
document.addEventListener("click", async (ev) => {
  const btn = (ev.target as Element | null)?.closest<HTMLButtonElement>("[data-resend]");
  if (!btn || btn.disabled) return;
  const label = btn.textContent;
  btn.disabled = true;
  try {
    await sendVerification();
    btn.textContent = "Sent. Check your inbox";
  } catch (err) {
    btn.textContent = (err as { code?: string }).code === "auth/too-many-requests" ? "Wait a minute, then try again" : "Couldn't send. Try again";
  }
  setTimeout(() => { btn.disabled = false; btn.textContent = label; }, 30000);
});
