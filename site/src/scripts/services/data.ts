// Service Hub, the member side (docs/specs/service-hub.md §4, §5, §6, §8): the member-safe list (public/services, one read), the member's own
// my/{uid} (one read) and one rating doc when they want its comment or date, the test checks from the build's /services.json, and the calls
// (serviceRate, serviceTest). Members never see totals. The gate (scripts/boards/gate.ts) decides who may act; the callables check again.
// Preview (non-production, signed out, ?as=member): services from /services.json, the member from data/preview-services.json, and saves that
// change a local copy only.
import { makeGate } from "../boards/gate";
import { getAuthState, type AuthState } from "../../lib/auth";
import previewData from "../../data/preview-services.json";

export const gate = makeGate({ preview: previewData, feature: "services", verifyTitle: "Verify your email to rate and test", resultClass: "sv-result" });

/** The kit's rating values (rate.js) and the server's. */
export type Pick = "nope" | "like" | "love";
export type Value = "dislike" | "like" | "love";
export const toPick = (v: string): Pick => (v === "dislike" ? "nope" : (v as Pick));
export const toValue = (p: string): Value => (p === "nope" ? "dislike" : (p as Value));

export interface Service { id: string; name: string; type: string; area: string; blurb: string; link: string | null; version: string; status: string; audience: string; checks: number; rateableUntil?: number }
export interface Mine { value: Value; version: string; type?: string | null }
export interface My { rated: Record<string, Mine>; tested: Record<string, string>; coreRated: number | null; coreTotal: number | null; badges: Record<string, boolean> }
export interface RatingDoc { value: Value; version: string; comment: string; at: number | null }

const CORE = ["feature", "page", "arcadeGame", "streamSetup"];
export const isCore = (s: Service) => CORE.includes(s.type);

/** Who the viewer is for "open to them" (the server's audienceOpen; display only). */
export function whoOf(s: AuthState = getAuthState()) {
  if (gate.isPreview(s)) return { member: true, staff: false, admin: false, owner: false };
  const staff = s.roles.includes("mod") || s.roles.includes("admin");
  return { member: s.status === "verified" || s.status === "unverified", staff, admin: !!s.isAdmin, owner: false };
}
export function audienceOpen(audience: string, who: ReturnType<typeof whoOf>) {
  if (who.owner) return true;
  switch (audience) {
    case "everyone": return true;
    case "members": return who.member || who.staff || who.admin;
    case "crew": case "staff": return who.staff || who.admin;
    case "admins": return who.admin;
    default: return false;
  }
}
/** Rateable now: live, open to the viewer, and a stream only within its 14 days. */
export const rateable = (s: Service, who = whoOf()) => s.status === "live" && s.type !== "adminTool" && audienceOpen(s.audience, who) && (s.type !== "stream" || (!!s.rateableUntil && Date.now() < s.rateableUntil));

// ---------------------------------------------------------------------------------------------- badges (functions/data/trophy-room-badges.json)
export const BADGES: Record<string, { name: string; line: string }> = {
  "services-first-rating": { name: "First Verdict", line: "Your first rating." },
  "services-rated-10": { name: "Critic I", line: "10 services rated." },
  "services-rated-25": { name: "Critic II", line: "25 services rated." },
  "services-rated-50": { name: "Critic III", line: "50 services rated." },
  "services-rated-100": { name: "Critic IV", line: "100 services rated." },
  "services-full-coverage": { name: "Full Coverage", line: "Every core service open to you, rated." },
  "services-tester-1": { name: "Tester I", line: "Your first walkthrough test." },
  "services-tester-5": { name: "Tester II", line: "5 walkthrough tests." },
  "services-tester-15": { name: "Tester III", line: "15 walkthrough tests." },
  "vault-critic-5": { name: "Vault Critic I", line: "5 Vault games rated." },
  "vault-critic-15": { name: "Vault Critic II", line: "15 Vault games rated." },
  "vault-critic-30": { name: "Vault Critic III", line: "30 Vault games rated." },
};
/** The next rating badge to chase: [badge id, how many ratings it needs] (Full Coverage when the ladder's next rung is further away). */
export const LADDER: [number, string][] = [[1, "services-first-rating"], [10, "services-rated-10"], [25, "services-rated-25"], [50, "services-rated-50"], [100, "services-rated-100"]];

