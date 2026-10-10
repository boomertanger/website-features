// site/src/scripts/tech-stack/data.ts — the Tech Stack's public data (src/data/tech-stack.json, checked by scripts/check-tech-stack.js before every
// build; docs/specs/tech-stack.md §6) and the small lookups every part of the page shares: devices and cables by id, what goes in and out of a device,
// positions per view, and Cloudinary photo URLs (f_auto,q_auto, sized per use). Used at build time (tech-stack.astro) and in the browser.
// Photos need the build's PUBLIC_CLOUDINARY_CLOUD_NAME; without it (or for a photo that isn't uploaded) the page draws the device instead.
import data from "../../data/tech-stack.json";

export type View = "photo" | "drawn" | "blueprint" | "flow" | "list";
export type Look = Exclude<View, "list">;
export interface Device {
  id: string; short: string; name: string; model: string; category: string; art: string; pc: null | "gaming" | "streaming" | "both";
  role: string; onAir: boolean; tags: string; referral: string | null;
  views: { drawn: { x: number; y: number }; flowColumn: number; photo: null | { x: number; y: number; w: number; h: number; anchor: [number, number] } };
  photo: { desk: string | null; card: string };
}
export interface Gear { id: string; model: string; category: string; role: string; photo: string; referral: string | null }
export interface Cable { id: string; from: string; to: string; signal: "video" | "audio" | "usb" | "wifi" | "net"; carries: "video" | "av" | "audio" | "control" | "data" | "stream" }
export interface Tour { id: string; title: string; steps: { device: string; cables: string[] }[] }

export const TS = data as unknown as {
  viewBox: [number, number]; defaultView: View; categories: { id: string; name: string }[]; signals: { id: string; name: string }[];
  devices: Device[]; gear: Gear[]; cables: Cable[]; tours: Tour[];
  software: { stage: string; icon: string; text: string; apps: { name: string; role: string }[] }[];
  pcCompare: Record<"gaming" | "streaming", { photo: string; model: string; cpu: string; gpu: string; ram: string; storage: string; job: string; history: string; runs: string }>;
  internet: { speed: string; symmetrical: boolean; unlimited: boolean };
  askBoombot: { q: string; a: string }[];
  mixerPublic: { device: string; terms: Record<string, string> };
};
export const [VB_W, VB_H] = TS.viewBox;
export const DEVICES = TS.devices, CABLES = TS.cables, TOURS = TS.tours;
export const DEV: Record<string, Device> = Object.fromEntries(DEVICES.map((d) => [d.id, d]));
export const CAB: Record<string, Cable> = Object.fromEntries(CABLES.map((c) => [c.id, c]));
export const CAT_NAME: Record<string, string> = Object.fromEntries(TS.categories.map((c) => [c.id, c.name]));
export const SIG_NAME: Record<string, string> = Object.fromEntries(TS.signals.map((s) => [s.id, s.name]));
export const PC_NAME = { gaming: "Gaming PC", streaming: "Streaming PC", both: "Both PCs" } as const;
export const VERB: Record<Cable["carries"], string> = { video: "video", av: "game video and sound", audio: "audio", control: "control", data: "internet", stream: "the stream" };
export const outOf = (id: string) => CABLES.filter((c) => c.from === id);
export const inTo = (id: string) => CABLES.filter((c) => c.to === id);
/** Parallel runs between the same two devices get their own lane (0, 1, …) so they don't draw on top of each other. */
export const PAIR_K: Record<string, number> = (() => { const seen: Record<string, number> = {}, k: Record<string, number> = {}; CABLES.forEach((c) => { const p = [c.from, c.to].sort().join("|"); k[c.id] = seen[p] = (seen[p] ?? -1) + 1; }); return k; })();
export const VIEWS: [View, string][] = [["photo", "Photo"], ["drawn", "Drawn"], ["blueprint", "Blueprint"], ["flow", "Flow"], ["list", "List"]];

