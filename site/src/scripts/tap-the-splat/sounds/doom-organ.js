// doom-organ.js: Tap the Splat "lose" sound (approved in chat, option B "Doom organ").
// A dissonant organ chord that sags down in pitch and darkens, over a low bass note. About 2.2 s.
// Pure Web Audio synthesis, no audio files.
//
// Usage:
//   import { doomOrgan } from "./doom-organ.js";
//   doomOrgan(audioContext, destinationNode);            // plays now
//   doomOrgan(audioContext, destinationNode, startTime); // plays at a given ctx time
// destinationNode is the game's master/output gain (so the mute toggle and volume still apply).

export function doomOrgan(ctx, destination, when = ctx.currentTime + 0.03) {
  const t = when;

  // The chord: D3, D#3, G#3, A3 (clashing semitones = dread).
  const notes = [146.8, 155.6, 207.7, 220.0];
  for (const f of notes) {
    // Two slightly detuned voices per note (sawtooth + square) for an organ-like beating.
    [["sawtooth", 1], ["square", 1.004]].forEach(([type, detune]) => {
      const osc = ctx.createOscillator();
      const lp = ctx.createBiquadFilter();
      const g = ctx.createGain();

      osc.type = type;
      osc.frequency.setValueAtTime(f * detune, t);
      osc.frequency.linearRampToValueAtTime(f * detune * 0.84, t + 1.8); // pitch sags ~3 semitones

      lp.type = "lowpass";
      lp.frequency.setValueAtTime(1600, t);
      lp.frequency.linearRampToValueAtTime(500, t + 2.0);                // tone darkens

      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.045, t + 0.08);                    // quick swell in
      g.gain.setValueAtTime(0.045, t + 1.5);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 2.2);               // fade out

      osc.connect(lp).connect(g).connect(destination);
      osc.start(t);
      osc.stop(t + 2.3);
    });
  }

  // Low bass note underneath (D2 sagging), triangle wave.
  const bass = ctx.createOscillator();
  const bg = ctx.createGain();
  bass.type = "triangle";
  bass.frequency.setValueAtTime(73.4, t);
  bass.frequency.exponentialRampToValueAtTime(61, t + 2.2);
  bg.gain.setValueAtTime(0.0001, t);
  bg.gain.exponentialRampToValueAtTime(0.18, t + 0.05);
  bg.gain.setValueAtTime(0.18, t + 1.4);
  bg.gain.exponentialRampToValueAtTime(0.0001, t + 2.2);
  bass.connect(bg).connect(destination);
  bass.start(t);
  bass.stop(t + 2.3);

  return 2.2; // duration in seconds
}
