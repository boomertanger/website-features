// shared/ui/wheel-sound.js — the Prize Wheel's tick (docs/specs/prize-box.md §2 "Sound"): one tick per peg, from wheelSpin's onTick.
// Until Boomer records his wheel it's a synthesized click (Web Audio: a short noise burst through a band-pass filter); when
// site/public/sounds/prize-tick.mp3 exists it plays that instead (each tick slightly re-pitched). Browsers only allow sound after a
// tap, so unlock() runs from the first click or key; nothing plays before that.
//
//   const snd = wheelSound({ muted = true, src = null })   src: the recording's URL; the site passes "/sounds/prize-tick.mp3" only when
//     the build found site/public/sounds/prize-tick.mp3 (site/src/lib/prize-sound.ts), so a missing file is never fetched
//     snd.tick()          play one tick (ignored while muted, and at most one every 20 ms)
//     snd.muted / snd.setMuted(bool)
//     snd.unlock()        start the audio context (call it from a click)
//   soundButtonHtml({ muted })   the kit's sound toggle (.bt-btn.bt-btn--ghost.bt-btn--sm[data-wheel-sound], aria-pressed = sound on)
//   bindSoundButton(button, snd) wires a toggle to a sound; returns nothing
//
// On the site it starts muted with the sound button (the default). The stream view passes { muted: false }: its audio goes to the
// stream through the browser source ("Control audio via OBS" on in Streamlabs).

const SPEAKER_ON = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/></svg>';
const SPEAKER_OFF = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4z"/><path d="m16 9 5 6M21 9l-5 6"/></svg>';

export function wheelSound({ muted = true, src = null } = {}) {
  let ctx = null, noise = null, buf = null, last = 0, tried = false;
  const snd = {
    muted,
    setMuted(v) { snd.muted = !!v; if (!snd.muted) snd.unlock(); },
    unlock() {
      const AC = typeof window !== "undefined" && (window.AudioContext || window.webkitAudioContext);
      if (!AC) return;
      if (!ctx) {
        ctx = new AC();
        const n = Math.floor(ctx.sampleRate * 0.03), b = ctx.createBuffer(1, n, ctx.sampleRate), d = b.getChannelData(0);
        for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 6);
        noise = b;
      }
      if (ctx.state === "suspended") ctx.resume().catch(() => {});
      if (!tried && src) {   // Boomer's recording, once it exists; a 404 just keeps the synthesized tick
        tried = true;
        fetch(src, { cache: "force-cache" }).then((r) => (r.ok ? r.arrayBuffer() : null)).then((ab) => (ab ? ctx.decodeAudioData(ab) : null)).then((b) => { if (b) buf = b; }).catch(() => {});
      }
    },
    tick() {
      if (snd.muted || !ctx || ctx.state !== "running") return;
      const now = ctx.currentTime;
      if (now - last < 0.02) return;
      last = now;
      const s = ctx.createBufferSource(), g = ctx.createGain();
      if (buf) { s.buffer = buf; s.playbackRate.value = 0.96 + Math.random() * 0.08; g.gain.value = 0.9; s.connect(g); }
      else {
        s.buffer = noise;
        const bp = ctx.createBiquadFilter();
        bp.type = "bandpass"; bp.frequency.value = 2200 + Math.random() * 400; bp.Q.value = 1.3; g.gain.value = 0.6;
        s.connect(bp); bp.connect(g);
      }
      g.connect(ctx.destination);
      s.start(now);
    },
  };
  // Browsers need a gesture first: the first tap or key anywhere starts the context (it stays silent while muted).
  if (typeof document !== "undefined") {
    const first = () => { snd.unlock(); document.removeEventListener("pointerdown", first, true); document.removeEventListener("keydown", first, true); };
    document.addEventListener("pointerdown", first, true);
    document.addEventListener("keydown", first, true);
  }
  return snd;
}

export function soundButtonHtml({ muted = true } = {}) {
  return `<button type="button" class="bt-btn bt-btn--ghost bt-btn--sm bt-wheel-sound" data-wheel-sound aria-pressed="${muted ? "false" : "true"}">${muted ? SPEAKER_OFF : SPEAKER_ON}<span>${muted ? "Sound off" : "Sound on"}</span></button>`;
}

export function bindSoundButton(button, snd) {
  if (!button || !snd) return;
  const paint = () => {
    button.setAttribute("aria-pressed", snd.muted ? "false" : "true");
    button.innerHTML = `${snd.muted ? SPEAKER_OFF : SPEAKER_ON}<span>${snd.muted ? "Sound off" : "Sound on"}</span>`;
  };
  button.addEventListener("click", () => { snd.setMuted(!snd.muted); paint(); if (!snd.muted) snd.tick(); });
  paint();
}
