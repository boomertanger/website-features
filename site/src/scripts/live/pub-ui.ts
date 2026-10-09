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

/** A scene for an empty video or a gate: the corridor of the hero (drawn, not a screenshot). */
export function corridorSvg(id: string) {
  return `<svg class="lp-scene" viewBox="0 0 640 360" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
  <defs><radialGradient id="${id}a" cx="50%" cy="46%" r="60%"><stop offset="0" stop-color="var(--bt-surface-2)"/><stop offset="1" stop-color="var(--bt-bg)"/></radialGradient>
  <linearGradient id="${id}b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--bt-surface-2)"/><stop offset="1" stop-color="var(--bt-bg)"/></linearGradient></defs>
  <rect width="640" height="360" fill="url(#${id}a)"/>
  <path d="M0 0 L250 120 L390 120 L640 0 Z" fill="var(--bt-bg)"/><path d="M0 360 L250 240 L390 240 L640 360 Z" fill="var(--bt-surface)"/>
  <path d="M0 0 L250 120 L250 240 L0 360 Z" fill="var(--bt-surface)"/><path d="M640 0 L390 120 L390 240 L640 360 Z" fill="var(--bt-surface)"/>
  <g stroke="var(--bt-border-2)" stroke-width="2" fill="none"><path d="M60 30 L60 330"/><path d="M130 63 L130 297"/><path d="M190 92 L190 268"/><path d="M580 30 L580 330"/><path d="M510 63 L510 297"/><path d="M450 92 L450 268"/></g>
  <rect x="250" y="120" width="140" height="120" fill="url(#${id}b)"/>
  <rect x="290" y="150" width="60" height="90" fill="var(--bt-bg)" stroke="var(--bt-border-2)"/>
  <rect class="lp-alarm" x="300" y="128" width="40" height="8" rx="2" fill="var(--bt-red)"/>
  <rect class="lp-flicker" x="270" y="104" width="100" height="5" fill="var(--bt-lamp)" opacity=".9"/>
  <g opacity=".08"><path class="lp-flicker" d="M270 109 L230 250 L410 250 L370 109Z" fill="var(--bt-lamp)"/></g>
  <path d="M312 240 q8-40 8-58 q0-8 6-8 q6 0 6 8 q0 18 8 58z" fill="var(--bt-bg)" opacity=".9"/>
</svg>`;
}