// ---------------------------------------------------------------------------------------------- the build's manifests (test checks)
let build: Promise<Record<string, any>> | null = null;
export function manifests(): Promise<Record<string, any>> {
  build ||= fetch("/services.json").then((r) => (r.ok ? r.json() : { services: [] })).catch(() => ({ services: [] })).then((b) => Object.fromEntries((b.services || []).map((m: any) => [m.id, m])));
  return build;
}
export async function checksOf(id: string): Promise<string[]> {
  const m = (await manifests())[id];
  return Array.isArray(m?.checks) ? m.checks : [];
}

// ---------------------------------------------------------------------------------------------- preview (a local copy)
const P = previewData as any;
const day = (s: string) => new Date(`${s}T12:00:00`).getTime();
let pv: { my: My; docs: Record<string, RatingDoc> } | null = null;
function previewState() {
  if (pv) return pv;
  const rated: Record<string, Mine> = {}, docs: Record<string, RatingDoc> = {};
  for (const [id, r] of Object.entries<any>(P.rated)) { rated[id] = { value: r.value, version: r.version }; docs[id] = { value: r.value, version: r.version, comment: r.comment || "", at: day(r.at) }; }
  pv = { my: { rated, tested: { ...P.tested }, coreRated: null, coreTotal: null, badges: Object.fromEntries((P.badges as string[]).map((b) => [b, true])) }, docs };
  return pv;
}
const fromManifest = (m: any): Service | null => (m.type === "adminTool" || m.hidden === true || m.status === "retired" ? null
  : { id: m.id, name: m.name, type: m.type, area: m.area || "", blurb: m.blurb || "", link: (m.routes && m.routes[0]) || null, version: String(m.version), status: m.status, audience: m.audience, checks: Array.isArray(m.checks) ? m.checks.length : 0 });

// ---------------------------------------------------------------------------------------------- reads
let list: Promise<Service[]> | null = null;
/** public/services (cached for the page's life). */
export function services(): Promise<Service[]> {
  list ||= (async () => {
    if (gate.isPreview()) return Object.values(await manifests()).map(fromManifest).filter(Boolean) as Service[];
    const { db, doc, getDoc, SITE_ID } = await import("../../lib/db");
    const s = await getDoc(doc(db, "sites", SITE_ID, "public", "services"));
    return ((s.exists() ? s.get("services") : null) || []) as Service[];
  })();
  return list;
}
export const serviceOf = async (id: string) => (await services()).find((s) => s.id === id) || null;

const blankMy = (): My => ({ rated: {}, tested: {}, coreRated: null, coreTotal: null, badges: {} });
const myOf = (d: any): My => ({ rated: d?.rated || {}, tested: d?.tested || {}, coreRated: d?.coreRated ?? null, coreTotal: d?.coreTotal ?? null, badges: d?.badges || {} });
let mine: Promise<My> | null = null;
/** my/{uid}: the member's ratings, tests and badges (blank for visitors). Cached; save() updates it. */
export function my(): Promise<My> {
  mine ||= (async () => {
    const s = getAuthState();
    if (gate.isPreview(s)) return previewState().my;
    if (!s.user) return blankMy();
    const { db, doc, getDoc, SITE_ID } = await import("../../lib/db");
    const d = await getDoc(doc(db, "sites", SITE_ID, "services", "main", "my", s.user.uid));
    return myOf(d.exists() ? d.data() : null);
  })();
  return mine;
}
/** The member's own rating doc (comment and date): only read when my/{uid} says it exists (the rules refuse a missing doc). */
export async function ratingOf(id: string): Promise<RatingDoc | null> {
  const s = getAuthState(), m = await my();
  if (!m.rated[id]) return null;
  if (gate.isPreview(s)) return previewState().docs[id] || null;
  if (!s.user) return null;
  try {
    const { db, doc, getDoc, SITE_ID } = await import("../../lib/db");
    const d = await getDoc(doc(db, "sites", SITE_ID, "services", "main", "ratings", `${id}__${s.user.uid}`));
    if (!d.exists()) return null;
    const x = d.data() as any;
    return { value: x.value, version: x.version, comment: x.comment || "", at: x.updatedAt?.toMillis?.() ?? null };
  } catch { const r = m.rated[id]; return { value: r.value, version: r.version, comment: "", at: null }; }
}

