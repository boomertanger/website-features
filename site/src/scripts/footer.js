// Tap the Splat footer, idle state (docs/specs/tap-the-splat.md).
// Plain page script: the sound toggle and lazy hooks for the game, Contact + Follow
// and the leaderboard. The game (JS + CSS) loads with a dynamic import on the first splat tap;
// the leaderboard popover loads its own small module on the trophy button.
import { getAudio } from "./tap-the-splat/audio-unlock.js";

const SOUND_KEY = "bt-tts-sound";

const root = document.querySelector("[data-tts]");
if (root) {
  // Sound preference, saved per browser. Storage can throw (private mode,
  // blocked site data), so every access is guarded and "on" is the default.
  const readSound = () => { try { return localStorage.getItem(SOUND_KEY) !== "off"; } catch { return true; } };
  const saveSound = (on) => { try { localStorage.setItem(SOUND_KEY, on ? "on" : "off"); } catch { /* not saved */ } };
  const soundBtn = root.querySelector("[data-snd]");
  const showSound = (on) => {
    root.dataset.sound = on ? "on" : "off";
    soundBtn.textContent = on ? "🔊" : "🔇";
    soundBtn.setAttribute("aria-pressed", String(on));
  };
  showSound(readSound());
  soundBtn.addEventListener("click", () => {
    const on = root.dataset.sound === "off";
    showSound(on);
    saveSound(on);
    root.dispatchEvent(new CustomEvent("bt-tts:sound", { detail: { on } }));
  });

  // Contact + Follow ("Shared power", scripts/tap-the-splat/power.js). Its code comes
  // with the game; without a game running (keyboard focus reveals the section) the first
  // Show or focus loads it here. Show joins the address in the browser, so it never
  // appears in the HTML, then the same button copies it.
  const cf = root.querySelector("[data-power]");
  const power = () => import("./tap-the-splat/power.js").then((m) => m.initPower(root));
  cf?.addEventListener("click", async (ev) => {
    const btn = ev.target.closest("[data-mail-user]");
    if (!btn) return;
    try {
      (await power()).reveal(btn);
    } catch (err) {
      // The effect failed to load: show the address plainly.
      console.error("footer: power effects failed to load", err);
      const address = `${btn.dataset.mailUser}@${btn.closest("[data-mail-domain]").dataset.mailDomain}`;
      cf.querySelector("[data-pw-readout]").textContent = address;
    }
  });
  cf?.addEventListener("focusin", () => { power().catch(() => {}); }, { once: true });

  // The game: nothing game-related loads before the first splat tap.
  const splat = root.querySelector('[data-tts-g="splat"]');
  let loading = false;
  const firstTap = async () => {
    if (loading) return;
    loading = true;
    // iOS only starts Web Audio inside a tap, and the import below is async.
    if (root.dataset.sound !== "off") getAudio();
    try {
      const { startGame } = await import("./tap-the-splat/index.js");
      splat.removeEventListener("click", firstTap);
      await startGame(root);
    } catch (err) {
      loading = false;
      console.error("Tap the Splat failed to load", err);
    }
  };
  splat.addEventListener("click", firstTap);

  // Leaderboard popover (open to everyone; real boards, arcade-step1.md).
  const lbWrap = root.querySelector("[data-lb-wrap]");
  lbWrap?.querySelector("[data-lb]").addEventListener("click", async () => {
    const { toggle } = await import("./tap-the-splat/leaderboard.js");
    toggle(lbWrap);
  });
}
