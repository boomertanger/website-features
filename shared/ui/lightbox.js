// shared/ui/lightbox.js — full-screen image viewer (screenshots, uploads).

const ICON_X = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';
const ICON_ZOOM = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line><line x1="11" y1="8" x2="11" y2="14"></line><line x1="8" y1="11" x2="14" y2="11"></line></svg>';

/**
 * cloudinaryUrl(url, transform)
 * Inserts a Cloudinary transformation after "/upload/". Non-Cloudinary URLs
 * are returned unchanged. e.g. cloudinaryUrl(u, "w_900,c_limit,f_auto,q_auto")
 */
export function cloudinaryUrl(url, transform) {
  if (!url || !transform || !/res\.cloudinary\.com\/.+\/upload\//.test(url)) return url;
  return url.replace("/upload/", `/upload/${transform}/`);
}

/**
 * thumbHtml({ src, full, alt })
 * A clickable preview. src = small version for the dialog; full = the image
 * to show enlarged (defaults to src). Wire clicks with initLightboxTriggers().
 */
export function thumbHtml({ src, full = "", alt = "Screenshot" }) {
  const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
  return `<button type="button" class="bt-thumb" data-bt-lightbox="${esc(full || src)}" data-alt="${esc(alt)}" aria-label="Enlarge ${esc(alt)}">
    <img src="${esc(src)}" alt="${esc(alt)}" loading="lazy">
    <span class="bt-thumb-hint">${ICON_ZOOM}Click to enlarge</span>
  </button>`;
}

/** One delegated listener: any [data-bt-lightbox] inside `scope` opens the viewer. */
export function initLightboxTriggers(scope = document) {
  if (scope.dataset && scope.dataset.btLightbox === "wired") return;
  if (scope.dataset) scope.dataset.btLightbox = "wired";
  scope.addEventListener("click", (e) => {
    const t = e.target.closest("[data-bt-lightbox]");
    if (!t || t === scope) return;
    e.preventDefault();
    openLightbox({ src: t.dataset.btLightbox, alt: t.dataset.alt || "" });
  });
}

/**
 * openLightbox({ src, alt })
 * Fills the screen (above the site header on purpose). Image fits the
 * screen; click it to view at actual size and scroll around. Escape, the
 * close button, or a click on the dark area closes it.
 */
export function openLightbox({ src, alt = "" }) {
  const opener = document.activeElement;
  const portal = document.createElement("div");
  portal.className = "bt-root bt-portal";
  portal.innerHTML = `
    <div class="bt-lightbox" role="dialog" aria-modal="true" aria-label="${alt ? alt.replace(/"/g, "&quot;") : "Image"}">
      <div class="bt-lightbox-bar">
        <a class="bt-lightbox-link" href="${src.replace(/"/g, "&quot;")}" target="_blank" rel="noopener">Open original</a>
        <button type="button" class="bt-lightbox-close" aria-label="Close">${ICON_X}</button>
      </div>
      <div class="bt-lightbox-stage"><img class="bt-lightbox-img" src="${src.replace(/"/g, "&quot;")}" alt="${alt.replace(/"/g, "&quot;")}"></div>
      <p class="bt-lightbox-tip">Click the image to see it at full size</p>
    </div>`;
  document.body.appendChild(portal);
  const box = portal.querySelector(".bt-lightbox");
  const stage = portal.querySelector(".bt-lightbox-stage");
  const img = portal.querySelector(".bt-lightbox-img");
  const closeBtn = portal.querySelector(".bt-lightbox-close");
  const prevOverflow = document.documentElement.style.overflow;
  document.documentElement.style.overflow = "hidden";

  function close() {
    document.removeEventListener("keydown", onKey, true);
    portal.remove();
    document.documentElement.style.overflow = prevOverflow;
    if (opener && document.contains(opener)) opener.focus();
  }
  function onKey(e) {
    if (e.key === "Escape") { e.stopPropagation(); e.preventDefault(); close(); }
    if (e.key === "Tab") { e.preventDefault(); (document.activeElement === closeBtn ? portal.querySelector(".bt-lightbox-link") : closeBtn).focus(); }
  }
  // Capture phase so Escape closes the lightbox, not the dialog underneath.
  document.addEventListener("keydown", onKey, true);
  closeBtn.addEventListener("click", close);
  stage.addEventListener("click", (e) => {
    if (e.target === img) {
      const zoomed = box.classList.toggle("is-zoomed");
      portal.querySelector(".bt-lightbox-tip").textContent = zoomed ? "Click the image to fit it to the screen" : "Click the image to see it at full size";
    } else if (e.target === stage) close();
  });
  requestAnimationFrame(() => closeBtn.focus());
  return { close };
}
