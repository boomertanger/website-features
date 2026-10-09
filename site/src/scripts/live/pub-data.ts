// The public /live page's data door (docs/specs/control-room.md §7b, §13): the real reads and callables, or (non-production, ?live= or ?state= on the
// address) the sample in pub-preview.ts. The page never touches Firestore or call() directly, so a preview can never reach real data and real data
// is never faked. Everything here is something the rules let a visitor or a member read:
//   public/live          the one shared listener (lib/live.ts)
//   public/schedule + published streams     the next stream (lib/next-stream.ts)
//   streams/{id}         ONE read per stream (times of the beats, the games played, the planned games): published streams are public
//   public/vault         covers, Boomer's score, streams and hours per game
//   streams/{id}/presence/{uid}   the member's OWN check-ins (the rules let nobody else read it)
// Callables: streamCheckIn (members), backstageWatch (the stream's audience; the video id is kept in memory only, never logged or stored).
import type { AuthState } from "../../lib/auth";
import { call } from "../../lib/call";
import { db, doc, getDoc, SITE_ID } from "../../lib/db";
import { livePreview, onLive } from "../../lib/live";
import { loadNextStream, type NextStream } from "../../lib/next-stream";
import { reasonOf } from "../../lib/errors";
import { loadVault, type VCard } from "../vault/data";
import { streamFrom, type Beat, type LStream, type PubLive } from "./model";

export type Room = "twitch" | "ytLandscape" | "ytVertical" | "tiktok" | "site";
/** The member's own record for a stream: which beats they checked in to, and the wrong tries per beat. */
export interface Presence { beats: Partial<Record<Beat, { room: string }>>; wrongTries: Partial<Record<Beat, number>> }
/** What a check-in answers, in the kit's words (initCheckin / applyCheckinResult). */
export type CheckInResult = { ok: true; already?: boolean; beat?: Beat; xp?: number; count?: number } | { ok: false; left: number } | { locked: true } | { error: string };

export interface PubApi {
  preview: boolean;
  /** Calls fn with the live state now (once known) and on every change; returns a stop. */
  feed(fn: (p: PubLive) => void): () => void;
  next(): Promise<NextStream | null>;
  stream(id: string): Promise<LStream | null>;
  vault(): Promise<Map<string, VCard>>;
  presence(streamId: string, auth: AuthState): Promise<Presence | null>;
  checkIn(word: string, room: Room | null): Promise<CheckInResult>;
  backstage(streamId: string): Promise<{ videoId: string }>;
  /** "Remind me" through Boom Alerts. */
  remind(streamId: string): Promise<"ok" | "soon">;
}

const real: PubApi = {
  preview: false,
  feed: (fn) => onLive(fn),
  next: () => loadNextStream(),
  async stream(id) {
    try {
      const s = await getDoc(doc(db, "sites", SITE_ID, "streams", id));
      return s.exists() ? streamFrom(id, s.data()) : null;
    } catch { return null; }
  },
  async vault() {
    try { return new Map((await loadVault()).games.map((g) => [g.slug, g])); }
    catch { return new Map(); }
  },
  async presence(streamId, auth) {
    if (!auth.user) return null;
    try {
      const s = await getDoc(doc(db, "sites", SITE_ID, "streams", streamId, "presence", auth.user.uid));
      if (!s.exists()) return { beats: {}, wrongTries: {} };
      const d: any = s.data();
      return { beats: d.beats || {}, wrongTries: d.wrongTries || {} };
    } catch { return null; }
  },
  async checkIn(word, room) {
    try {
      const r = await call<any>("streamCheckIn", { word, ...(room ? { room } : {}) });
      return { ok: true, already: !!r.already, beat: r.beat, xp: r.xp ?? 0 };
    } catch (err) {
      const reason = reasonOf(err), d = (err as any)?.details || {};
      if (reason === "wrongWord" || reason === "empty") return d.locked ? { locked: true } : { ok: false, left: Number.isFinite(d.triesLeft) ? d.triesLeft : 0 };
      if (reason === "lockedOut") return { locked: true };
      const msg = (err as any)?.message;
      return { error: typeof msg === "string" && msg ? msg.replace(/ \[\d{3}\]$/, "") : "That didn't work. Try again." };
    }
  },
  async backstage(streamId) {
    const r = await call<{ videoId?: string }>("backstageWatch", { streamId });
    if (!r?.videoId) throw Object.assign(new Error("The video isn't ready yet."), { code: "bt/msg" });
    return { videoId: r.videoId };
  },
  async remind(streamId) {
    // Boom Alerts' alertsRemindMe is not deployed yet (docs/specs/boom-alerts.md §13): until it is, the button says so and offers the calendar.
    try { await call("alertsRemindMe", { streamId }); return "ok"; }
    catch (err) {
      const code = (err as any)?.code;
      if (code === "functions/not-found" || code === "functions/unimplemented") return "soon";
      throw err;
    }
  },
};

let cached: Promise<PubApi> | null = null;
export function pubApi(): Promise<PubApi> {
  if (!cached) cached = livePreview() ? import("./pub-preview").then((m) => m.previewApi()) : Promise.resolve(real);
  return cached;
}
