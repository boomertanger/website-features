// Tap the Splat sound effects: all synthesised with Web Audio (no audio files),
// ported from the approved prototype. Sound is on unless the footer's toggle set
// data-sound="off" on the game root (saved per browser by scripts/footer.js).
import { getAudio } from "./audio-unlock.js";
import { doomOrgan } from "./sounds/doom-organ.js";
import { playSlop } from "./sounds/slop-custom.js";

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

  // A wet squelch: noise through a resonant band-pass that sweeps down (from -> to Hz),
  // with a fast wobble on the filter (wob Hz, depth Hz) so it sounds wet, not hissy.
  const squelch = (d, from, to, v, { q = 7, wob = 16, depth = 160, delay = 0 } = {}) => {
    const c = ac(); if (!c) return;
    const t = c.currentTime + delay, n = c.createBufferSource(), b = c.createBuffer(1, Math.ceil(c.sampleRate * d), c.sampleRate), ch = b.getChannelData(0);
    for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1;
    n.buffer = b;
    const f = c.createBiquadFilter(); f.type = "bandpass"; f.Q.value = q;
    f.frequency.setValueAtTime(from, t); f.frequency.exponentialRampToValueAtTime(to, t + d);
    const lfo = c.createOscillator(), lg = c.createGain(); lfo.frequency.value = wob; lg.gain.value = depth;
    lfo.connect(lg).connect(f.frequency);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    n.connect(f).connect(g).connect(c.destination);
    n.start(t); lfo.start(t); n.stop(t + d + 0.02); lfo.stop(t + d + 0.02);
  };
  // A goo bubble: a short muffled tone that drops in pitch ("blup").
  const blup = (f, to, d, v, delay) => {
    const c = ac(); if (!c) return;
    const t = c.currentTime + delay, o = c.createOscillator(), lp = c.createBiquadFilter(), g = c.createGain();
    o.type = "sine"; o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(to, t + d);
    lp.type = "lowpass"; lp.frequency.value = 900;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(lp).connect(g).connect(c.destination); o.start(t); o.stop(t + d + 0.02);
  };
  // A roar: noise through a lowpass sweeping down (from -> to Hz), sharp attack, long fade.
  const blast = (d, from, to, v, delay = 0) => {
    const c = ac(); if (!c) return;
    const t = c.currentTime + delay, n = c.createBufferSource(), b = c.createBuffer(1, Math.ceil(c.sampleRate * d), c.sampleRate), ch = b.getChannelData(0);
    for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1;
    n.buffer = b;
    const f = c.createBiquadFilter(); f.type = "lowpass"; f.Q.value = 1.2;
    f.frequency.setValueAtTime(from, t); f.frequency.exponentialRampToValueAtTime(to, t + d);
    const g = c.createGain(); g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    n.connect(f).connect(g).connect(c.destination); n.start(t); n.stop(t + d + 0.02);
  };
  const rnd = (a, b) => a + Math.random() * (b - a);

  const SFX = {
    // Starting and stopping the game (tap the splat to start, tap it again to tap out):
    // the slop plop (sounds/slop-custom.js, values as approved). Silent when sound is off.
    slop: () => { const c = ac(); if (c) playSlop(c, c.destination); },
    // Gooey, sloppy splat (the finish tap, before the fanfare): a soft wet slap and low thump, a resonant
    // "shlop" sweeping down, a smaller second squelch, a few goo bubbles and a sticky
    // tail. Dark and wet on purpose: no bright clicks. Varies a little every time.
    splat: () => {
      noise(0.07, 1100, 0.42, "lowpass");
      tone(rnd(100, 120), 0.2, "sine", 0.5, 38);
      squelch(rnd(0.3, 0.36), rnd(1300, 1600), rnd(220, 280), 0.6, { q: 6.5, wob: rnd(14, 19), depth: 180 });
      squelch(rnd(0.2, 0.26), rnd(850, 1000), rnd(180, 220), 0.32, { q: 9, wob: rnd(20, 26), depth: 120, delay: rnd(0.1, 0.14) });
      const bubbles = 3 + Math.floor(Math.random() * 3);
      for (let i = 0; i < bubbles; i++) blup(rnd(480, 760), rnd(130, 210), rnd(0.06, 0.1), rnd(0.07, 0.12), rnd(0.13, 0.5));
      noise(0.38, 320, 0.13, "lowpass", 0.24);
    },
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
    // The bomb going off: a sharp crack, a roaring blast whose lowpass sweeps down as it
    // fades, crackling debris and a rumbling tail (not just a low thump). About 1 s, so
    // it's done before the doom organ starts on the "Boom." card.
    boom: () => {
      noise(0.05, 2500, 0.8, "highpass");
      blast(0.9, 5000, 180, 0.9);
      tone(rnd(90, 110), 0.5, "sawtooth", 0.18, 35);
      for (let i = 0; i < 14; i++) noise(rnd(0.02, 0.05), rnd(1500, 5000), rnd(0.12, 0.25), "bandpass", rnd(0.08, 0.75));
      noise(1.0, 140, 0.35, "lowpass", 0.1);
    },
    blip: (k = 0) => tone(820 + k * 45, 0.07, "square", 0.09),
    // Lose screens ("Boom.", "Missed one.", "Wrong one."): the doom organ
    // (sounds/doom-organ.js, values as approved). Same output as every other sound, and
    // like them it doesn't play when sound is off (ac() is null then).
    doom: () => { const c = ac(); if (c) doomOrgan(c, c.destination); },
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