// ---------------------------------------------------------------------------------------------- calls
/** serviceRate. Updates the cached my/{uid} straight away (the trigger writes the real one a moment later). */
export async function rate(id: string, value: Value, comment: string): Promise<{ value: Value; version: string }> {
  const svc = await serviceOf(id);
  let out: { value: Value; version: string };
  if (gate.isPreview()) {
    await new Promise((r) => setTimeout(r, 350));
    out = { value, version: svc?.version || "1.0" };
    previewState().docs[id] = { value, version: out.version, comment, at: Date.now() };
  } else {
    const { call } = await import("../../lib/call");
    const r = await call<{ value: Value; version: string }>("serviceRate", { serviceId: id, value, comment });
    out = { value: r.value, version: r.version };
  }
  const m = await my();
  m.rated[id] = { value: out.value, version: out.version, type: svc?.type || null };
  document.dispatchEvent(new CustomEvent("sv:rated", { detail: { id, ...out, comment } }));
  return out;
}
/** serviceTest. counted false means this version was already tested by this member. */
export async function test(id: string, device: "phone" | "desktop", results: { ok: boolean; note?: string }[]): Promise<{ counted: boolean; version: string; problems: number }> {
  const svc = await serviceOf(id);
  let out: { counted: boolean; version: string; problems: number };
  if (gate.isPreview()) {
    await new Promise((r) => setTimeout(r, 350));
    const m = await my();
    out = { counted: m.tested[id] !== svc?.version, version: svc?.version || "1.0", problems: results.filter((r) => !r.ok).length };
  } else {
    const { call } = await import("../../lib/call");
    out = await call("serviceTest", { serviceId: id, device, results });
  }
  (await my()).tested[id] = out.version;
  document.dispatchEvent(new CustomEvent("sv:tested", { detail: { id, ...out } }));
  return out;
}

/**
 * Badges land a moment after a save: the rating and test triggers pay them and list them in my/{uid}.badges (lib/services/hooks.js).
 * After a save, listen to my/{uid} for up to 30 seconds and hand back the badge ids that weren't there before (once; then the listener closes).
 * The preview pays First Verdict and Full Coverage locally.
 */
export async function watchBadges(before: Record<string, boolean>, onNew: (ids: string[]) => void) {
  const s = getAuthState();
  if (gate.isPreview(s)) {
    const m = await my(), all = await services(), who = whoOf(s);
    const core = all.filter((x) => isCore(x) && rateable(x, who));
    const ids = [Object.keys(m.rated).length >= 1 ? "services-first-rating" : "", core.length && core.every((x) => m.rated[x.id]) ? "services-full-coverage" : ""].filter((id) => id && !before[id]);
    ids.forEach((id) => { m.badges[id] = true; });
    if (ids.length) setTimeout(() => onNew(ids), 600);
    return;
  }
  if (!s.user) return;
  const [fs, fb] = await Promise.all([import("firebase/firestore"), import("../../lib/firebase")]);
  let done = false;
  const stop = () => { if (!done) { done = true; unsub(); clearTimeout(timer); } };
  const unsub = fs.onSnapshot(fs.doc(fs.getFirestore(fb.app), "sites", fb.SITE_ID, "services", "main", "my", s.user.uid), (snap) => {
    const d = snap.exists() ? (snap.data() as any) : null;
    if (!d) return;
    const m = myOf(d);
    // keep the page's cached copy current (counts and the server's own view of what's rated)
    void my().then((c) => { Object.assign(c.rated, m.rated); c.tested = { ...c.tested, ...m.tested }; c.coreRated = m.coreRated; c.coreTotal = m.coreTotal; c.badges = m.badges; document.dispatchEvent(new CustomEvent("sv:my")); });
    const fresh = Object.keys(m.badges).filter((id) => !before[id]);
    if (fresh.length) { stop(); onNew(fresh); }
  }, () => stop());
  const timer = window.setTimeout(stop, 30000);
}
