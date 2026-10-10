// The board's state and every action (docs/specs/bug-zapper.md §4, §7). Real viewers read Firestore and call the callables; with the non-production ?as= preview
// (signed out) the page reads site/src/data/preview-bugs.json and the actions change a local copy, so layouts can be checked without an account. Display only: the
// server checks every action.
import { call } from "../../lib/call";
import { getAuthState } from "../../lib/auth";
import { loadReports, loadReport, loadThread, loadInfo, loadMyMeToos, loadAdminLog, loadZapped, STATUS_KEYS, isFrozen, CLOSED_ALL, type Report, type Reply, type Info, type LogEntry, type Status, type Severity, type Priority } from "./data";
import { isPreview, isStaff, preview, meOf } from "./gate";

export const S = { reports: [] as Report[], bit: new Set<string>(), loaded: false, error: false, zapped: null as number | null };

let sample: any = null;
const demo = () => (sample ??= JSON.parse(JSON.stringify(preview())));
const wait = (ms = 220) => new Promise((r) => setTimeout(r, ms));

export async function loadBoard() {
  const s = getAuthState();
  S.error = false;
  try {
    if (isPreview(s)) {
      S.reports = demo().reports as Report[];
      S.bit = new Set<string>(demo().me.bitOn as string[]);
      S.zapped = demo().zapped as number;
    } else {
      const uid = s.user && s.status !== "needsSignup" ? s.user.uid : null;
      S.reports = await loadReports(isStaff(s), uid);
      S.bit = new Set(uid ? await loadMyMeToos(uid) : []);
      S.zapped = await loadZapped();
    }
    S.loaded = true;
  } catch (err) {
    console.error("bugs: the reports didn't load", err);
    S.error = true;
  }
}
export const byId = (id: string) => S.reports.find((r) => r.id === id) || null;
const upsert = (r: Report) => { const k = S.reports.findIndex((x) => x.id === r.id); if (k >= 0) S.reports[k] = r; else S.reports.unshift(r); };

/** The latest copy of one report (a deep link may name one that isn't in the list yet). */
export async function freshReport(id: string): Promise<Report | null> {
  if (isPreview()) return byId(id);
  const r = await loadReport(id);
  if (r) upsert(r); else S.reports = S.reports.filter((x) => x.id !== id);
  return r;
}
export async function threadOf(id: string): Promise<Reply[]> {
  if (isPreview()) return ((demo().thread[id] || []) as Reply[]).filter((c) => !c.hidden || isStaff());
  return loadThread(id, isStaff());
}
export async function infoOf(id: string): Promise<Info> {
  if (isPreview()) return (demo().info[id] || { device: null, shot: null }) as Info;
  return loadInfo(id);
}
export async function logOf(id: string): Promise<LogEntry[]> {
  if (isPreview()) return (demo().log[id] || []) as LogEntry[];
  return loadAdminLog(id);
}

/** A 10-minute link to the screenshot (reporter and staff). In preview a drawn placeholder stands in. */
export async function shotLink(id: string): Promise<string> {
  if (isPreview()) return PREVIEW_SHOT;
  return (await call<{ url: string }>("bugShotUrl", { id })).url;
}
const PREVIEW_SHOT = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 540"><rect width="960" height="540" fill="#0f0f0f"/><rect width="960" height="58" fill="#1a1619"/><rect x="120" y="96" width="720" height="380" rx="16" fill="#1e1a1d" stroke="#2a2326"/><circle cx="330" cy="260" r="46" fill="#ff1f2d" opacity=".85"/><circle cx="560" cy="330" r="34" fill="#ff1f2d" opacity=".6"/><text x="480" y="170" text-anchor="middle" font-family="Arial" font-weight="800" font-size="30" fill="#ffa100">PAUSED</text><text x="760" y="140" text-anchor="end" font-family="Arial" font-weight="800" font-size="44" fill="#f2ebe6">00:47</text></svg>`);

/** "Bit me too" on or off. Resolves the new state; throws the callable's error (the caller shows it). */
export async function meToo(id: string): Promise<{ on: boolean; count: number }> {
  const r = byId(id);
  if (!r || isFrozen(r.status) || r.private || r.hidden) return { on: S.bit.has(id), count: r?.meTooCount || 0 };
  const on = !S.bit.has(id);
  if (isPreview()) {
    await wait(120);
    if (on) { S.bit.add(id); r.meTooCount++; } else { S.bit.delete(id); r.meTooCount = Math.max(0, r.meTooCount - 1); }
    return { on, count: r.meTooCount };
  }
  const res = await call<{ on: boolean; meTooCount: number }>("bugMeToo", { id, on });
  if (res.on) S.bit.add(id); else S.bit.delete(id);
  r.meTooCount = res.meTooCount;
  return { on: res.on, count: res.meTooCount };
}

