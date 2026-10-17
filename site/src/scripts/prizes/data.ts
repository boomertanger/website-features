// One door for the Prize Box pages' data (docs/specs/prize-box.md §5, §6): the real reads and callables, or (non-production, ?sample=1) local
// sample data, so a preview never reaches real data. Reads: public/prizeBox (the summary: open and upcoming contests, past winners), a contest by
// its slug (rules: public once it leaves draft, so the query asks for the non-draft statuses only), and the member's own entry (rules: the entrant).
// Everything private goes through callables: prizeMine (eligibility, the entry, the code, the mailing address, wins), prizeEnter, prizeClaim...
import { isProduction } from "../../lib/env.js";

export type ContestType = "live" | "online" | "mail";
export type ContestStatus = "draft" | "scheduled" | "open" | "closed" | "judging" | "drawing" | "won" | "done" | "cancelled";
export interface Prize { place: number; title: string; kind: "digital" | "storeCode" | "mailed" | "badgeXp"; xp?: number }
export interface Contest {
  id: string; slug: string; title: string; blurb: string; type: ContestType; status: ContestStatus; method: "wheel" | "judge" | "random";
  winnersCount: number; prizes: Prize[]; opensAt: number | null; closesAt: number | null; beat: string | null; entryKind: "upload" | "text" | null;
  eligibility: { kind: string; badgeId?: string; n?: number }[]; rulesMd: string; entries: number;
}
export interface PubWinner { handle: string; contestTitle: string; contestSlug: string | null; prizeTitle: string; place: number; at: number | null }
export interface Summary { contests: Contest[]; winners: PubWinner[]; counts: { open: number; upcoming: number; winners: number } }
export interface MyEntry { kind: "upload" | "text" | "mail"; status: string; title: string | null; text: string | null; hasFile: boolean; code: string | null; receivedAt: number | null; postmarkedOn: string | null; rejectReason: string | null; showIfWin: boolean; createdAt: number | null; updatedAt: number | null }
export interface Win { winnerId: string; contestId: string; contestTitle: string; contestSlug: string; place: number; prizeTitle: string; kind: Prize["kind"]; status: "pending" | "claimed" | "shipped" | "forfeited"; claimBy: number | null; at: number | null; claimedAt: number | null; shippedAt: number | null; code?: string }
export interface ContestMine { eligible: boolean; reason: string | null; message: string | null; entry: MyEntry | null; mailingAddress: string | null; wins: Win[] }
export interface Mine { toClaim: Win[]; entries: (MyEntry & { contestId: string; slug: string; contestTitle: string; type: ContestType; contestStatus: ContestStatus; closesAt: number | null })[]; wins: Win[] }

export const sampleAsked = () => !isProduction && new URLSearchParams(location.search).get("sample") === "1";
const ms = (v: any): number | null => (v == null ? null : typeof v === "number" ? v : typeof v.toMillis === "function" ? v.toMillis() : null);
export function toContest(id: string, d: any): Contest {
  return {
    id, slug: String(d.slug || id), title: String(d.title || ""), blurb: String(d.blurb || ""), type: d.type, status: d.status, method: d.method,
    winnersCount: Number(d.winnersCount) || 1, prizes: Array.isArray(d.prizes) ? d.prizes : [], opensAt: ms(d.opensAt), closesAt: ms(d.closesAt),
    beat: d.draw ? d.draw.beat || null : d.beat || null, entryKind: d.entryKind || null, eligibility: Array.isArray(d.eligibility) ? d.eligibility : [],
    rulesMd: typeof d.rulesMd === "string" ? d.rulesMd : "", entries: (d.counts && d.counts.entries) || d.entries || 0,
  };
}

