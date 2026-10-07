// One door for the staff pages' data: the real reads and callables, or (non-production, signed out, ?as=admin / ?as=member) the local
// preview copy in plan-preview.ts. Pages never touch Firestore or call() directly, so a preview can never reach real data.
import { toast } from "../../../../shared/ui/toast.js";
import { coverHtml } from "../../../../shared/ui/cover.js";
import type { AuthState } from "../../lib/auth";
import { previewAs } from "./layout";
import {
  loadWeeks, loadStreams, loadSignups, loadSettings, loadPatterns, loadExceptions, loadTodos, isOwner, crewMe, planCall,
  type WeekDoc, type Stream, type Signup, type Settings, type Pattern, type Exception, type Todo, type Me,
} from "./plan-data";
import { loadVault, type VCard } from "../vault/data";

export interface Who { preview: boolean; uid: string; handle: string; owner: boolean; admin: boolean; a2: boolean; grade: number; track: "mod" | "admin" | null; status: string; activityRules: boolean }
export interface Io {
  preview: boolean;
  weeks(): Promise<WeekDoc[]>;
  streams(week: string): Promise<Stream[]>;
  signups(streamId: string): Promise<Signup[]>;
  settings(): Promise<Settings>;
  usual(): Promise<{ settings: Settings; patterns: Pattern[]; exceptions: Exception[] }>;
  todos(): Promise<Todo[]>;
  vault(): Promise<VCard[]>;
  /** A write. In preview it runs on the local copy and says so. */
  call<T = any>(name: string, data?: unknown): Promise<T>;
}
export type VGame = VCard;

const real: Io = {
  preview: false,
  weeks: loadWeeks, streams: loadStreams, signups: loadSignups, settings: loadSettings, todos: loadTodos,
  usual: async () => { const [settings, patterns, exceptions] = await Promise.all([loadSettings(), loadPatterns(), loadExceptions()]); return { settings, patterns, exceptions }; },
  vault: async () => (await loadVault()).games,
  call: planCall,
};

async function makePreview(): Promise<Io> {
  const m = await import("./plan-preview");
  const st = () => m.pv();
  return {
    preview: true,
    weeks: async () => st().weeks.slice().sort((a, b) => b.id.localeCompare(a.id)),
    streams: async (w) => (st().streams[w] || []).slice().sort((a, b) => a.start - b.start),
    signups: async (id) => st().signups[id] || [],
    settings: async () => st().settings,
    usual: async () => ({ settings: st().settings, patterns: st().patterns, exceptions: st().exceptions }),
    todos: async () => st().todos,
    vault: async () => m.previewVault() as unknown as VCard[],
    call: async (name, data: any) => { const r = await m.previewCall(name, data); if (name !== "planTray" && data?.check !== true) toast("Preview: nothing saved", { kind: "info" }); return r; },
  };
}

export async function makeIo(): Promise<Io> { return previewAs() ? makePreview() : real; }

/** Who is looking (display only; the callables and the rules decide). Preview: ?owner=0 for an admin who isn't the owner, ?grade=1 for an A1 Steward. */
export async function whoAmI(s: AuthState): Promise<Who> {
  const p = previewAs();
  if (p && !s.user) {
    const q = new URLSearchParams(location.search), m = (await import("./plan-preview")).previewMe();
    if (p === "member") return { preview: true, uid: m.uid, handle: m.handle, owner: false, admin: false, a2: false, grade: m.grade, track: "mod", status: m.status, activityRules: m.activityRules };
    const grade = Number(q.get("grade")) || 2, owner = q.get("owner") !== "0";
    return { preview: true, uid: "owner", handle: "boomertanger", owner, admin: true, a2: owner || grade >= 2, grade, track: "admin", status: "active", activityRules: false };
  }
  const uid = s.user?.uid || "";
  const [owner, me] = await Promise.all([isOwner(uid).catch(() => false), crewMe().catch(() => null as Me | null)]);
  const admin = s.isAdmin || s.roles.includes("admin");
  const track = me?.crew?.track ?? (admin ? "admin" : s.roles.includes("mod") ? "mod" : null);
  const grade = me?.crew?.grade ?? (admin ? 3 : 0);
  return { preview: false, uid, handle: (s.profile as any)?.handle || "", owner, admin, a2: owner || (track === "admin" && grade >= 2), grade, track, status: me?.crew?.status ?? (admin ? "active" : ""), activityRules: !!me?.activityRules };
}

// ---- covers: always the Vault's own art, from the one public/vault summary ----
let vaultMap: Map<string, VCard> | null = null;
export async function vaultOf(io: Io): Promise<Map<string, VCard>> {
  if (!vaultMap) { try { vaultMap = new Map((await io.vault()).map((g) => [g.slug, g])); } catch { vaultMap = new Map(); } }
  return vaultMap;
}
export const coverOf = (v: Map<string, VCard>, slug: string, title = "") => coverHtml(v.get(slug)?.cover ?? null, { alt: title || v.get(slug)?.title || "" });
