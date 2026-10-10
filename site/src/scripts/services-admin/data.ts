// /admin/services data (docs/specs/service-hub.md §4, §7): the summary doc (sites/boomertanger/services/main/summary/main, one read, admins only by the
// rules), the main doc's stored build hash, the build's /services.json (manifests, hash, unclaimed routes), and the callables (serviceSync, serviceDetail,
// serviceAdmin). The page never writes Firestore. Preview (non-production, signed out, ?as=admin): rows built from /services.json with sample numbers,
// and actions that change a local copy only.
import { isProduction } from "../../lib/env.js";

export type Value = "love" | "like" | "dislike";
export interface Mark { version: string; at: number | null; result: "pass" | "issues"; note?: string; by?: { handle?: string | null } }
export interface Row {
  id: string; name: string; type: string; area: string; blurb: string; version: string; status: "planned" | "building" | "live" | "retired"; audience: string;
  routes: string[]; link: string | null; checks: string[]; hidden: boolean; needsSetup: boolean; testPlan: string | null;
  ratings: { love: number; like: number; dislike: number; n: number; comments: number; score: number | null; lovePct: number; dislikePct: number; dislike7d: number; lastDislikeAt: number | null };
  video: { id: string; title?: string; coversVersion?: string | null } | null; videoState: "none" | "current" | "stale";
  tests: { staging?: Mark | null; production?: Mark | null }; stagingTest: "none" | "current" | "old"; productionTest: "none" | "current" | "old";
  communityTests: { version: string; pass: number; problems: number; devices?: { phone: number; desktop: number } } | null;
  bugs: { open: number }; ideas: { open: number }; coverage: number; createdAt: number | null; source: Record<string, unknown>;
}
export interface Build { hash: string; services: any[]; unclaimed: string[] }
export interface Detail {
  item: Row & Record<string, any>; versionHistory: { version: string; at: number | null }[];
  byVersion: { version: string; love: number; like: number; dislike: number }[];
  comments: { commentId: string; handle: string | null; value: Value; comment: string; version: string | null; at: number | null; hidden: boolean; counted: boolean }[];
}

export const isPreview = (signedIn: boolean) => !isProduction && !signedIn && new URLSearchParams(location.search).get("as") === "admin";
const ms = (v: any): number | null => (v == null ? null : typeof v === "number" ? v : typeof v.toMillis === "function" ? v.toMillis() : null);

export function rowFrom(id: string, d: any): Row {
  const r = d.ratings || {};
  const mark = (m: any): Mark | null => (m && m.version ? { version: m.version, at: ms(m.at), result: m.result, note: m.note || "", by: m.by } : null);
  return {
    id, name: d.name || id, type: d.type || "feature", area: d.area || "Other", blurb: d.blurb || "", version: String(d.version || "1.0"), status: d.status || "live", audience: d.audience || "everyone",
    routes: d.routes || [], link: d.link || (d.routes && d.routes[0]) || null, checks: d.checks || [], hidden: d.hidden === true, needsSetup: d.needsSetup === true, testPlan: d.testPlan || null,
    ratings: { love: r.love || 0, like: r.like || 0, dislike: r.dislike || 0, n: r.n || 0, comments: r.comments || 0, score: r.score ?? null, lovePct: r.lovePct || 0, dislikePct: r.dislikePct || 0, dislike7d: r.dislike7d || 0, lastDislikeAt: ms(r.lastDislikeAt) },
    video: d.video && d.video.id ? { id: d.video.id, title: d.video.title || "", coversVersion: d.video.coversVersion ?? null } : null, videoState: d.videoState || "none",
    tests: { staging: mark(d.tests?.staging), production: mark(d.tests?.production) }, stagingTest: d.stagingTest || "none", productionTest: d.productionTest || "none",
    communityTests: d.communityTests || null, bugs: { open: d.bugs?.open || 0 }, ideas: { open: d.ideas?.open || 0 }, coverage: d.coverage || 0, createdAt: ms(d.createdAt), source: d.source || {},
  };
}

// ---------------------------------------------------------------------------------------------- the build
let buildCache: Promise<Build> | null = null;
export function loadBuild(): Promise<Build> {
  buildCache ||= fetch("/services.json", { cache: "no-store" }).then((r) => (r.ok ? r.json() : { hash: "", services: [], unclaimed: [] })).catch(() => ({ hash: "", services: [], unclaimed: [] }));
  return buildCache;
}

// ---------------------------------------------------------------------------------------------- reads and calls
export interface Api {
  preview: boolean;
  /** Every row and the stored build hash. */
  load(): Promise<{ rows: Row[]; storedHash: string | null; syncedAt: number | null }>;
  sync(build: Build): Promise<{ create: string[]; update: string[]; bump: string[]; retire: string[] }>;
  detail(id: string): Promise<Detail>;
  admin(action: string, data: Record<string, unknown>): Promise<any>;
}

