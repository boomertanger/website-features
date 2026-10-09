// The board's state and every action (docs/specs/feature-lab.md §4, §7). Real viewers read Firestore and call the callables; with
// the non-production ?as= preview (signed out) the page reads site/src/data/preview-lab.json and the actions change a local copy,
// so layouts can be checked without an account. Display only: the server checks every action.
import { call } from "../../lib/call";
import { getAuthState } from "../../lib/auth";
import { loadIdeas, loadIdea, loadComments, loadMyVotes, loadAdminLog, voteLocked, STATUS_KEYS, type Idea, type Comment, type LogEntry, type Status, type Priority, type Area } from "./data";
import { isPreview, isStaff, preview, meOf } from "./gate";

export const S = { ideas: [] as Idea[], voted: new Set<string>(), loaded: false, error: false };

let sample: any = null;
const demo = () => (sample ??= JSON.parse(JSON.stringify(preview())));
const wait = (ms = 220) => new Promise((r) => setTimeout(r, ms));

export async function loadBoard() {
  const s = getAuthState();
  S.error = false;
  try {
    if (isPreview(s)) {
      S.ideas = demo().ideas as Idea[];
      S.voted = new Set<string>(demo().me.voted as string[]);
    } else {
      S.ideas = await loadIdeas(isStaff(s));
      S.voted = new Set(s.user && s.status !== "needsSignup" ? await loadMyVotes(s.user.uid) : []);
    }
    S.loaded = true;
  } catch (err) {
    console.error("lab: the ideas didn't load", err);
    S.error = true;
  }
}
export const byId = (id: string) => S.ideas.find((i) => i.id === id) || null;
const upsert = (i: Idea) => { const k = S.ideas.findIndex((x) => x.id === i.id); if (k >= 0) S.ideas[k] = i; else S.ideas.unshift(i); };

/** The latest copy of one idea (a deep link may name one that isn't in the list yet). */
export async function freshIdea(id: string): Promise<Idea | null> {
  if (isPreview()) return byId(id);
  const i = await loadIdea(id);
  if (i) upsert(i); else S.ideas = S.ideas.filter((x) => x.id !== id);
  return i;
}

export async function commentsOf(id: string): Promise<Comment[]> {
  if (isPreview()) return ((demo().comments[id] || []) as Comment[]).filter((c) => !c.hidden || isStaff());
  return loadComments(id, isStaff());
}
export async function logOf(id: string): Promise<LogEntry[]> {
  if (isPreview()) return (demo().log[id] || []) as LogEntry[];
  return loadAdminLog(id);
}

/** Vote or take the vote back. Resolves the new state; throws the callable's error (the caller shows it). */
export async function vote(id: string): Promise<{ voted: boolean; count: number }> {
  const i = byId(id);
  if (!i || voteLocked(i)) return { voted: S.voted.has(id), count: i?.voteCount || 0 };
  const on = !S.voted.has(id);
  if (isPreview()) {
    await wait(120);
    if (on) { S.voted.add(id); i.voteCount++; } else { S.voted.delete(id); i.voteCount = Math.max(0, i.voteCount - 1); }
    return { voted: on, count: i.voteCount };
  }
  const res = await call<{ voted: boolean; voteCount: number }>("labVote", { id, on });
  if (res.voted) S.voted.add(id); else S.voted.delete(id);
  i.voteCount = res.voteCount;
  return { voted: res.voted, count: res.voteCount };
}

