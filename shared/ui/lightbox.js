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
        <a class="bt-lightbox-link bt-link" href="${src.replace(/"/g, "&quot;")}" target="_blank" rel="noopener">Open original</a>
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

const ICON_PREV = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>';
const ICON_NEXT = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>';
const attr = (v) => String(v ?? "").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

/**
 * openGallery({ items, index = 0, label = "Gallery" })
 * Full screen like openLightbox, for a set: Previous / Next buttons and the arrow keys move through the items (wrapping), the caption
 * and "3 of 10" sit under the media, Tab stays inside, Escape / the close button / a click on the dark area closes it, and focus goes
 * back to what opened it. Returns { close, show(i) }.
 */
export function openGallery({ items = [], index = 0, label = "Gallery" } = {}) {
  if (!items.length) return { close() {}, show() {} };
  announceOverlay("lightbox");
  const opener = document.activeElement;
  const reduce = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const many = items.length > 1;
  const portal = document.createElement("div");
  portal.className = "bt-root bt-portal";
  portal.innerHTML = `
    <div class="bt-lightbox bt-gallery" role="dialog" aria-modal="true" aria-label="${attr(label)}">
      <div class="bt-lightbox-bar"><span class="bt-gallery-count" aria-live="polite"></span><button type="button" class="bt-lightbox-close" aria-label="Close">${ICON_X}</button></div>
      <div class="bt-lightbox-stage bt-gallery-stage"></div>
      <div class="bt-gallery-foot">
        ${many ? `<button type="button" class="bt-gallery-nav" data-dir="-1" aria-label="Previous">${ICON_PREV}</button>` : ""}
        <p class="bt-gallery-cap"></p>
        ${many ? `<button type="button" class="bt-gallery-nav" data-dir="1" aria-label="Next">${ICON_NEXT}</button>` : ""}
      </div>
    </div>`;
  document.body.appendChild(portal);
  const stage = portal.querySelector(".bt-gallery-stage");
  const cap = portal.querySelector(".bt-gallery-cap");
  const count = portal.querySelector(".bt-gallery-count");
  const prevOverflow = document.documentElement.style.overflow;
  document.documentElement.style.overflow = "hidden";
  let at = 0;

  function show(i) {
    at = ((i % items.length) + items.length) % items.length;
    const it = items[at];
    stage.innerHTML = it.type === "video"
      ? `<video class="bt-gallery-media" src="${attr(it.src)}"${it.poster ? ` poster="${attr(it.poster)}"` : ""} muted loop playsinline controls${reduce ? "" : " autoplay"} aria-label="${attr(it.alt || it.caption)}"></video>`
      : `<img class="bt-gallery-media" src="${attr(it.src)}" alt="${attr(it.alt || it.caption)}">`;
    cap.textContent = it.caption || "";
    count.textContent = many ? `${at + 1} of ${items.length}` : "";
  }
  function focusables() { return [...portal.querySelectorAll("button, video[controls]")].filter((el) => !el.disabled); }
  function close() {
    document.removeEventListener("keydown", onKey, true);
    document.removeEventListener(OVERLAY_EVENT, onOverlay);
    portal.remove();
    document.documentElement.style.overflow = prevOverflow;
    if (opener && document.contains(opener)) opener.focus();
  }
  function onOverlay(e) { if (e.detail?.source !== "lightbox") close(); }
  function onKey(e) {
    if (e.key === "Escape") { e.stopPropagation(); e.preventDefault(); close(); }
    else if (many && e.key === "ArrowLeft") { e.preventDefault(); show(at - 1); }
    else if (many && e.key === "ArrowRight") { e.preventDefault(); show(at + 1); }
    else if (e.key === "Tab") {
      const f = focusables(), i = f.indexOf(document.activeElement);
      e.preventDefault();
      f[(i + (e.shiftKey ? -1 : 1) + f.length) % f.length]?.focus();
    }
  }
  document.addEventListener("keydown", onKey, true);
  document.addEventListener(OVERLAY_EVENT, onOverlay);
  portal.querySelector(".bt-lightbox-close").addEventListener("click", close);
  portal.querySelectorAll(".bt-gallery-nav").forEach((b) => b.addEventListener("click", () => show(at + Number(b.dataset.dir))));
  stage.addEventListener("click", (e) => { if (e.target === stage) close(); });
  show(index);
  requestAnimationFrame(() => portal.querySelector(".bt-lightbox-close").focus());
  return { close, show };
}