const token = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`);
export const newToken = token;

export interface NewReport { title: string; page: string; whatHappened: string; expected: string; steps: string; severity: Severity; private: boolean; device: { browser: string; os: string; viewport: string } | null; token: string; /** "Which part of the site?" (left out: the server goes by the page) */ serviceId?: string }

/** Uploads to Cloudinary with the signed fields the server made (the Vault's way: a plain multipart POST). */
async function uploadShot(upload: { uploadUrl: string; fields: Record<string, string | number> }, file: Blob) {
  const form = new FormData();
  Object.entries(upload.fields).forEach(([k, v]) => form.append(k, String(v)));
  form.append("file", file);
  const res = await fetch(upload.uploadUrl, { method: "POST", body: form });
  if (!res.ok) throw new Error(`The upload failed (${res.status}).`);
}

/** A screenshot over 3840 px on a side is scaled down in the browser first (the server checks format and size). */
export async function prepareShot(file: File): Promise<Blob> {
  const MAX = 3840;
  if (!/^image\/(png|jpeg|webp)$/.test(file.type)) throw new Error("Use a JPG, PNG or WebP file.");
  try {
    const bmp = await createImageBitmap(file);
    const long = Math.max(bmp.width, bmp.height);
    if (long <= MAX) { bmp.close?.(); return file; }
    const k = MAX / long, c = document.createElement("canvas");
    c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
    bmp.close?.();
    return await new Promise<Blob>((ok, no) => c.toBlob((b) => (b ? ok(b) : no(new Error("Couldn't scale the screenshot."))), file.type, 0.92));
  } catch (err) { if ((err as Error).message?.startsWith("Use a")) throw err; return file; }
}

/** Sends a report. The screenshot (if any) goes up after: a failed upload never loses the report (shot: "failed"). */
export async function submit(input: NewReport, file: Blob | null): Promise<{ id: string; counted: boolean; shot: "none" | "ok" | "failed" | "paused" }> {
  const s = getAuthState();
  if (isPreview(s)) {
    await wait();
    const me = meOf(s), now = Date.now(), id = `n${now}`;
    upsert({ id, title: input.title, page: input.page, whatHappened: input.whatHappened, expected: input.expected, steps: input.steps, severity: input.severity, serviceId: input.serviceId || null, status: "open", priority: null, duplicateOf: null, private: input.private, hidden: false, closed: false,
      by: { uid: me.uid, handle: me.handle, name: me.name }, meTooCount: 0, threadCount: 0, shotRef: null, statusHistory: [{ status: "open", changedBy: { uid: me.uid, handle: me.handle }, changedAt: now }], statusChangedAt: now, confirmedAt: 0, fixedAt: 0, closedAt: 0, editedAt: 0, editCount: 0, createdAt: now, updatedAt: now });
    demo().info[id] = { device: input.device, shot: file ? { publicId: `bug-zapper/${id}/shot`, format: "png", bytes: 1, width: null, height: null } : null };
    if (file) byId(id)!.shotRef = `bug-zapper/${id}/shot`;
    return { id, counted: true, shot: file ? "ok" : "none" };
  }
  const res = await call<{ id: string; counted: boolean; uploadsPaused?: boolean; upload?: { uploadUrl: string; fields: Record<string, string | number> } }>("bugSubmit", { ...input, wantsShot: !!file });
  let shot: "none" | "ok" | "failed" | "paused" = res.uploadsPaused ? "paused" : "none";   // paused: the report is saved, the screenshot just isn't offered (Cloud Stash's upload gate)
  if (file && res.upload) {
    try { await uploadShot(res.upload, file); await call("bugAttachShot", { id: res.id, publicId: `bug-zapper/${res.id}/shot` }); shot = "ok"; }
    catch (err) { console.warn("bugs: the screenshot didn't attach", err); shot = "failed"; }
  }
  await freshReport(res.id);
  return { id: res.id, counted: !!res.counted, shot };
}

/** Adds the screenshot to a report that has none (the reporter until it closes, staff any time). */
export async function addShot(id: string, file: Blob) {
  if (isPreview()) { await wait(); const r = byId(id); if (r) r.shotRef = `bug-zapper/${id}/shot`; (demo().info[id] ||= { device: null, shot: null }).shot = { publicId: `bug-zapper/${id}/shot`, format: "png", bytes: 1, width: null, height: null }; return; }
  const params = await call<{ uploadUrl: string; fields: Record<string, string | number> }>("bugShotParams", { id });
  await uploadShot(params, file);
  await call("bugAttachShot", { id, publicId: `bug-zapper/${id}/shot` });
  await freshReport(id);
}

export async function reply(id: string, text: string) {
  if (isPreview()) {
    await wait();
    const me = meOf(), r = byId(id);
    (demo().thread[id] ||= []).push({ id: `c${Date.now()}`, text, by: { uid: me.uid, handle: me.handle, name: me.name }, staffTag: isStaff() ? "admin" : null, hidden: false, createdAt: Date.now() });
    if (r) r.threadCount++;
    return;
  }
  await call("bugReply", { id, text });
}

export interface TriageInput { status: Status; priority: Priority | null; duplicateOf: string | null; note: string }
export async function triage(id: string, input: TriageInput) {
  const r = byId(id);
  if (!r) throw new Error("This report is no longer here.");
  if (isPreview()) {
    await wait();
    const me = meOf(), now = Date.now(), changed = input.status !== r.status;
    if (changed) r.statusHistory.push({ status: input.status, changedBy: { uid: me.uid, handle: me.handle }, changedAt: now, ...(input.note ? { note: input.note } : {}) });
    else if (input.note) r.statusHistory.push({ kind: "note", note: input.note, changedBy: { uid: me.uid, handle: me.handle }, changedAt: now });
    const firstConfirm = changed && ["confirmed", "in_progress", "fixed"].includes(input.status) && !r.confirmedAt;
    r.status = input.status; r.priority = input.priority; r.duplicateOf = input.status === "duplicate" ? input.duplicateOf : null; r.closed = CLOSED_ALL.includes(input.status);
    if (changed) { r.statusChangedAt = now; if (r.closed) r.closedAt = now; if (firstConfirm) r.confirmedAt = now; if (input.status === "fixed" && !r.fixedAt) r.fixedAt = now; }
    return { statusChanged: changed, rewards: { gears: false, badge: firstConfirm } };
  }
  const res = await call<{ statusChanged: boolean; rewards: { gears: boolean; badge: boolean } }>("bugTriage", { id, status: input.status, priority: input.priority, duplicateOf: input.duplicateOf || undefined, note: input.note || undefined, before: { status: r.status, priority: r.priority } });
  await freshReport(id);
  return res;
}

/** Hide or unhide a report (no replyId) or one thread reply. A reason is needed to hide. */
export async function hide(id: string, hidden: boolean, reason: string, replyId?: string) {
  if (isPreview()) {
    await wait();
    const me = meOf();
    const t: any = replyId ? ((demo().thread[id] || []) as Reply[]).find((c) => c.id === replyId) : byId(id);
    if (!t) return;
    const was = t.hidden === true;
    t.hidden = hidden;
    if (hidden) { t.hiddenBy = { uid: me.uid, handle: me.handle }; t.hiddenReason = reason; } else { delete t.hiddenBy; delete t.hiddenReason; }
    const r = byId(id);
    if (replyId && r && was !== hidden) r.threadCount += hidden ? -1 : 1;
    return;
  }
  await call("bugHide", { id, replyId, hidden, reason: hidden ? reason : undefined });
  await freshReport(id);
}

export async function edit(id: string, changes: Record<string, string>, before: Record<string, string>, reason: string, removeShot = false) {
  if (isPreview()) {
    await wait();
    const r: any = byId(id);
    if (r) { Object.assign(r, changes); if (Object.keys(changes).length) { r.editedAt = Date.now(); r.editCount = (r.editCount || 0) + 1; } if (removeShot) r.shotRef = null; }
    if (removeShot && demo().info[id]) demo().info[id].shot = null;
    return;
  }
  await call("adminEditItem", { feature: "bugReport", id, changes, before, removeShot: removeShot || undefined, reason: reason || undefined });
  await freshReport(id);
}

export async function remove(id: string) {
  if (isPreview()) { await wait(); S.reports = S.reports.filter((x) => x.id !== id); return; }
  await call("bugDelete", { id });
  S.reports = S.reports.filter((x) => x.id !== id);
}

export const counts = (visible: (r: Report) => boolean) => {
  const c: Record<string, number> = { all: 0, closed: 0 };
  STATUS_KEYS.forEach((k) => (c[k] = 0));
  S.reports.filter(visible).forEach((r) => { c[r.status]++; c.all++; if (["wont_fix", "cant_reproduce", "duplicate"].includes(r.status)) c.closed++; });
  return c;
};