const token = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`);
export const newToken = token;

export async function post(input: { title: string; description: string; area: Area; token: string }): Promise<{ id: string; counted: boolean }> {
  const s = getAuthState();
  if (isPreview(s)) {
    await wait();
    const me = meOf(s), now = Date.now();
    const id = `n${now}`;
    upsert({ id, title: input.title, description: input.description, area: input.area, status: "submitted", priority: null, by: { uid: me.uid, handle: me.handle, name: me.name }, voteCount: 1, commentCount: 0, hidden: false, statusChangedAt: now, shippedAt: 0, createdAt: now, updatedAt: now, editedAt: 0, editCount: 0, statusHistory: [{ status: "submitted", changedBy: { uid: me.uid, handle: me.handle }, changedAt: now }] });
    S.voted.add(id);
    return { id, counted: true };
  }
  const res = await call<{ id: string; counted: boolean }>("labSubmit", input);
  S.voted.add(res.id);
  await freshIdea(res.id);
  return { id: res.id, counted: !!res.counted };
}

export async function comment(id: string, text: string) {
  if (isPreview()) {
    await wait();
    const me = meOf(), i = byId(id);
    const list = (demo().comments[id] ||= []) as Comment[];
    list.push({ id: `c${Date.now()}`, text, by: { uid: me.uid, handle: me.handle, name: me.name }, staffTag: isStaff() ? "admin" : null, hidden: false, createdAt: Date.now() });
    if (i) i.commentCount++;
    return;
  }
  await call("labComment", { id, text });
}

export interface TriageInput { status: Status; priority: Priority | null; note: string }
export async function triage(id: string, input: TriageInput) {
  const i = byId(id);
  if (!i) throw new Error("This idea is no longer here.");
  if (isPreview()) {
    await wait();
    const me = meOf(), now = Date.now();
    const changed = input.status !== i.status;
    if (changed) i.statusHistory.push({ status: input.status, changedBy: { uid: me.uid, handle: me.handle }, changedAt: now, ...(input.note ? { note: input.note } : {}) });
    else if (input.note) i.statusHistory.push({ kind: "note", note: input.note, changedBy: { uid: me.uid, handle: me.handle }, changedAt: now });
    i.status = input.status; i.priority = input.priority;
    if (changed) { i.statusChangedAt = now; if (input.status === "shipped") i.shippedAt = now; }
    return { statusChanged: changed, rewards: { gears: false, architect: changed && input.status === "shipped" } };
  }
  const res = await call<{ statusChanged: boolean; rewards: { gears: boolean; architect: boolean } }>("labTriage", { id, status: input.status, priority: input.priority, note: input.note || undefined, before: { status: i.status, priority: i.priority } });
  await freshIdea(id);
  return res;
}

/** Hide or unhide an idea (no commentId) or one comment. A reason is needed to hide. */
export async function hide(id: string, hidden: boolean, reason: string, commentId?: string) {
  if (isPreview()) {
    await wait();
    const me = meOf();
    const t: any = commentId ? ((demo().comments[id] || []) as Comment[]).find((c) => c.id === commentId) : byId(id);
    if (!t) return;
    const was = t.hidden === true;
    t.hidden = hidden;
    if (hidden) { t.hiddenBy = { uid: me.uid, handle: me.handle }; t.hiddenReason = reason; } else { delete t.hiddenBy; delete t.hiddenReason; }
    const i = byId(id);
    if (commentId && i && was !== hidden) i.commentCount += hidden ? -1 : 1;
    return;
  }
  await call("labHide", { id, commentId, hidden, reason: hidden ? reason : undefined });
  await freshIdea(id);
}

export async function edit(id: string, changes: Record<string, string>, before: Record<string, string>, reason: string) {
  if (isPreview()) {
    await wait();
    const i: any = byId(id);
    if (i) { Object.assign(i, changes); i.editedAt = Date.now(); i.editCount = (i.editCount || 0) + 1; }
    (demo().log[id] ||= []).unshift({ id: `l${Date.now()}`, action: "edit", actorName: meOf().handle, reason, createdAt: Date.now(), changes: Object.fromEntries(Object.keys(changes).map((k) => [k, { before: before[k], after: changes[k] }])) });
    return;
  }
  await call("adminEditItem", { feature: "labIdea", id, changes, before, reason: reason || undefined });
  await freshIdea(id);
}

export async function remove(id: string) {
  if (isPreview()) { await wait(); S.ideas = S.ideas.filter((x) => x.id !== id); return; }
  await call("labDelete", { id });
  S.ideas = S.ideas.filter((x) => x.id !== id);
}

export const counts = () => {
  const c: Record<string, number> = { all: 0 };
  STATUS_KEYS.forEach((k) => (c[k] = 0));
  S.ideas.filter((i) => !i.hidden).forEach((i) => { c[i.status]++; c.all++; });
  return c;
};
