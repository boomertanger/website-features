// Cloud Stash's constants (docs/specs/cloud-stash.md §3). No Firebase here, so build-time pages (How it works) can import it.
export type UsageStatus = "healthy" | "paused" | "over";
export type Tier = "owner" | "overseer" | "steward";

/** Badge and meter tones: healthy green, uploads paused gold (the kit's amber meter), over limit red. */
export const USAGE_STATUS: Record<UsageStatus, { label: string; badge: string; meter: string; line: string }> = {
  healthy: { label: "Healthy", badge: "green", meter: "green", line: "Uploads are open." },
  paused: { label: "Uploads paused", badge: "gold", meter: "amber", line: "Member uploads are paused. Staff uploads still work." },
  over: { label: "Over limit", badge: "red", meter: "red", line: "All uploads are stopped except the owner's." },
};

/** The feature keys on the asset records, with the names and icons the page shows. Anything else shows its key. */
export const FEATURES: Record<string, { name: string; ic: string }> = {
  bugZapper: { name: "Bug Zapper", ic: "🐞" },
  gameVault: { name: "Game Vault", ic: "🗝" },
  funFactory: { name: "Night Shift", ic: "🌙" },
  untracked: { name: "Untracked", ic: "❔" },
};
export const featureOf = (key: string) => FEATURES[key] || { name: key || "Unknown", ic: "📁" };

export const NEEDS_OVERSEER = "Needs the owner or an Overseer.";
export const MB = 1024 * 1024;
export const fmtBytes = (b: number) => (b >= 1024 * MB ? `${(b / 1024 / MB).toFixed(1)} GB` : b >= MB ? `${(b / MB).toFixed(1)} MB` : `${Math.max(0, Math.round(b / 1024))} KB`);
