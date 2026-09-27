// Tap the Splat footer, idle state (docs/specs/tap-the-splat.md).
// Plain page script: the sound toggle and the contact Show buttons. The game
// itself is not loaded here.

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

  // Contact: each address is joined here, so it never appears in the HTML.
  // First click shows it (as a mailto link), then the button copies it.
  const mails = root.querySelector("[data-mail-domain]");
  mails?.addEventListener("click", async (ev) => {
    const btn = ev.target.closest("[data-mail-user]");
    if (!btn) return;
    const row = btn.parentElement;
    const address = `${btn.dataset.mailUser}@${mails.dataset.mailDomain}`;
    if (!row.classList.contains("is-open")) {
      const link = document.createElement("a");
      link.href = `mailto:${address}`;
      link.textContent = address;
      row.querySelector("b").replaceChildren(link);
      row.classList.add("is-open");
      btn.textContent = "Copy";
      btn.setAttribute("aria-label", `Copy ${address}`);
      return;
    }
    try {
      await navigator.clipboard.writeText(address);
      btn.textContent = "Copied";
    } catch {
      btn.textContent = "Copy";
    }
  });
}
