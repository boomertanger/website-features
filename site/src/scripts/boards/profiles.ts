// The live author chip (docs/specs/bug-zapper.md §2 decision 12, §9: "Handle changed or account deleted: live profile, Former member"). Items and replies
// keep a snapshot of the author, but this chip can show the member's CURRENT handle from sites/{siteId}/profiles/{uid}, read once per member and cached for
// the page. A missing profile (an account that is gone) reads "Former member". Feature Lab keeps showing the snapshot as before (it never calls fillAuthors).
import { db, doc, getDoc, SITE_ID } from "../../lib/db";
import { escapeHtml as esc } from "../../../../shared/ui/dom.js";

export interface Author { uid: string; handle: string; name?: string }
type Live = string | null | undefined;   // handle, null = no profile, undefined = the read failed (keep the snapshot)
const cache = new Map<string, Promise<Live>>();

export function liveHandle(uid: string): Promise<Live> {
  if (!uid) return Promise.resolve(null);
  let p = cache.get(uid);
  if (!p) {
    p = getDoc(doc(db, "sites", SITE_ID, "profiles", uid)).then((s): Live => (s.exists() ? ((s.get("handle") as string) || null) : null)).catch((): Live => undefined);
    cache.set(uid, p);
  }
  return p;
}

/** The chip's markup with a data-author uid, so fillAuthors() can swap in the live handle afterwards. */
export const authorLink = (a: Author) => (a.handle ? `<a href="/u/${encodeURIComponent(a.handle)}" data-author="${esc(a.uid)}" data-noopen>@${esc(a.handle)}</a>` : `<span class="bt-meta" data-author="${esc(a.uid)}">Former member</span>`);

/** Replaces every [data-author] under root with the live handle (the snapshot stays if the read failed). */
export async function fillAuthors(root: ParentNode) {
  const els = [...root.querySelectorAll<HTMLElement>("[data-author]")];
  await Promise.all(els.map(async (el) => {
    const h = await liveHandle(el.dataset.author || "");
    if (h === undefined) return;
    el.outerHTML = h ? `<a href="/u/${encodeURIComponent(h)}" data-noopen>@${esc(h)}</a>` : '<span class="bt-meta">Former member</span>';
  }));
}
