// One shared AudioContext for Tap the Splat, unlocked inside a user gesture.
// iOS only lets Web Audio start from a tap, and the game module loads after an
// `await import()`, so the footer calls getAudio() synchronously in the first
// splat tap and the game's sounds reuse the same context. Tiny on purpose: this
// is the only game-adjacent code in the idle footer bundle.

let ctx = null;
let unlocked = false;

// A 0.1 s silent WAV, played once through an <audio> element: on older iOS this
// moves the page into the "playback" audio category so the ringer switch
// doesn't mute Web Audio.
function silentWav() {
  const n = 4410, buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf);
  const w = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  w(0, "RIFF"); v.setUint32(4, 36 + n * 2, true); w(8, "WAVE"); w(12, "fmt ");
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, 44100, true); v.setUint32(28, 88200, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  w(36, "data"); v.setUint32(40, n * 2, true);
  return URL.createObjectURL(new Blob([buf], { type: "audio/wav" }));
}

function unlock() {
  if (unlocked) return;
  unlocked = true;
  try { if (navigator.audioSession) navigator.audioSession.type = "playback"; } catch { /* unsupported */ }
  try {
    const a = new Audio(silentWav());
    a.setAttribute("playsinline", "");
    a.volume = 0.01;
    a.play()?.catch(() => {});
  } catch { /* no <audio> */ }
  try {
    const s = ctx.createBufferSource();
    s.buffer = ctx.createBuffer(1, 1, 22050);
    s.connect(ctx.destination);
    s.start(0);
  } catch { /* nothing to unlock */ }
}

/** The shared context (created and resumed on demand), or null without Web Audio. */
export function getAudio() {
  if (!ctx) {
    try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { return null; }
  }
  if (ctx.state !== "running") ctx.resume?.()?.catch?.(() => {});
  unlock();
  return ctx;
}
