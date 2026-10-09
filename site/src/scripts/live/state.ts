// The Control Room page's shared state (one object, imported by control.ts and the parts it is built from: stage, rail, deck). Kept apart so
// those modules never import each other in a circle.
import type { Api } from "./api";
import type { VCard } from "../vault/data";
import type { LStream, Main, Role, Snapshot } from "./model";

export type Mode = "idle" | "live" | "ended";
export interface Ctx {
  role: Role;
  root: HTMLElement;
  api: Api;
  snap: Snapshot;
  main: Main | null;
  mode: Mode;
  /** Today's streams (scheduled, within 12 hours of now), the next one first. */
  todays: LStream[];
  pickedId: string | null;
  uid: string;
  /** The Game Vault summary by slug (covers, search), loaded once. */
  vault: Map<string, VCard>;
  /** A celebration or dialog result the render should know about. */
  wrap: { durationMs: number; peak: number; checkins: number; byBeat: Record<string, number>; title: string } | null;
  /** The TikTok switch, from the stream's liveRooms (written by liveRoom); an optimistic value while a change is in flight. */
  tiktokOn: boolean;
  /** The owner left the wrap-up for the controls. */
  wrapDismissed: boolean;
  /** Re-read the data and redraw. */
  refresh(): Promise<void>;
  /** Redraw from what is already read. */
  render(): void;
  /** Hooks the parts register: run after every redraw. */
  after: ((ctx: Ctx) => void)[];
  /** Click actions, by data-act. */
  acts: Record<string, (btn: HTMLElement, e: Event) => void | Promise<void>>;
  /** Named things the parts can ask the page to do (a part registers; another calls). */
  hooks: Record<string, (...a: any[]) => any>;
}
export const ctx = {} as Ctx;

export const isLive = (c: Ctx = ctx) => c.mode === "live";
export const picked = (c: Ctx = ctx): LStream | null => c.todays.find((s) => s.id === c.pickedId) || c.todays[0] || null;
/** The stream the controls are about: the live one, else the picked one. */
export const current = (c: Ctx = ctx): LStream | null => (c.mode === "live" ? c.snap.live : picked(c));
