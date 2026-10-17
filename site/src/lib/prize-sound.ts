// The Prize Wheel's recorded tick (docs/specs/prize-box.md §2 "Sound"): when Boomer records his wheel, the file goes in site/public/sounds/prize-tick.mp3
// and the next build finds it here (a build-time glob: no request is ever made for a file that isn't there). Until then this is null and
// shared/ui/wheel-sound.js plays its synthesized tick.
const found = import.meta.glob("../../public/sounds/prize-tick.mp3", { eager: true, query: "?url", import: "default" }) as Record<string, string>;
export const PRIZE_TICK_SRC: string | null = Object.values(found)[0] || null;
