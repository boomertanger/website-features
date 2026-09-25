// shared/ui/modal.js — accessible modal rendered into a portal on <body>.
//
// Why a portal: inside a feature root, a fixed-position modal is trapped by
// the root's overflow:hidden, by Squarespace section stacking contexts (the
// site header can sit on top even at z-index 999999), and by the containing
// block that container-type creates. The portal is its own .bt-root, so all
// shared styles apply, and its own container, so modal breakpoints follow
// the viewport width.
//
// Feature-specific modal CSS must target the portal, not the feature root:
//   .bt-portal[data-feature="bug-zapper"] .bz-dropzone { ... }

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), ' +
  'textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

const stack = [];

// Squarespace 7.1's site header. Its height depends on the logo, the header
// padding setting (vw-based), the announcement bar, and whether scroll-back
// has currently hidden it, so it is measured rather than hardcoded.
const SITE_HEADER_SELECTOR = "#header";
const MAX_OFFSET_RATIO = 0.35; // never push a dialog below 35% of the screen

function placeBackdrop(backdrop) {
  const gap = parseFloat(getComputedStyle(backdrop).getPropertyValue("--bt-modal-gap")) || 24;
  const header = document.querySelector(SITE_HEADER_SELECTOR);
  let headerBottom = 0;
  if (header) {
    const r = header.getBoundingClientRect();
    // Scroll-back slides the header up out of view; only count what's visible.
    if (r.height > 0 && getComputedStyle(header).visibility !== "hidden") headerBottom = Math.max(0, r.bottom);
  }
  const offset = Math.min(headerBottom + gap, window.innerHeight * MAX_OFFSET_RATIO);
  backdrop.style.setProperty("--bt-modal-offset", `${Math.round(Math.max(gap, offset))}px`);
}

function onResize() {
  stack.forEach((entry) => placeBackdrop(entry.backdrop));
}

function onKeydown(e) {
  const top = stack[stack.length - 1];
  if (!top) return;
  if (e.key === "Escape") {
    if (top.dismissible) {
      e.preventDefault();
      top.close();
    }
    return;
  }
  if (e.key === "Tab") {
    const items = [...top.modal.querySelectorAll(FOCUSABLE)].filter(
      (el) => el.offsetParent !== null || el === document.activeElement
    );
    if (!items.length) {
      e.preventDefault();
      top.modal.focus();
      return;
    }
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && (document.activeElement === first || !top.modal.contains(document.activeElement))) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }
}

/**
 * openModal({ content, title, wide, feature, onClose })
 *  content  HTML string or Element placed inside .bt-modal
 *  title    accessible label (used for aria-label when no .bt-modal-title exists)
 *  wide     true for the 680px detail width
 *  feature  sets data-feature on the portal for feature-specific CSS
 *  onClose  called after the modal is removed
 * Returns { modal, close, setDismissible }.
 * Any element with [data-bt-close] inside the modal closes it.
 */
export function openModal({ content = "", title = "Dialog", wide = false, feature = "", onClose } = {}) {
  const opener = document.activeElement;

  const portal = document.createElement("div");
  portal.className = "bt-root bt-portal";
  if (feature) portal.dataset.feature = feature;

  const backdrop = document.createElement("div");
  backdrop.className = "bt-modal-backdrop";

  const modal = document.createElement("div");
  modal.className = "bt-modal" + (wide ? " bt-modal--wide" : "");
  modal.setAttribute("role", "dialog");
  modal.setAttribute("aria-modal", "true");
  modal.tabIndex = -1;
  if (typeof content === "string") modal.innerHTML = content;
  else if (content) modal.appendChild(content);

  const heading = modal.querySelector(".bt-modal-title");
  if (heading) {
    heading.id = heading.id || "bt-modal-title-" + Math.random().toString(36).slice(2, 8);
    modal.setAttribute("aria-labelledby", heading.id);
  } else {
    modal.setAttribute("aria-label", title);
  }

  backdrop.appendChild(modal);
  portal.appendChild(backdrop);
  document.body.appendChild(portal);

  const prevOverflow = document.documentElement.style.overflow;
  placeBackdrop(backdrop);
  // Scroll-back slides the header in and out over ~0.3s. If the dialog opened
  // mid-slide, measure once more after it settles.
  setTimeout(() => { if (backdrop.isConnected) placeBackdrop(backdrop); }, 400);
  if (stack.length === 0) {
    document.documentElement.style.overflow = "hidden";
    document.addEventListener("keydown", onKeydown);
    window.addEventListener("resize", onResize);
  }

  const entry = {
    modal,
    backdrop,
    dismissible: true,
    close() {
      const i = stack.indexOf(entry);
      if (i === -1) return;
      stack.splice(i, 1);
      portal.remove();
      if (stack.length === 0) {
        document.documentElement.style.overflow = prevOverflow;
        document.removeEventListener("keydown", onKeydown);
        window.removeEventListener("resize", onResize);
      }
      if (opener && typeof opener.focus === "function" && document.contains(opener)) opener.focus();
      if (onClose) onClose();
    },
  };
  stack.push(entry);

  backdrop.addEventListener("mousedown", (e) => {
    if (e.target === backdrop && entry.dismissible) entry.close();
  });
  modal.addEventListener("click", (e) => {
    if (e.target.closest("[data-bt-close]") && entry.dismissible) entry.close();
  });

  const initial = modal.querySelector("[autofocus]") || modal.querySelector(FOCUSABLE) || modal;
  requestAnimationFrame(() => initial.focus());

  return {
    modal,
    close: () => entry.close(),
    setDismissible(value) {
      entry.dismissible = !!value;
      modal.querySelectorAll("[data-bt-close]").forEach((el) => (el.disabled = !value));
    },
  };
}

export const CLOSE_ICON =
  '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';

// Standard header markup: title + close button.
export function modalHeader(titleHtml) {
  return `<div class="bt-modal-header"><h2 class="bt-modal-title">${titleHtml}</h2>` +
    `<button type="button" class="bt-icon-btn" data-bt-close aria-label="Close">${CLOSE_ICON}</button></div>`;
}