// ---- photos ----
const CLOUD = (import.meta.env.PUBLIC_CLOUDINARY_CLOUD_NAME as string | undefined) || "";
/** A Cloudinary delivery URL for a fixed public id at width w (px; f_auto,q_auto, never upscaled), or "" when photos are off. */
export const photoUrl = (publicId: string | null | undefined, w: number) =>
  CLOUD && publicId ? `https://res.cloudinary.com/${encodeURIComponent(CLOUD)}/image/upload/f_auto,q_auto,c_limit,w_${Math.round(w)}/${publicId}` : "";
/** The card photo for a device or gear id (platforms are drawn: their logos aren't photos). */
export const cardPhoto = (id: string) => { const d = DEV[id]; if (d) return d.category === "platforms" ? null : d.photo.card; const g = TS.gear.find((x) => x.id === id); return g ? g.photo : null; };
export const hasPhotos = () => !!CLOUD;

// ---- positions ----
const FLOW_X = [130, 390, 650, 910, 1170, 1460];
export const FLOW_COLS: [string, number][] = [["In", 130], ["Hubs", 390], ["Gaming PC", 650], ["Capture", 910], ["Streaming PC", 1170], ["Out", 1460]];
// As in the approved mockup: the Quest sits with the hubs (its cable and the Sennheiser set fan out from it), and the In column has a fixed order.
const FLOW_COLUMN = (d: Device) => (d.id === "quest" ? 1 : d.views.flowColumn);
const IN_ORDER = ["sm7", "link", "brio", "c920", "link2", "link2c", "ctrl", "kb", "pedal", "g502", "g503", "ont"];
let flowCache: Record<string, [number, number]> | null = null;
/** Flow: left to right by column; within a column, each device sits near the average height of what it's wired to, never closer than one row. */
function flowPos() {
  if (flowCache) return flowCache;
  const P: Record<string, [number, number]> = {};
  const rank = (id: string) => (IN_ORDER.includes(id) ? IN_ORDER.indexOf(id) : IN_ORDER.length);
  const col0 = DEVICES.filter((d) => FLOW_COLUMN(d) === 0).map((d) => d.id).sort((a, b) => rank(a) - rank(b));
  col0.forEach((id, i) => { P[id] = [FLOW_X[0], 80 + i * (890 / Math.max(1, col0.length - 1))]; });
  for (let col = 1; col < 6; col++) {
    const want = DEVICES.filter((d) => FLOW_COLUMN(d) === col).map((d) => {
      const ys = CABLES.filter((c) => (c.to === d.id && P[c.from]) || (c.from === d.id && P[c.to])).map((c) => P[c.to === d.id ? c.from : c.to][1]);
      return [d.id, ys.length ? ys.reduce((a, b) => a + b, 0) / ys.length : 500] as [string, number];
    }).sort((a, b) => a[1] - b[1]);
    const gap = col === 5 ? 56 : 70;
    for (let i = 1; i < want.length; i++) if (want[i][1] < want[i - 1][1] + gap) want[i][1] = want[i - 1][1] + gap;
    if (want.length) {
      const span = want[want.length - 1][1] - want[0][1];
      if (span > 880) want.forEach((w, i) => (w[1] = 80 + i * (880 / Math.max(1, want.length - 1))));
      else { const lo = Math.max(80, Math.min(want[0][1], 960 - span)), sh = lo - want[0][1]; want.forEach((w) => (w[1] += sh)); }
    }
    want.forEach(([id, y]) => (P[id] = [FLOW_X[col], y]));
  }
  return (flowCache = P);
}
/** Where a device's cables meet it in a view (scene units, 1600 × 1000). Photo view without a cut-out: its Drawn position. */
export function posOf(d: Device, look: Look): [number, number] {
  if (look === "flow") return flowPos()[d.id];
  if (look === "photo" && d.views.photo) return d.views.photo.anchor;
  return [d.views.drawn.x, d.views.drawn.y];
}

/** Every distinct model in the hardware list (devices without the platforms, then gear), grouped so a model that repeats shows once. */
export function hardwareGroups() {
  const g = new Map<string, (Device | Gear)[]>();
  [...DEVICES.filter((d) => d.category !== "platforms"), ...TS.gear].forEach((d) => { if (!g.has(d.model)) g.set(d.model, []); g.get(d.model)!.push(d); });
  return [...g.values()];
}
export const isDevice = (x: Device | Gear): x is Device => "art" in x;