export async function realApi(): Promise<Api> {
  const { db, doc, getDoc, SITE_ID } = await import("../../lib/db");
  const { call } = await import("../../lib/call");
  return {
    preview: false,
    async load() {
      const [sum, main] = await Promise.all([getDoc(doc(db, "sites", SITE_ID, "services", "main", "summary", "main")), getDoc(doc(db, "sites", SITE_ID, "services", "main"))]);
      const rows = Object.entries((sum.exists() ? sum.data().rows : null) || {}).map(([id, d]) => rowFrom(id, d));
      return { rows, storedHash: main.exists() ? main.get("buildHash") || null : null, syncedAt: main.exists() ? ms(main.get("syncedAt")) : null };
    },
    sync: (b) => call("serviceSync", { manifests: b.services, buildHash: b.hash }),
    detail: (id) => call<Detail>("serviceDetail", { serviceId: id }),
    admin: (action, data) => call("serviceAdmin", { action, ...data }),
  };
}

/** The preview: the build's manifests with sample numbers (the same every load), and a local copy the actions change. */
export async function previewApi(): Promise<Api> {
  const b = await loadBuild();
  const seed = (s: string) => { let h = 0; for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return h; };
  const rows: Row[] = b.services.map((m: any) => {
    const h = seed(m.id), live = m.status === "live" && m.type !== "adminTool";
    const love = live ? h % 19 : 0, like = live ? (h >>> 3) % 14 : 0, dislike = live ? (h >>> 6) % 6 : 0, n = love + like + dislike;
    const v = String(m.version);
    const row = rowFrom(m.id, {
      ...m, ratings: { love, like, dislike, n, comments: dislike + (h % 3), score: n ? Math.round(((2 * love + like - 2 * dislike) / n) * 100) / 100 : null, lovePct: n ? Math.round((love / n) * 100) : 0, dislikePct: n ? Math.round((dislike / n) * 100) : 0, dislike7d: (h >>> 9) % 4 === 0 ? dislike : 0, lastDislikeAt: Date.now() - ((h % 5) + 1) * 86400000 },
      video: h % 3 === 0 ? { id: "dQw4w9WgXcQ", title: `${m.name} in 60 seconds`, coversVersion: h % 2 ? v : "0.9" } : null,
      videoState: h % 3 === 0 ? (h % 2 ? "current" : "stale") : "none",
      tests: { staging: h % 4 ? { version: h % 5 ? v : "0.9", at: Date.now() - 4 * 86400000, result: "pass" } : null },
      stagingTest: h % 4 ? (h % 5 ? "current" : "old") : "none", productionTest: "none",
      communityTests: m.checks?.length ? { version: v, pass: h % 4, problems: h % 2 } : null,
      bugs: { open: (h >>> 4) % 4 === 0 ? (h % 3) + 1 : 0 }, ideas: { open: (h >>> 5) % 3 === 0 ? 1 : 0 },
      coverage: (h % 9) * 11, createdAt: Date.now() - ((h % 40) + 2) * 86400000, needsSetup: false, source: { manifest: true },
    });
    return row;
  });
  const byId = new Map(rows.map((r) => [r.id, r]));
  const wait = () => new Promise((r) => setTimeout(r, 300));
  return {
    preview: true,
    async load() { return { rows: [...byId.values()], storedHash: b.hash, syncedAt: Date.now() - 3600000 }; },
    async sync() { await wait(); return { create: [], update: [], bump: [], retire: [] }; },
    async detail(id) {
      await wait();
      const r = byId.get(id)!;
      const words = ["The page is hard to read on my phone.", "Love the new look, keep it up.", "It took a while to load the first time.", "My favorite part of the site."];
      const vals: Value[] = ["dislike", "love", "dislike", "love"];
      return {
        item: { ...r }, versionHistory: [{ version: r.version, at: Date.now() - 5 * 86400000 }, { version: "0.9", at: Date.now() - 30 * 86400000 }],
        byVersion: r.ratings.n ? [{ version: r.version, love: r.ratings.love, like: r.ratings.like, dislike: r.ratings.dislike }, { version: "0.9", love: 3, like: 5, dislike: 1 }] : [],
        comments: r.ratings.n ? words.map((w, i) => ({ commentId: `c${i}`, handle: ["@nightowl", "@gbo", "@ghostlight", "@fan2"][i], value: vals[i], comment: w, version: r.version, at: Date.now() - (i + 1) * 86400000, hidden: false, counted: true })) : [],
      };
    },
    async admin(action, data) {
      await wait();
      const r = byId.get(String(data.serviceId));
      if (r && action === "markTested") { (r.tests as any)[String(data.env)] = { version: r.version, at: Date.now(), result: data.result, note: data.note || "" }; if (data.env === "staging") r.stagingTest = "current"; else r.productionTest = "current"; }
      if (r && action === "linkVideo") { r.video = { id: String(data.videoId), coversVersion: String(data.coversVersion || r.version) }; r.videoState = "current"; }
      if (r && action === "setCoversVersion" && r.video) { r.video.coversVersion = String(data.version); r.videoState = String(data.version) === r.version ? "current" : "stale"; }
      if (r && action === "retire") r.status = "retired";
      if (r && action === "restore") r.status = "live";
      if (r && action === "hide") r.hidden = data.hidden === true;
      return { ok: true, preview: true };
    },
  };
}
