// shared/ui/streamview.js — .bt-streamview, the stream view frames (docs/design-system.md §5 "Control Room pieces", §8p;
// docs/specs/control-room.md §8). The stream view is a browser source in Streamlabs or TikTok LIVE Studio, so it is a fixed canvas:
// 1920x1080 (wide) or 1080x1920 (tall). The frame keeps that design size always and is scaled with a CSS transform to fit its box.
// There is NO container-query reflow inside the frame, and its motion ignores prefers-reduced-motion (it is a video overlay).
// The .bt-sv-* parts are the building blocks scenes are made of; their sizes are canvas pixels. Text is escaped; sceneHtml is trusted.
//
//   STREAM_SIZES                { wide: [1920, 1080], tall: [1080, 1920] }
//   streamViewHtml({ shape, sceneHtml, label, fit })   <div class="bt-streamview" data-shape> > <div class="bt-streamview-frame">
//        shape "wide" | "tall";  fit false renders the frame at its real size (the /live/obs page itself, no scaling box)
//   fitStreamView(el)           sets --bt-sv-s on a .bt-streamview from its width (the frame is design width x scale)
//   initStreamView(root)        fits every .bt-streamview under root now and on resize (ResizeObserver); returns a disconnect function
//
//   Scene parts (all optional, all canvas px): .bt-sv-panel (+ .bt-sv-h, .bt-sv-led), .bt-sv-amber, .bt-sv-word, .bt-sv-url,
//   .bt-sv-muted, .bt-sv-ring (--ring 0-1), .bt-sv-count, .bt-sv-rooms > .bt-sv-room (icon, .bar > i[--f,--c], b), .bt-sv-first,
//   .bt-sv-cam, .bt-sv-beats > .bt-sv-beat (.is-done, .is-now), .bt-sv-ticker. Place them with inline left/top/width in canvas px.
import { escapeHtml as esc } from "./dom.js";

export const STREAM_SIZES = { wide: [1920, 1080], tall: [1080, 1920] };

export function streamViewHtml({ shape = "wide", sceneHtml = "", label = "Stream view preview", fit = true } = {}) {
  const s = STREAM_SIZES[shape] ? shape : "wide";
  return `<div class="bt-streamview" data-shape="${s}"${fit ? "" : ` data-fit="off"`} role="group" aria-label="${esc(label)}"><div class="bt-streamview-frame" data-shape="${s}">${sceneHtml}</div></div>`;
}

export function fitStreamView(el) {
  if (!el || el.dataset.fit === "off") return;
  const [w] = STREAM_SIZES[el.dataset.shape] || STREAM_SIZES.wide;
  const width = el.clientWidth;
  if (width) el.style.setProperty("--bt-sv-s", (width / w).toFixed(5));
}

export function initStreamView(root = document) {
  const boxes = [...root.querySelectorAll(".bt-streamview:not([data-fit=off])")];
  boxes.forEach(fitStreamView);
  if (typeof ResizeObserver === "undefined") return () => {};
  const ro = new ResizeObserver((entries) => entries.forEach((e) => fitStreamView(e.target)));
  boxes.forEach((b) => ro.observe(b));
  return () => ro.disconnect();
}
