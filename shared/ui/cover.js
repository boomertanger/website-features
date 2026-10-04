// shared/ui/cover.js — cover art for .bt-cover (docs/design-system.md §5 "Covers").
// Covers are never copied to our side unless an admin or mod uploads one: the page builds the
// IGDB or Steam image URL at display time from what the game stores (docs/specs/game-vault.md §6).
//
//   cover = { source: "igdb", igdbImageId } | { source: "steam", steamAppId }
//         | { source: "upload", url } | null   (null: the mascot fallback)
//   coverUrl(cover, { size })   the image URL, or null
//   coverHtml(cover, { cls, alt, over, tilt, size, eager })   a .bt-cover span; `over` is extra
//                               HTML on the art (badges, tape…); tilt adds data-tilt + a glare
//   initCoverFallbacks(root)    an image that fails to load (a Steam app with no portrait art)
//                               falls back to the mascot. Call once per page.
import { escapeHtml } from "./dom.js";

export const IGDB_COVER = (imageId, size = "t_cover_big") => `https://images.igdb.com/igdb/image/upload/${size}/${encodeURIComponent(imageId)}.jpg`;
// The same portrait art the server checks for when a Steam-only game is added (functions/lib/vault/sources.js).
export const STEAM_COVER = (appId) => `https://cdn.cloudflare.steamstatic.com/steam/apps/${encodeURIComponent(appId)}/library_600x900.jpg`;

export function coverUrl(cover, { size } = {}) {
  if (!cover) return null;
  if (cover.source === "igdb" && cover.igdbImageId) return IGDB_COVER(cover.igdbImageId, size === "sm" ? "t_cover_small" : "t_cover_big");
  if (cover.source === "steam" && cover.steamAppId) return STEAM_COVER(cover.steamAppId);
  if (cover.source === "upload" && cover.url) return cover.url;
  return null;
}

/** The mascot for a cover with no art: the page's #bt-mascot-tpl (site) or the kit's own. */
export function mascotFallback() {
  const tpl = typeof document !== "undefined" ? document.getElementById("bt-mascot-tpl") : null;
  return `<span class="bt-cover-fallback" aria-hidden="true">${tpl ? tpl.innerHTML : ""}</span>`;
}

export function coverHtml(cover, { cls = "", alt = "", over = "", tilt = false, size, eager = false } = {}) {
  const url = coverUrl(cover, { size });
  const art = url
    ? `<img src="${escapeHtml(url)}" alt="${escapeHtml(alt)}" ${eager ? "" : 'loading="lazy" '}decoding="async" referrerpolicy="no-referrer">`
    : mascotFallback();
  return `<span class="bt-cover${cls ? ` ${cls}` : ""}"${tilt ? " data-tilt" : ""}>${art}${over}${tilt ? '<span class="bt-glare" aria-hidden="true"></span>' : ""}</span>`;
}

let fallbacksOn = false;
export function initCoverFallbacks(root = document) {
  if (fallbacksOn) return;
  fallbacksOn = true;
  root.addEventListener("error", (e) => {
    const img = e.target;
    if (!(img instanceof HTMLImageElement) || !img.parentElement?.classList.contains("bt-cover")) return;
    img.insertAdjacentHTML("afterend", mascotFallback());
    img.remove();
  }, true);
}
