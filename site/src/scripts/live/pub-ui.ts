// Small helpers the public /live page's parts share: the page context, who is looking, the page head, the mascot and BOOMBOT art, times.
import type { AuthState } from "../../lib/auth";
import type { NextStream } from "../../lib/next-stream";
import type { VCard } from "../vault/data";
import { esc, mascotHtml, reduced } from "./ui";
import type { LStream, PubLive } from "./model";
import type { PubApi } from "./pub-data";

export { esc, mascotHtml, reduced };

export type View = "room" | "live" | "ended";
export interface PubCtx {
  root: HTMLElement;
  api: PubApi;
  /** The latest public/live (the off-air state before it is known). */
  pub: PubLive;
  /** The next stream (waiting room, Starting soon, the ended page); null when none is scheduled or it isn't needed. */
  next: NextStream | null;
  /** The live or just-ended stream's own document (beat times, games played, planned games); null until read. */
  stream: LStream | null;
  vault: Map<string, VCard>;
  auth: AuthState;
  /** A signed-up member (can check in). In preview, ?as=member counts. */
  member: boolean;
  /** The waiting-room story shown on request (/live?how=1), even while a stream is on. */
  how: boolean;
  /** Starting soon (inside 15 minutes, or running late). */
  soon: boolean;
}
export interface ViewPart {
  /** Draws the view into its container (once per entry into the view). */
  mount(ctx: PubCtx, box: HTMLElement): void;
  /** Called on every change of data or auth while the view is showing; patch in place, never redraw an input. */
  update(ctx: PubCtx): void;
  /** Called when the view is left (stop timers, close the embed). */
  unmount?(): void;
}

/** A signed-up member. Real: signed in with a finished signup. Preview (signed out): the shell's ?as=member|admin switch. */
export function isMember(s: AuthState): boolean {
  if (s.user) return s.status === "verified" || s.status === "unverified";
  return s.status !== "loading" && document.body.dataset.auth !== "visitor" && document.body.dataset.env !== "production" && !!document.body.dataset.auth;
}

/** "7:00 PM" in the viewer's own time zone, and the day when it is not today. */
export const clock = (t: number) => new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(t);
export const dayClock = (t: number) => {
  const d = new Date(t), today = new Date();
  const same = d.toDateString() === today.toDateString();
  const day = new Intl.DateTimeFormat("en-US", { weekday: "short" }).format(d);
  return `${same ? "Tonight" : day} ${clock(t)}`;
};
export const pad2 = (n: number) => String(n).padStart(2, "0");
export const fmtHms = (msv: number) => { const s = Math.max(0, Math.floor(msv / 1000)); return `${Math.floor(s / 3600)}:${pad2(Math.floor((s % 3600) / 60))}:${pad2(s % 60)}`; };
export const fmtDuration = (msv: number) => { const m = Math.max(0, Math.round(msv / 60000)); return m >= 60 ? `${Math.floor(m / 60)}h ${pad2(m % 60)}m` : `${m}m`; };

export { corridorSvg } from "../../lib/live-art.js";

// The kit's .js helpers infer their option types from default values, so some options (rooms, start, end) look unknown to TypeScript. These are the same
// functions with the options typed loosely, so the page parts call them without casts.
import { checkinHtml as _checkinHtml, initCheckin as _initCheckin, applyCheckinResult as _apply, setCheckinCount as _setCount } from "../../../../shared/ui/checkin.js";
import { dualTimeHtml as _dualTimeHtml } from "../../../../shared/ui/scream-planner.js";
import { ticketHtml as _ticketHtml } from "../../../../shared/ui/ticket.js";
import { initHowItWorks as _initHowItWorks } from "../../../../shared/ui/how-it-works.js";
type Opts = Record<string, unknown>;
export type CheckinOutcome = { ok: true; xp?: number; streak?: string | false; count?: number } | { ok: false; left: number } | { locked: true } | { error: string };
export const checkinHtml = _checkinHtml as unknown as (o: Opts) => string;
export const initCheckin = _initCheckin as unknown as (root: ParentNode, o: { onSubmit?: (word: string, room: string | null, el: HTMLElement) => CheckinOutcome | Promise<CheckinOutcome> }) => void;
export const applyCheckinResult = _apply as unknown as (el: Element, r: CheckinOutcome) => void;
export const setCheckinCount = _setCount as unknown as (el: Element, n: number) => void;
export const dualTimeHtml = _dualTimeHtml as unknown as (o: Opts) => string;
export const ticketHtml = _ticketHtml as unknown as (o: Opts) => string;
export const initHowItWorks = _initHowItWorks as unknown as (root: ParentNode) => void;
import { liveBannerHtml as _liveBannerHtml, initLiveBanner as _initLiveBanner } from "../../../../shared/ui/checkin.js";
export const liveBannerHtml = _liveBannerHtml as unknown as (o: Opts) => string;
export const initLiveBanner = _initLiveBanner as unknown as (root: ParentNode, o?: { onCheckIn?: (el: HTMLElement) => void }) => void;
