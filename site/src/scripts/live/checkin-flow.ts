// Checking in, shared by the /live panel (pub-bridge.ts) and the site-wide dialog (checkin-dialog.ts), so there is one set of rules
// (docs/specs/control-room.md §4): which rooms a member may pick, the room remembered from last time (localStorage) or set by a ?room= link on
// any page (youtube and ytv are converted to ytLandscape and ytVertical here, at the edge), and the one function that calls streamCheckIn.
import type { Beat, PubLive } from "./model";
import type { CheckInResult, Presence, PubApi, Room } from "./pub-data";
import type { CheckinOutcome } from "./pub-ui";

export const ROOM_KEY = "lp-room";
const ALIASES: Record<string, string> = { twitch: "twitch", tiktok: "tiktok", site: "site", ytlandscape: "ytLandscape", ytvertical: "ytVertical", youtube: "ytLandscape", ytv: "ytVertical" };
const PLATFORM_ROOMS: Room[] = ["twitch", "ytLandscape", "ytVertical", "tiktok"];

/** A room name a person or a link sent, as the canonical room (twitch, ytLandscape, ytVertical, tiktok, site), or null. */
export const normaliseRoom = (s: string | null | undefined): Room | null => (ALIASES[(s || "").trim().toLowerCase()] as Room) || null;

/** A ?room= link on ANY page remembers that room as the default (converted at the edge). Call once at page start. */
export function rememberRoomFromLink() {
  const r = normaliseRoom(new URLSearchParams(location.search).get("room"));
  if (!r) return;
  try { localStorage.setItem(ROOM_KEY, r); } catch { /* private mode */ }
}

/** The rooms a member may pick: backstage is only "site"; otherwise the rooms live now (the TikTok switch), never "site". */
export const roomsOf = (p: PubLive): Room[] => (p.state === "backstage" ? ["site"] : PLATFORM_ROOMS.filter((r) => (p.liveRooms || []).includes(r)));

/** The room to preselect: a ?room= link, else the last one used, else the only one there is. */
export function defaultRoom(rooms: Room[]): string {
  const link = normaliseRoom(new URLSearchParams(location.search).get("room"));
  if (link && rooms.includes(link)) return link;
  try { const saved = localStorage.getItem(ROOM_KEY); if (saved && rooms.includes(saved as Room)) return saved; } catch { /* private mode */ }
  return rooms.length === 1 ? rooms[0] : "";
}

/** The beat a check-in window is for (or the beat running). */
export const beatOf = (p: PubLive): Beat => (p.window.beat || p.beat || "start") as Beat;
export const isLocked = (pr: Presence | null, beat: Beat) => (pr?.wrongTries[beat] || 0) >= 5;
export const isOpenNow = (p: PubLive, now = Date.now()) => (p.state === "live" || p.state === "backstage") && p.window.open && !!p.window.closesAt && p.window.closesAt > now;

/**
 * Sends the word. Returns what the kit's check-in card understands, plus the updated presence (the caller keeps it): a success adds the beat, a lock
 * marks the beat locked. `already` (a second device) counts as in, with no XP.
 */
export async function submitCheckIn(api: PubApi, pub: PubLive, presence: Presence | null, word: string, room: string | null): Promise<{ outcome: CheckinOutcome; presence: Presence | null; xp: number; beat: Beat }> {
  const beat = beatOf(pub), bs = pub.state === "backstage";
  const none = { presence, xp: 0, beat };
  if (!bs && !room) return { outcome: { error: "Pick where you're watching." }, ...none };
  const r: CheckInResult = await api.checkIn(word, bs ? "site" : (room as Room));
  if ("ok" in r && r.ok) {
    if (room) { try { localStorage.setItem(ROOM_KEY, room); } catch { /* private mode */ } }
    const got = (r.beat || beat) as Beat;
    const next: Presence = { beats: { ...(presence?.beats || {}), [got]: { room: room || "site" } }, wrongTries: presence?.wrongTries || {} };
    const xp = r.already ? 0 : r.xp ?? 10;
    return { outcome: { ok: true, xp, streak: r.already ? "already checked in" : "stream streak safe tonight" }, presence: next, xp, beat: got };
  }
  if ("locked" in r) return { outcome: r, presence: { beats: presence?.beats || {}, wrongTries: { ...(presence?.wrongTries || {}), [beat]: 5 } }, xp: 0, beat };
  return { outcome: r as CheckinOutcome, ...none };
}
