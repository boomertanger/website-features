// The banner slot under the header ([data-live-banner] in BaseLayout): it holds up to two .bt-live-banner strips, the check-in's (site-banner.ts)
// and a live drop's (drop-banner.ts). Each script owns its own strip and never touches the other's; when both show they stack, check-in first.
const host = () => document.querySelector<HTMLElement>("[data-live-banner]");
export type BannerKind = "checkin" | "drop";

/** The strip a script put there before, or null. */
export const bannerOf = (kind: BannerKind) => host()?.querySelector<HTMLElement>(`:scope > [data-banner-for="${kind}"]`) || null;

/** Puts el in the slot as `kind`'s strip (replacing an older one), or removes `kind`'s strip when el is null. */
export function putBanner(kind: BannerKind, el: HTMLElement | null) {
  const h = host();
  if (!h) return;
  const old = bannerOf(kind);
  if (old && old !== el) old.remove();
  if (el) {
    el.dataset.bannerFor = kind;
    if (el.parentElement !== h) { if (kind === "checkin") h.prepend(el); else h.append(el); }
  }
  h.hidden = !h.children.length;
}
