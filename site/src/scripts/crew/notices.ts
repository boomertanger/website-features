// /crew/hq: the notices strip at the top (Mod Machina phase 3 part 7). crew/main/notices/{id} for this member, newest first: unread ones carry a purple dot and
// Dismiss (crewNoticeRead marks it read: the dot goes and the row dims), at most 5 with "Show all". No notices: nothing renders. Built from the kit's .bt-notice.
// Preview (?as=member): sample notices from preview-crew-hq.json, Dismiss changes the local copy.
import { db, collection, getDocs, query, where, orderBy, limit, SITE_ID } from "../../lib/db";
import { act, esc, ago, previewData, type Ctx } from "./data";
import { toast } from "../../../../shared/ui/toast.js";
import { messageFor } from "../../lib/errors";

export interface Notice { id: string; kind: string; title: string; text: string; link: string | null; createdAt: number; readAt: number | null }
const SHOW = 5;
const ms = (v: any): number | null => (v == null ? null : typeof v === "number" ? v : typeof v.toMillis === "function" ? v.toMillis() : null);

export async function loadNotices(ctx: Ctx): Promise<Notice[]> {
  if (ctx.preview) {
    const now = Date.now();
    return ((previewData().notices || []) as any[]).map((n, i) => ({ ...n, createdAt: now - (n.agoMin ?? i * 60) * 60000, readAt: n.read ? now - 3600000 : null }));
  }
  try {
    const snap = await getDocs(query(collection(db, `sites/${SITE_ID}/crew/main/notices`), where("uid", "==", ctx.uid), orderBy("createdAt", "desc"), limit(20)));
    return snap.docs.map((d) => { const x = d.data(); return { id: d.id, kind: String(x.kind || ""), title: String(x.title || ""), text: String(x.text || ""), link: typeof x.link === "string" ? x.link : null, createdAt: ms(x.createdAt) || 0, readAt: ms(x.readAt) }; });
  } catch { return []; }   // not readable yet (rules or index not deployed): no strip
}

function rowHtml(n: Notice): string {
  const unread = n.readAt == null;
  return `<li class="bt-notice hq-notice${unread ? " is-unread" : ""}" data-notice="${esc(n.id)}">`
    + `<span class="hq-notice-dot" aria-hidden="true"></span>`
    + `<span class="hq-notice-txt"><b>${esc(n.title)}</b>${n.text ? `<span>${esc(n.text)}</span>` : ""}<small class="bt-meta">${esc(ago(n.createdAt))}${unread ? " · new" : ""}</small></span>`
    + `<span class="hq-notice-acts">${n.link ? `<a class="bt-btn bt-btn--ghost bt-btn--sm" href="${esc(n.link)}">Open</a>` : ""}${unread ? `<button type="button" class="bt-btn bt-btn--secondary bt-btn--sm" data-notice-read="${esc(n.id)}">Dismiss</button>` : ""}</span></li>`;
}

export function noticesHtml(list: Notice[], all = false): string {
  if (!list.length) return "";
  const unread = list.filter((n) => n.readAt == null).length;
  const shown = all ? list : list.slice(0, SHOW);
  return `<section class="hq-notices" aria-label="Notices"><div class="hq-notices-h"><span class="bt-label">Notices${unread ? ` · ${unread} new` : ""}</span>`
    + `${list.length > SHOW ? `<button type="button" class="bt-btn bt-btn--ghost bt-btn--sm" data-notices-all>${all ? "Show fewer" : `Show all ${list.length}`}</button>` : ""}</div>`
    + `<ul class="hq-notices-list">${shown.map(rowHtml).join("")}</ul></section>`;
}

/** Fills `box` and wires Dismiss and Show all. */
export async function mountNotices(box: HTMLElement, ctx: Ctx) {
  let list = await loadNotices(ctx), all = false;
  const paint = () => { box.innerHTML = noticesHtml(list, all); };
  paint();
  box.addEventListener("click", async (e) => {
    const t = e.target as HTMLElement;
    if (t.closest("[data-notices-all]")) { all = !all; paint(); return; }
    const b = t.closest<HTMLButtonElement>("[data-notice-read]");
    if (!b) return;
    const id = b.dataset.noticeRead!;
    b.disabled = true;
    try {
      await act(ctx, "crewNoticeRead", { noticeId: id }, () => { const n = (previewData().notices || []).find((x: any) => x.id === id); if (n) n.read = true; });
      list = list.map((n) => (n.id === id ? { ...n, readAt: Date.now() } : n));
      paint();
    } catch (err) { b.disabled = false; toast(messageFor(err, "Couldn't dismiss that. Try again."), { kind: "error" }); }
  });
}
