// Tap the Splat sound effects: all synthesised with Web Audio (no audio files),
// ported from the approved prototype. Sound is on unless the footer's toggle set
// data-sound="off" on the game root (saved per browser by scripts/footer.js).
import { getAudio } from "./audio-unlock.js";

export function createSounds(root) {
  const on = () => root.dataset.sound !== "off";
  const ac = () => (on() ? getAudio() : null);
  let hiss = null;

  // Re-unlock on later gestures too (iOS can suspend the context).
  ["touchend", "pointerdown", "click"].forEach((t) => document.addEventListener(t, () => { if (on()) getAudio(); }, { capture: true, passive: true }));

  const tone = (f, d = 0.1, type = "sine", v = 0.15, to = null, delay = 0) => {
    const c = ac(); if (!c) return;
    const t = c.currentTime + delay, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t + d);
    g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(g).connect(c.destination); o.start(t); o.stop(t + d + 0.02);
  };
  const noise = (d = 0.2, freq = 1000, v = 0.3, type = "lowpass", delay = 0) => {
    const c = ac(); if (!c) return;
    const t = c.currentTime + delay, n = c.createBufferSource(), b = c.createBuffer(1, Math.ceil(c.sampleRate * d), c.sampleRate), ch = b.getChannelData(0);
    for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1;
    n.buffer = b;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq;
    const g = c.createGain(); g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    n.connect(f).connect(g).connect(c.destination); n.start(t);
  };

  const SFX = {
    splat: () => { noise(0.09, 2400, 0.55, "bandpass"); noise(0.35, 500, 0.6); tone(140, 0.18, "sine", 0.45, 38); [0.06, 0.11, 0.17, 0.24].forEach((d, i) => { noise(0.03, 3000 + i * 700, 0.18, "bandpass", d); tone(900 + Math.random() * 900, 0.03, "sine", 0.05, 400, d); }); },
    powerup: () => {
      const c = ac(); if (!c) return;
      const t = c.currentTime, o = c.createOscillator(), o2 = c.createOscillator(), f = c.createBiquadFilter(), g2 = c.createGain();
      o.type = "sawtooth"; o2.type = "square";
      o.frequency.setValueAtTime(70, t); o.frequency.exponentialRampToValueAtTime(1400, t + 0.9);
      o2.frequency.setValueAtTime(72, t); o2.frequency.exponentialRampToValueAtTime(1440, t + 0.9);
      f.type = "bandpass"; f.Q.value = 3; f.frequency.setValueAtTime(300, t); f.frequency.exponentialRampToValueAtTime(3200, t + 0.9);
      g2.gain.setValueAtTime(0.0001, t); g2.gain.exponentialRampToValueAtTime(0.14, t + 0.15); g2.gain.setValueAtTime(0.14, t + 0.8); g2.gain.exponentialRampToValueAtTime(0.0001, t + 1.1);
      o.connect(f); o2.connect(f); f.connect(g2).connect(c.destination); o.start(t); o2.start(t); o.stop(t + 1.15); o2.stop(t + 1.15);
      for (let i = 0; i < 9; i++) noise(0.025, 4000 + i * 400, 0.12 + i * 0.01, "highpass", i * 0.09);
      tone(1800, 0.25, "sine", 0.05, 2600, 0.85);
    },
    sting: () => [784, 988, 1319].forEach((f, i) => tone(f, 0.12, "square", 0.07, null, i * 0.07)),
    victory: () => {
      const pad = (fr, d, dl, v = 0.05) => {
        const c = ac(); if (!c) return;
        fr.forEach((f) => {
          const t = c.currentTime + dl;
          ["sawtooth", "square"].forEach((ty, k) => {
            const o = c.createOscillator(), g2 = c.createGain(), lp = c.createBiquadFilter();
            o.type = ty; o.frequency.value = f * (k ? 1.003 : 1); lp.type = "lowpass"; lp.frequency.value = 1800;
            g2.gain.setValueAtTime(0.0001, t); g2.gain.linearRampToValueAtTime(v, t + 0.06); g2.gain.setValueAtTime(v, t + d - 0.12); g2.gain.exponentialRampToValueAtTime(0.0001, t + d);
            o.connect(lp).connect(g2).connect(c.destination); o.start(t); o.stop(t + d + 0.02);
          });
        });
      };
      pad([261.6, 311.1, 392], 0.28, 0); pad([207.7, 261.6, 311.1], 0.28, 0.3); pad([233.1, 293.7, 349.2], 0.28, 0.6); pad([261.6, 329.6, 392, 523.3], 1.3, 0.9, 0.06);
      [1046.5, 1318.5, 1568].forEach((f, i) => tone(f, 0.9, "sine", 0.05, null, 0.95 + i * 0.06));
      noise(0.4, 8000, 0.05, "highpass", 0.9);
    },
    kachunk: () => { noise(0.03, 6000, 0.35, "highpass"); tone(1900, 0.02, "square", 0.07); noise(0.12, 380, 0.8, "lowpass", 0.07); tone(95, 0.16, "square", 0.22, 55, 0.07); tone(62, 0.22, "sine", 0.3, 40, 0.08); tone(2400, 0.25, "sine", 0.025, 2300, 0.1); },
    crumble: () => { for (let i = 0; i < 11; i++) { const d = i * 0.035 + Math.random() * 0.03; noise(0.05 + Math.random() * 0.05, 300 + Math.random() * 900, 0.35, "bandpass", d); tone(120 + Math.random() * 90, 0.05, "square", 0.06, 60, d); } noise(0.6, 160, 0.25, "lowpass", 0.02); },
    zap: () => { tone(1400, 0.08, "square", 0.12, 500); tone(1800, 0.1, "sawtooth", 0.08, 300, 0.06); noise(0.12, 6000, 0.15, "highpass", 0.02); },
    click: () => tone(760, 0.04, "square", 0.07),
    clink: () => { tone(2200, 0.05, "triangle", 0.12); tone(1650, 0.09, "triangle", 0.1, null, 0.05); tone(1200, 0.14, "triangle", 0.08, null, 0.1); },
    plug: () => { noise(0.06, 3000, 0.25); tone(60, 0.7, "sine", 0.18); tone(120, 0.7, "sine", 0.06); },
    hum: () => tone(90, 0.5, "sawtooth", 0.04),
    thunk: () => { noise(0.08, 500, 0.5); tone(170, 0.1, "square", 0.14, 70); },
    snip: () => { noise(0.04, 5000, 0.35, "highpass"); tone(2600, 0.03, "square", 0.08); tone(1800, 0.04, "square", 0.06, null, 0.05); },
    boom: () => { noise(1.4, 260, 0.9); tone(70, 1.1, "sine", 0.6, 28); noise(0.5, 1200, 0.3, "lowpass", 0.05); },
    blip: (k = 0) => tone(820 + k * 45, 0.07, "square", 0.09),
    buzz: () => { tone(120, 0.45, "sawtooth", 0.2, 70); tone(125, 0.45, "sawtooth", 0.15, 72); },
    minus: () => tone(220, 0.06, "square", 0.06, 160),
    pick: () => tone(500, 0.08, "triangle", 0.12, 900),
    chainpull: () => { tone(900, 0.05, "square", 0.08); noise(0.05, 2500, 0.2, "bandpass", 0.05); tone(300, 0.12, "sine", 0.15, 180, 0.08); },
  };

  // The burning fuse's hiss: a looped band of noise until it's cut or blows.
  const hissStart = () => {
    const c = ac(); if (!c || hiss) return;
    const n = c.createBufferSource(), b = c.createBuffer(1, c.sampleRate * 2, c.sampleRate), ch = b.getChannelData(0);
    for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1;
    n.buffer = b; n.loop = true;
    const f = c.createBiquadFilter(); f.type = "bandpass"; f.frequency.value = 5200;
    const g = c.createGain(); g.gain.value = 0.045;
    n.connect(f).connect(g).connect(c.destination); n.start();
    hiss = n;
  };
  const hissStop = () => { if (hiss) { try { hiss.stop(); } catch { /* already stopped */ } hiss = null; } };

  root.addEventListener("bt-tts:sound", (ev) => { if (!ev.detail.on) hissStop(); });

  return { SFX, hissStart, hissStop };
}