// ------------------------------------------------------------------------------------------------ sample data (non-production, ?sample=1)
const DAY = 86400000;
function sample(): { summary: Summary; contests: Contest[] } {
  const now = Date.now();
  const c = (o: Partial<Contest>): Contest => ({ id: o.slug!, slug: o.slug!, title: "", blurb: "", type: "online", status: "open", method: "judge", winnersCount: 1, prizes: [], opensAt: now - 3 * DAY, closesAt: now + 14 * DAY, beat: null, entryKind: "upload", eligibility: [], rulesMd: "", entries: 38, ...o });
  const contests = [
    c({ slug: "break-wheel", title: "Break Wheel (sample)", blurb: "Check in on Friday's stream and you're on it.", type: "live", status: "scheduled", method: "wheel", beat: "break1", entryKind: null, opensAt: null, closesAt: null, prizes: [{ place: 1, title: "A horror game on Steam (sample)", kind: "digital" }], entries: 0 }),
    c({ slug: "draw-boomers-nightmare", title: "Draw Boomer's Nightmare (sample)", blurb: "Draw the scariest thing Boomer could meet on stream. Boomer picks his three favorites and reveals them live.", winnersCount: 3,
      prizes: [{ place: 1, title: "Your drawing framed for Boomer's stream room (sample)", kind: "mailed" }, { place: 2, title: "A horror game on Steam (sample)", kind: "digital" }, { place: 3, title: "The Prize Box Winner badge and 150 XP (sample)", kind: "badgeXp", xp: 150 }] }),
    c({ slug: "haunted-postcard", title: "Haunted Postcard (sample)", blurb: "Draw a postcard from a haunted place and mail it in with your code.", type: "mail", method: "random", entryKind: null, closesAt: now + 29 * DAY, prizes: [{ place: 1, title: "A merch store code (sample)", kind: "storeCode" }], entries: 12 }),
  ];
  const winners: PubWinner[] = [
    { handle: "screamteam", contestTitle: "Break Wheel, Sep 26 stream", contestSlug: null, prizeTitle: "A horror game on Steam", place: 1, at: now - 21 * DAY },
    { handle: "lanternjack", contestTitle: "Break Wheel, Sep 19 stream", contestSlug: null, prizeTitle: "Merch store code", place: 1, at: now - 28 * DAY },
    { handle: "hexqueen", contestTitle: "Summer Sketch Night", contestSlug: null, prizeTitle: "Drawing framed for the stream room", place: 1, at: now - 35 * DAY },
    { handle: "mothman", contestTitle: "Summer Sketch Night", contestSlug: null, prizeTitle: "A horror game on Steam", place: 2, at: now - 35 * DAY },
  ];
  return { summary: { contests, winners, counts: { open: 2, upcoming: 1, winners: 4 } }, contests };
}

// ------------------------------------------------------------------------------------------------ reads
export async function loadSummary(): Promise<Summary> {
  if (sampleAsked()) return sample().summary;
  const { db, doc, getDoc, SITE_ID } = await import("../../lib/db");
  const s = await getDoc(doc(db, "sites", SITE_ID, "public", "prizeBox"));
  const d = s.exists() ? (s.data() as any) : {};
  return { contests: (d.contests || []).map((x: any) => toContest(x.id, x)), winners: d.winners || [], counts: d.counts || { open: 0, upcoming: 0, winners: 0 } };
}
const PUBLIC_STATUSES = ["scheduled", "open", "closed", "judging", "drawing", "won", "done", "cancelled"];
export async function loadContest(slug: string): Promise<Contest | null> {
  if (sampleAsked()) return sample().contests.find((c) => c.slug === slug) || sample().contests[1];
  const { db, collection, query, where, limit, getDocs, SITE_ID } = await import("../../lib/db");
  const q = query(collection(db, "sites", SITE_ID, "prizeBox", "main", "contests"), where("slug", "==", slug), where("status", "in", PUBLIC_STATUSES), limit(1));
  const r = await getDocs(q);
  return r.empty ? null : toContest(r.docs[0].id, r.docs[0].data());
}

