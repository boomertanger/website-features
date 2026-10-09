// One door for the Control Room's data: the real reads and callables, or (non-production, signed out, ?as=admin or ?as=a2) the local copy in
// preview.ts. Pages never touch Firestore or call() directly, so a preview can never reach real data.
// Reads (docs/specs/control-room.md §13, firestore.rules): public/live, the stream docs, streams/{id}/private/control, live/main. The owner's
// checklist (streams/{id}/private/checklist) and the templates (live/main/private/checklistTemplates) are read ONLY when role is "owner".
import type { AuthState } from "../../lib/auth";
import { call } from "../../lib/call";
import { db, doc, getDoc, getDocs, collection, query, where, SITE_ID } from "../../lib/db";
import { crewMe } from "../crew/api";
import { loadVault, type VCard } from "../vault/data";
import { ms } from "../planner/plan-data";
import { livePreview } from "./layout";
import { controlFrom, streamFrom, BEATS, type Role, type Snapshot, type Main, type CBeats, type PubLive, type LStream } from "./model";

const base = `sites/${SITE_ID}`;
export interface Templates { beats: CBeats }

export interface Api {
  preview: boolean;
  /** One poll. `streams`: also read the list of today's streams (the idle state); the live stream is always read by id. */
  read(opts: { role: Role; streams: boolean }): Promise<Snapshot>;
  main(): Promise<Main | null>;
  /** OWNER ONLY (the caller checks the role; the rules check again). */
  templates(): Promise<Templates | null>;
  vault(): Promise<VCard[]>;
  call<T = any>(name: string, data?: unknown): Promise<T>;
}

/** Owner = sites/{id}.ownerUid (readable once signed in); A2+ = the admin track at grade 2 or more (crewMe). The server is the real check. */
export async function detectRole(s: AuthState): Promise<Role | null> {
  const p = livePreview();
  if (p && !s.user) return p;
  const uid = s.user?.uid;
  if (!uid) return null;
  try { if ((await getDoc(doc(db, "sites", SITE_ID))).get("ownerUid") === uid) return "owner"; } catch { /* not the owner as far as we can tell */ }
  try {
    const me = await crewMe();
    if (me?.crew?.track === "admin" && me.crew.grade >= 2) return "a2";
  } catch { /* no crew record */ }
  return null;
}

const mainFrom = (d: any): Main => ({
  look: d?.look === "crt" ? "crt" : "hull",
  windowLengthChoices: Array.isArray(d?.windowLengthChoices) && d.windowLengthChoices.length ? d.windowLengthChoices : [2, 3, 5, 10],
  windowDefaultMinutes: Number.isFinite(d?.windowDefaultMinutes) ? d.windowDefaultMinutes : 5,
  obsKeyAt: ms(d?.obsKeyAt), deckKeyAt: ms(d?.deckKeyAt),
  obsKeySet: !!d?.obsKeyHash, deckKeySet: !!d?.deckKeyHash,
});

const real: Api = {
  preview: false,
  async read({ role, streams }) {
    const pubSnap = await getDoc(doc(db, `${base}/public/live`));
    const pub = (pubSnap.exists() ? pubSnap.data() : null) as PubLive | null;
    let live: LStream | null = null, list: LStream[] = [];
    if (streams) {
      const snap = await getDocs(query(collection(db, `${base}/streams`), where("state", "in", ["scheduled", "live"])));
      list = snap.docs.map((d: any) => streamFrom(d.id, d.data()));
      live = list.find((s) => s.state === "live") || null;
      list = list.filter((s) => s.state === "scheduled");
    }
    const liveId = pub && (pub.state === "live" || pub.state === "backstage") ? pub.streamId : live?.id;
    let control = null, checklist: CBeats | null = null;
    if (liveId) {
      const [s, c] = await Promise.all([live && live.id === liveId ? Promise.resolve(null) : getDoc(doc(db, `${base}/streams/${liveId}`)), getDoc(doc(db, `${base}/streams/${liveId}/private/control`))]);
      if (s?.exists()) live = streamFrom(liveId, s.data());
      control = c.exists() ? controlFrom(c.data()) : null;
      if (role === "owner") {
        const cl = await getDoc(doc(db, `${base}/streams/${liveId}/private/checklist`));
        if (cl.exists()) checklist = (cl.data().beats || null) as CBeats | null;
      }
    }
    return { pub, streams: list, live, control, main: null, checklist };
  },
  async main() { const s = await getDoc(doc(db, `${base}/live/main`)); return s.exists() ? mainFrom(s.data()) : mainFrom({}); },
  async templates() {
    const s = await getDoc(doc(db, `${base}/live/main/private/checklistTemplates`));
    const b = s.exists() ? s.data().beats : null;
    const beats = {} as CBeats;
    for (const k of BEATS) beats[k] = (b?.[k] || []) as CBeats[typeof k];
    return { beats };
  },
  vault: async () => (await loadVault()).games,
  call: (name, data) => call(name, data),
};

let cached: Promise<Api> | null = null;
/** Preview only when nobody is signed in (a real session always gets real data) and the URL asks for it (non-production). */
export function makeApi(s: AuthState): Promise<Api> {
  if (!cached) cached = livePreview() && !s.user ? import("./preview").then((m) => m.previewApi()) : Promise.resolve(real);
  return cached;
}
