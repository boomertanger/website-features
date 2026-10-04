// shared/ui/toast.js — short confirmations that float above the page (docs/design-system.md §5
// "Toast"). Like modals, toasts live in their own .bt-root on <body> (.bt-toast-host), so a
// feature root's container can't trap them. The host doesn't take clicks; each toast does.
//
//   toast(message, { kind = "ok" | "error" | "info", ms = 4500 })   -> dismiss()
//
// ok and info use role="status", error uses role="alert". A toast stays while it's hovered or
// focused, and has a close button. Reduced motion: it appears without sliding.
import { escapeHtml } from "./dom.js";

let host = null;
function getHost() {
  if (host && document.body.contains(host)) return host;
  host = document.createElement("div");
  host.className = "bt-root bt-toast-host";
  host.innerHTML = `<div class="bt-toast-stack"></div>`;
  document.body.appendChild(host);
  return host;
}

export function toast(message, { kind = "ok", ms = 4500 } = {}) {
  const stack = getHost().firstElementChild;
  const el = document.createElement("div");
  el.className = `bt-toast bt-toast--${kind}`;
  el.setAttribute("role", kind === "error" ? "alert" : "status");
  const icon = kind === "error" ? "!" : kind === "info" ? "i" : "✓";
  el.innerHTML = `<span class="bt-toast-ic" aria-hidden="true">${icon}</span><span class="bt-toast-text">${escapeHtml(message)}</span><button type="button" class="bt-toast-x" aria-label="Dismiss">×</button>`;
  stack.appendChild(el);
  let timer = 0, gone = false;
  const dismiss = () => {
    if (gone) return;
    gone = true;
    clearTimeout(timer);
    el.classList.add("is-leaving");
    const remove = () => el.remove();
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) remove();
    else { el.addEventListener("animationend", remove, { once: true }); setTimeout(remove, 400); }
  };
  const arm = () => { clearTimeout(timer); if (ms > 0) timer = window.setTimeout(dismiss, ms); };
  el.querySelector(".bt-toast-x").addEventListener("click", dismiss);
  el.addEventListener("pointerenter", () => clearTimeout(timer));
  el.addEventListener("pointerleave", arm);
  el.addEventListener("focusin", () => clearTimeout(timer));
  el.addEventListener("focusout", arm);
  arm();
  return dismiss;
}