// ------------------------------------------------------------------------------------------------ callables
export async function call<T = any>(name: string, data: unknown = {}): Promise<T> {
  if (sampleAsked()) return sampleCall(name, data) as T;
  const { call: c } = await import("../../lib/call");
  return c<T>(name, data);
}
function sampleCall(name: string, data: any): unknown {
  const now = Date.now();
  if (name === "prizeMine" && data && data.contestId) {
    const step = new URLSearchParams(location.search).get("entry") || "open";
    const entry: MyEntry | null = step === "entered" ? { kind: "upload", status: "submitted", title: "The Thing Under the Desk", text: null, hasFile: true, code: null, receivedAt: null, postmarkedOn: null, rejectReason: null, showIfWin: true, createdAt: now - DAY, updatedAt: now - DAY }
      : step === "code" ? { kind: "mail", status: "submitted", title: null, text: null, hasFile: false, code: "PB-7K4M", receivedAt: null, postmarkedOn: null, rejectReason: null, showIfWin: true, createdAt: now - DAY, updatedAt: now - DAY } : null;
    return { eligible: step !== "noteligible", reason: step === "noteligible" ? "memberDays" : null, message: step === "noteligible" ? "This one is for members of at least 30 days." : null, entry, mailingAddress: step === "code" ? "Boomertanger LLC, Prize Box\nPO Box 0000\nSample City, ST 00000 (sample)" : null, wins: [] };
  }
  if (name === "prizeMine") {
    const w = (o: Partial<Win>): Win => ({ winnerId: "w1", contestId: "draw-boomers-nightmare", contestTitle: "Draw Boomer's Nightmare (sample)", contestSlug: "draw-boomers-nightmare", place: 1, prizeTitle: "Your drawing framed (sample)", kind: "mailed", status: "pending", claimBy: now + 5 * DAY, at: now - 2 * DAY, claimedAt: null, shippedAt: null, ...o });
    const empty = new URLSearchParams(location.search).get("mine") === "empty";
    if (empty) return { toClaim: [], entries: [], wins: [] };
    const pend = [w({}), w({ winnerId: "w2", contestTitle: "Break Wheel (sample)", contestSlug: "break-wheel", prizeTitle: "A horror game on Steam (sample)", kind: "digital", claimBy: now + 1 * DAY })];
    return {
      toClaim: pend,
      entries: [
        { contestId: "a", slug: "draw-boomers-nightmare", contestTitle: "Draw Boomer's Nightmare (sample)", type: "online", contestStatus: "open", closesAt: now + 14 * DAY, kind: "upload", status: "accepted", title: "The Thing Under the Desk", text: null, hasFile: true, code: null, receivedAt: null, postmarkedOn: null, rejectReason: null, showIfWin: true, createdAt: now - DAY, updatedAt: now - DAY },
        { contestId: "b", slug: "haunted-postcard", contestTitle: "Haunted Postcard (sample)", type: "mail", contestStatus: "open", closesAt: now + 29 * DAY, kind: "mail", status: "submitted", title: null, text: null, hasFile: false, code: "PB-7K4M", receivedAt: null, postmarkedOn: null, rejectReason: null, showIfWin: true, createdAt: now - 3 * DAY, updatedAt: now - 3 * DAY },
        { contestId: "c", slug: "summer-sketch", contestTitle: "Summer Sketch Night (sample)", type: "online", contestStatus: "done", closesAt: now - 40 * DAY, kind: "upload", status: "rejected", title: "Moth Lamp", text: null, hasFile: true, code: null, receivedAt: null, postmarkedOn: null, rejectReason: "It's a photo, and this one was for drawings.", showIfWin: true, createdAt: now - 50 * DAY, updatedAt: now - 45 * DAY },
      ],
      wins: [...pend, w({ winnerId: "w3", contestTitle: "Break Wheel, Sep 19 (sample)", prizeTitle: "Merch store code (sample)", kind: "storeCode", status: "claimed", claimedAt: now - 20 * DAY, code: "SAMPLE-CODE-0000", at: now - 28 * DAY })],
    };
  }
  if (name === "prizeClaim") return { ok: true, status: "claimed", code: data && data.winnerId === "w2" ? "SAMPLE-KEY-1234-ABCD" : null };
  if (name === "prizeGetCode") return { ok: true, code: "PB-7K4M", mailingAddress: "Boomertanger LLC, Prize Box\nPO Box 0000\nSample City, ST 00000 (sample)" };
  return { ok: true };
}

// ------------------------------------------------------------------------------------------------ words
export const STATUS: Record<ContestStatus, [string, string]> = {
  draft: ["gray", "Draft"], scheduled: ["gold", "Planned"], open: ["green", "Open"], closed: ["teal", "Closed"], judging: ["teal", "Judging"],
  drawing: ["gold", "Drawing now"], won: ["lime", "Winners picked"], done: ["lime", "Winners picked"], cancelled: ["gray", "Cancelled"],
};
export const TYPE_WORD: Record<ContestType, string> = { live: "Live draw", online: "Online entry", mail: "Mail-in" };
export const METHOD_WORD = { wheel: "The Prize Wheel", judge: "Judged by Boomer", random: "Random draw" } as const;
export const ENTRY_WORD: Record<string, string> = { submitted: "Sent", accepted: "Accepted", rejected: "Not accepted", withdrawn: "Withdrawn", received: "Received" };
export const BEAT_WORD: Record<string, string> = { break1: "Break 1", break2: "Break 2" };
export const placeWord = (n: number) => `${n}${n === 1 ? "st" : n === 2 ? "nd" : n === 3 ? "rd" : "th"}`;
export const dateWord = (t: number | null) => (t ? new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric" }).format(t) : "");
export const dateTimeWord = (t: number | null) => (t ? new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/Chicago", timeZoneName: "short" }).format(t) : "");
/** The .bt-mini-cd countdown digits to a time. */
export function miniCd(to: number | null, now = Date.now()) {
  let s = Math.max(0, Math.floor(((to || now) - now) / 1000));
  const d = Math.floor(s / 86400); s %= 86400;
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return `<span>${d}d</span><span>${String(h).padStart(2, "0")}h</span><span>${String(m).padStart(2, "0")}m</span>`;
}
export const contestHref = (c: { slug: string }) => `/prizes/${encodeURIComponent(c.slug)}`;
