// site/src/scripts/not-found/workshop-art.js — the 404 page's basement workshop, drawn in code (docs/specs/not-found.md "The scene").
// Ported from the approved mockup (docs/design/mockups/not-found-workshop.html: the A and W modules, level 4 "Don't stay" only), not
// redrawn. viewBox 900×600; the floor starts at y 462; what matters stays within x 140–760 (the scene is cropped from the centre).
// Every colour is a class (c-* fill, s-* stroke) or a gradient stop that reads an --nf-* property from styles/not-found.css; nothing
// here holds a colour. No blood or gore: rust, grime, bugs, tools and shapes in the dark.
//
//   DEFS, DEFS2   two hidden <svg> with the shared gradients, patterns and clip paths (room.js adds them once)
//   ROOM          { art() → the room's SVG markup, crawlers, eyes, hangers, pois, rest, motes, grain }
//   CR            the crawlers, each a function (scale) → markup; legs move while the crawler has .is-run
//
// The scratched and marker lettering is outlines of Permanent Marker (Font Diner, Apache License 2.0), generated once so the page
// loads no font: MK holds each word's path in tenths of a unit at its drawn size (the art draws it with scale(.1)).

const MK = {
  "gone?": "M111-28l-8 9-13 7-33 10-30 3-11-2-8-6-5-9-3-14 0-5 3-6 12-17 21-19 30-19 4 0 12 9 1 3-1 4 2 1-1 4-26 14-13 9-19 20-5 7 2 2 18 1 1-2 32-7-4-2 1-2-4-5 0-6-1-1-2 1 2-4 11-8 23 14 11 9 1 7zm84-19l4 15-3 13-15 11-17 7-19 3-19-1-11-6-9-13 0-8 2-10 10-19 11-14 12-10 8-5 0-2 7-6 5-1 5-6 7 3 7 8 2 0 2 6-3 5 1 4 13 26zm-19 15l3-5-1-5-12-21-5 3-4-1-19 15-9 15-2 7 9 3 19-2 21-9zm61 4l-8 13-4 12-4 1 1 2-5 1-4-2-4-5-5-12-1-7 34-71 14 9 6 10-1 2 1 4-2 0 0 9-3 2 2 29 7-7 6-9 3-13 4-20 6-17 14 8 5 11-5 11-4 29-5 15-7 10-2 0 0 3-11 8-9-1-11-11-8-14zm146-60l0 5-8 8-43 11 1 5 25-1-1 2 5 5 5 2 0 5-8 6-9 4-15 1-8-2-8 15 30 0 15-5 8 7 3 5-4 6-9 6-19 4-26 1-8-2-6-3-4-5-2-18 3-11 2-1 9-20-4-9-2-11 1-2 7-4 22-6 33-5 3 1 2-1 10 7zm90-20l4 5 0 15-3 11-6 8-30 19-13 5-10 10-13-2-2-6 4-11 8-8 33-23-3-2-24-3-6 1-9 4-3-1-7-6 1-3-3-2 10-15 8-5 19 0 21 3 24 6zm-63 89l3 1-1 6 2 9-15 8-6-3-6-11 1-6-1-2 3-5 3-2 7 0 6 3 4 0 0 2z",
  "this one too": "M56-47l-18 2-14 33-1 4 4 4 0 4-3 2-4 0-5-3-3-9 0-6 10-27-18 0-4-7 1-6 25-1 2-2 4 1 26-2 6 5 1 5-2 2-7 1zm42 38l-2 6-7 4-4-2-3-6 1-9-17 7-4 8-4 2-5 0-4-3-2-6 6-21 4-22 3-6 2-1 8 12-2 20 20-5 3-25 2-4 3-1 8 13 0 9-3 18-4 7 1 5zm29 2l-2 7-8 1-5-16 5-30 3-11 8-4 5 16-6 21 0 16zm13-37l2-4 6-3 30-9 12 1 6 10-4 4-17-1-13 3 1 2 10 5 7 11 0 7-4 7-7 6-9 4-9 3-5 0-2-3-1-10 16-4 7-4 4-5-10-5-17-3-4-4 1-8zm139 15l2 9-2 8-9 7-11 4-12 2-12 0-7-4-5-8 1-12 6-11 7-9 23-19 5 2 5 5 1 4-2 3 1 3 9 16zm-13 9l2-3-1-3-7-13-3 2-3-1-12 9-5 9-1 5 5 2 12-1 13-6zm38 2l-5 8-2 8-5 3-5-5-4-11 21-45 9 5 4 7-2 9-1 1 1 18 5-4 3-6 4-20 4-10 9 5 3 6-3 7-2 18-4 9-5 9-7 4-5 0-7-7-6-9zm91-37l1 3-5 5-27 7 0 3 16 0 3 4 3 1 0 3-11 6-14 0-6 10 19-1 10-3 7 7-3 5-6 3-11 2-16 1-9-3-3-3-1-11 9-20-3-6-1-7 1-1 4-3 14-3 21-3 3-1 5 5zm91 8l-18 2-14 33 0 4 3 4 0 4-3 2-4 0-5-3-3-9 0-6 11-27-19 0-4-7 1-6 25-1 2-2 4 1 26-2 6 5 1 5-2 2-7 1zm46 18l2 9-2 8-9 7-11 4-12 2-12 0-6-4-6-8 1-12 6-11 8-9 23-19 4 2 5 5 2 4-2 3 1 3 8 16zm-12 9l1-3 0-3-7-13-4 2-2-1-12 9-6 9-1 5 5 2 13-1 13-6zm75-9l2 9-2 8-9 7-11 4-12 2-12 0-7-4-5-8 1-12 6-11 7-9 24-19 4 2 5 5 2 4-2 3 0 3 9 16zm-12 9l1-3 0-3-8-13-3 2-2-1-12 9-6 9-1 5 5 2 12-1 14-6z",
  "WHO'S NEXT?": "M8-7l-6-12 1-7 8-29 4-10 5-5 2-1 9 9-8 28-3 15 14-12 23-35 6 4 5 7-5 23 2 10 6-5 4-6 18-40 8 8 3 10-13 30-9 15-11 10-6 1-4-3-11-18-15 13-11 5-7 1-9-6zm93 4l-3-8 8-23 3-26 4-8 4-3 9 16-3 21 1 2 23-6 2-19 2-2 0-8 2-5 4-2 9 16 1 14-4 18-4 8 0 8-1 5-10 5-3-2-5-8 2-10-10 3-11 5-5 9 1 1-6 3-5 0-5-4zm91 3l-10-1-8-7-4-8 2-14 6-10 9-12 15-12 5-6 4 0 4-5 4 2 6 7 2-1 1 4-2 5 11 22 3 11-1 7-5 7-8 5-16 5-11 2-7-1zm2-35l-8 14 0 2 3 2 18-1 15-7 2-3 0-5-9-15-4 2-3-1-14 12zm74-37l5 4 1 4-5 11-5 20-4 6-4-1-4-6 0-11 4-18 4-11 8 2zm3 28l1-9 5-7 10-4 0-1 23-7 11-1 11 2 6 11 0 3-4 3-20-2-15 4 1 2 12 7 2 5 5 7 1 8-4 8-6 6-20 10-11 0-3-5 0-10 11-2 9-3 7-4 5-7-12-6-19-3-6-5zm111 35l-2 6-3 1 0 1-5 1-5-7-4-12 25-53 11 6 5 7 0 5-1 0-1 7-2 1 1 22 6-5 4-7 5-25 5-12 10 6 5 8-5 8-3 21-3 12-5 8-2-1 0 3-8 5-7 0-9-10-5-9-7 10 0 3zm56 6l-2-4-2-13 2-8 2-1 7-15-4-7-1-8 1-2 6-3 16-4 24-4 2 1 2-1 7 5 0 5-6 5-32 8 1 4 18 0 0 1 4 3 3 2 1 4-13 7-18 0-6 11 23-1 11-3 9 9-4 5-7 4-14 3-19 1-11-4zm63 6l-6-8 0-11 6-9 14-15-7-11-2 0-3-7 2-13 9 1 9 8 7 9 22-15 4-2 3 1 5 9-3 7-24 17 11 15 3 8 0 5-4 7-4 2-6-5-4-9-8-11-14 14-5 10-5 3zm59-57l-2-9 1-5 30-1 3-3 4 2 32-3 7 7 1 3-3 5-30 3-16 40-1 5 5 4-1 4-5 4-3 0-7-4-3-12 2-11 11-27-19 1-6-3zm118-13l2 3 0 9-2 7-4 5-18 11-8 4-7 6-8-1-1-4 3-7 25-19-2-1-14-2-12 2-4-3 0-2-1-2 6-9 5-3 12 0 28 6zm-40 55l2 1 1 9-9 5-5-2-3-6 0-6 2-2 6-2 6 2 0 1z",
  "TAPES": "M2-59l-2-10 2-5 33-2 2-3 5 2 25-3 10 0 7 7 2 3-3 6-33 4-19 44 0 5 5 5 0 4-3 3-3 1-3 0-8-4-3-14 2-12 12-29-21 1-7-3zm58 50l-1-1 4-10 13-29 10-17 5 0 3-2 10-12 13 5 8 35 6 0 1 2 7 4-4 5-6 5 1 12-4 7-7 5-6 0-5-2 1-3-5-6 7-3 1-5-23 2-3-9-5 9-4 12-4 5-7 0-4-4-2-5zm33-29l-3 4 17-1-4-17-10 14zm50 8l2-1-3-4 3-10 5-7 3-2 5-12 7-9 10-5 13-1 9 3 8 4 7 16 0 8-2 7-7 7-9 4-30 7-1 14-4 11-9 2-4-2-3-8 3-17 0-3-3-2zm28-25l-2 7 1 1 25-8-12-4-7 1-5 3zm44 51l-3-4-2-14 3-9 2-1 7-17-4-8-2-8 2-2 6-3 18-5 27-4 2 1 2-1 8 6-1 5-6 5-35 9 0 5 21-1 0 2 4 3 3 2 1 4-14 8-19 0-7 12 25 0 12-4 10 9-4 6-8 5-15 3-21 1-7-2-5-3zm64-44l1-11 5-7 12-4-1-1 26-8 13-1 11 1 7 13 0 3-5 3-18 0-4-1-16 4 1 2 6 2 7 5 2 6 6 8 0 9-3 8-8 7-10 6-11 5-12 0-4-5 1-11 1-1 11-2 9-3 9-5 5-7-14-6-20-3-7-6z",
  "IT'S STILL HERE": "M2 2l-5-7-2-13 3-3 22-2 15-36 7-23 0-2-14 3-6-2-5-9 0-5-1-3 2-4 20-4 31-1 14 1 6 3 3 4 4 3 1 6-13 5-19 1-11 42-7 18 10 0 9 9 1 4-4 6-4 2-16 1-1 2-13-1-27 5zm88-83l-4-14 3-6 45-3 3-4 4 1 2 2 34-4 15 0 9 10 2 4 0 3-4 5-45 5-25 60-1 7 7 7 0 5-3 5-5 1-4 0-11-6-4-18 2-17 10-26 3-2 4-12-29 2-8-5zm134-27l7 6 1 6-7 16-7 30-7 10-6-2-1-4-5-5 0-17 6-26 7-17 5 0 7 3zm13 42l1-14 3-6 5-4 15-6-1-1 35-10 18-2 15 2 10 17 0 4-7 4-11-1-14 1-5-1-22 5 1 3 9 3 9 7 3 8 2 1 6 10 1 11-6 12-9 10-14 8-16 6-16 0-5-6 1-16 2-1 14-2 13-5 12-6 6-10-1-2-17-7-3 1-25-5-5-2-4-6zm160 0l1-14 3-6 5-4 15-6-1-1 35-10 17-2 16 2 10 17 0 4-7 4-11-1-14 1-5-1-23 5 2 3 9 3 9 7 3 8 2 1 6 10 1 11-6 12-9 10-15 8-15 6-16 0-5-6 1-16 2-1 14-2 13-5 11-6 7-10-1-2-17-7-3 1-25-5-5-2-4-6zm97-15l-3-14 2-6 45-3 3-4 4 1 3 2 33-4 15 0 10 10 1 4 0 3-3 5-46 5-24 60-1 7 7 7-1 5-3 5-5 1-4 0-10-6-5-18 3-17 9-26 3-2 4-12-28 2-9-5zm99 83l-5-7-2-13 2-3 23-2 15-36 6-23 1-2-14 3-6-2-5-9 0-5-1-3 2-4 20-4 31-1 14 1 6 3 3 4 4 3 1 6-13 5-19 1-11 42-8 18 10 0 10 9 1 4-4 6-4 2-16 1-1 2-13-1-27 5zm92-7l-6-14 1-15 24-74 4-1 14 4 5 6 2 5-21 56-2 12 6 0 8-3 10-1 16-1 5 2 16 8 2 13-6 3-9 1-10-1-17 1-24 6-12-2-6-5zm104 0l-6-14 0-15 25-74 4-1 14 4 5 6 2 5-21 56-3 12 7 0 8-3 10-1 16-1 5 2 16 8 2 13-6 3-9 1-10-1-17 1-24 6-12-2-6-5zm163 0l-1-1 1-1-4-9 3-3 0-9 8-23 0-9 2-1 4-29 5-13 6-3 3 7 11 16-5 32 1 3 24-5 11-4 3-19-1-9 4-3 0-13 3-7 6-3 9 19 5 5 1 21-6 26-7 14 2 11-3 7-5 4-9 4-6-3 1-1-7-11 2-15-14 4-17 8-4 10-3 3 1 2-9 4-8 0-7-6zm119 0l-4-5-3-20 4-12 2-2 10-23-5-10-2-11 2-3 9-5 23-6 37-6 3 2 0-2 3 0 3 4 7 4 0 7-9 8-48 12 1 6 29-1-1 2 5 5 6 2 0 6-10 8-9 3-17 1-9-1-9 17 10 0 23-1 18-5 6 7 3 0 2 5 1 1-5 7-10 7-21 4-29 1-9-2-7-4zm97-8l-2-3 1 0 2-21 1-2 1-6 9-36 8 2 21-25 7-4 6-2 20 16 10 23 1 9-4 8-8 7-31 12 16 10 31 6 4 9-1 7 2 1-6 6-7 1-8-1-31-11-9-5-9-7-7 17-7 3-6-2-1-3-2-1-1-8zm49-67l-11 14-4 8 26-8-3-8-8-6zm62 75l-5-5-2-20 3-12 3-2 10-23-5-10-2-11 2-3 8-5 24-6 37-6 3 2 0-2 2 0 4 4 7 4-1 7-8 8-48 12 1 6 28-1 0 2 5 5 5 2 1 6-11 8-8 3-17 1-10-1-9 17 10 0 24-1 17-5 7 7 2 0 2 5 2 1-5 7-10 7-22 4-28 1-9-2-7-4z",
  "DON'T": "M16 2l-6-3-4-5-4-20 11-34 0-16-4-18 1-6 4 0-4-13 4-11 40 15 22 16 8 8 7 9 5 11 2 10-1 7-5 6-8 9-9 7-21 12-38 16zm17-94l-3 0 4 17 0 13-3 26 16-4 3-4 15-7 8-6 4-7-14-16-30-12zm117 93l-9 0-8-2-8-5-7-7-5-9-1-5 0-11 3-12 10-19 17-20 2 0 12-13 10-6 0-2 5-3 5-6 6-1 7-7 7 2 3 2 7 10 2 0 3 6-4 9 2 1 0 3 17 33 5 19-2 12-8 10-14 10-26 8-19 4-12-1zm2-61l-10 17-3 7 0 4 6 4 9 0 20-2 27-12 3-6-1-7-14-27-7 4-5-1-25 19zm125 44l-4 11-5 2 1 2-6 1-3-1-4-3-5-8-5-13 1 0-2-7 43-91 10 5 8 5 5 6 3 7 0 2-1 1 1 5-2 1-1 11-3 2 1 37 10-9 7-11 5-17 4-25 3-5 5-16 4 1 9 8 5 1 7 13-4 11-3 4-6 36-6 19-8 13-3 0 0 4-14 10-11-1-17-17-8-15-11 16 0 5zm139-107l8 8 2 6-9 19-8 34-7 11-8-3-1-4-5-6 0-19 7-30 7-19 6 0 3 3 5 0zm17 31l-4-15 2-8 51-3 4-4 5 0 3 3 38-5 16 1 11 10 2 6 0 3-4 5-10 2-41 4-28 68-1 8 7 7 0 7-4 5-5 1-5 0-12-7-5-20 3-19 11-29 3-3 5-13-33 1-5-1-4-4z",
  "STAY": "M2-75l1-16 3-6 6-5 17-7-1-1 40-12 20-2 17 3 12 19-1 4-8 6-12-2-16 1-5-1-26 5 2 4 9 3 3 3 4 1 4 4 3 9 3 2 7 11 0 13-6 13-11 11-16 9-17 7-2-1-5 2-12-1-5-7 1-2-2-2 1-13 3-2 17-2 14-6 13-7 6-8 1-3-1-2-19-8-3 1-29-6-5-3-5-6zm110-17l-4-15 3-8 51-3 3-4 5 0 3 3 38-5 17 1 11 10 1 6 0 3-4 5-9 2-42 4-28 68-1 8 8 7-1 7-4 5-5 1-5 0-11-7-6-20 3-19 11-29 3-3 5-13-32 1-5-1-5-4zm99 79l-2-3 2-1 4-14 20-41 0-3 15-27 9 0 5-3 15-18 20 8 12 54 9-1 3 4 10 5-6 9-9 6 2 19-7 11-11 8-7 1-3 0-6-4 0-5-8-9 12-4 2-8-6-1-18 4-12 0-4-7-1-7-2 7-3 1 0 3-3 3-5 19-7 5 0 2-10 1-7-7-3-7zm51-46l-5 7 26-3-6-25-15 21zm103 63l-7 0-7-3-6-11 3-13 17-29-6-8-6-16-4-20 1-5-3-13 1-6 6-5 18 11 0 3 3 1 5 29 3-3 12-15 0-2 16-18 6-4 10-3 3 6 9 6 1 6-1 3-18 19-2 6-3 0-6 8-9 16 0 2-16 23-14 29-6 6z",
};
const T = (x, y, r = 0, s = 1) => `translate(${x} ${y})${r ? ` rotate(${r})` : ""}${s !== 1 ? ` scale(${s})` : ""}`;
const G = (tr, inner, cls = "", extra = "") => cls === "nf-sway" ? `<g class="nf-sway"${extra}><g transform="${tr}">${inner}</g></g>` : `<g transform="${tr}"${cls ? ` class="${cls}"` : ""}${extra}>${inner}</g>`;

// ---------- shared defs (one hidden svg; gradients and patterns are referenced by the art and the eyes) ----------
const DEFS = `<svg class="nf-defs nf-art" width="0" height="0" style="position:absolute;width:0;height:0;overflow:hidden" aria-hidden="true" focusable="false"><defs>
  <linearGradient id="gSteel" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--nf-st-1)"/><stop offset=".42" style="stop-color:var(--nf-st-2)"/><stop offset=".5" style="stop-color:var(--nf-st-3)"/><stop offset="1" style="stop-color:var(--nf-st-2)"/></linearGradient>
  <linearGradient id="gSteelH" x1="0" y1="0" x2="1" y2="0"><stop offset="0" style="stop-color:var(--nf-st-3)"/><stop offset=".35" style="stop-color:var(--nf-st-1)"/><stop offset=".6" style="stop-color:var(--nf-st-2)"/><stop offset="1" style="stop-color:var(--nf-st-3)"/></linearGradient>
  <linearGradient id="gRust" x1="0" y1="0" x2="1" y2="1"><stop offset="0" style="stop-color:var(--nf-rs-1)"/><stop offset=".55" style="stop-color:var(--nf-rs-2)"/><stop offset="1" style="stop-color:var(--nf-rs-3)"/></linearGradient>
  <linearGradient id="gWood" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--nf-wd-hi)"/><stop offset=".5" style="stop-color:var(--nf-wd-1)"/><stop offset="1" style="stop-color:var(--nf-wd-2)"/></linearGradient>
  <linearGradient id="gWoodH" x1="0" y1="0" x2="1" y2="0"><stop offset="0" style="stop-color:var(--nf-wd-2)"/><stop offset=".45" style="stop-color:var(--nf-wd-hi)"/><stop offset="1" style="stop-color:var(--nf-wd-2)"/></linearGradient>
  <radialGradient id="gBone" cx=".4" cy=".35" r=".75"><stop offset="0" style="stop-color:var(--nf-bn-1)"/><stop offset=".7" style="stop-color:var(--nf-bn-2)"/><stop offset="1" style="stop-color:var(--nf-bn-3)"/></radialGradient>
  <radialGradient id="gRustSpot"><stop offset="0" style="stop-color:var(--nf-rs-2);stop-opacity:.9"/><stop offset="1" style="stop-color:var(--nf-rs-3);stop-opacity:0"/></radialGradient>
  <radialGradient id="gGrime"><stop offset="0" style="stop-color:var(--nf-grime);stop-opacity:.75"/><stop offset="1" style="stop-color:var(--nf-grime);stop-opacity:0"/></radialGradient>
  <linearGradient id="gFloorFade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--nf-shade);stop-opacity:.75"/><stop offset=".35" style="stop-color:var(--nf-shade);stop-opacity:.15"/><stop offset="1" style="stop-color:var(--nf-shade);stop-opacity:.35"/></linearGradient>
  <linearGradient id="gWallFade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--nf-shade);stop-opacity:.45"/><stop offset=".55" style="stop-color:var(--nf-shade);stop-opacity:0"/><stop offset="1" style="stop-color:var(--nf-grime);stop-opacity:.6"/></linearGradient>
  <radialGradient id="gGlass" cx=".35" cy=".3" r=".8"><stop offset="0" style="stop-color:var(--nf-glass-hi)"/><stop offset="1" style="stop-color:var(--nf-glass)"/></radialGradient>
  <linearGradient id="gOrange" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--nf-saw-hi)"/><stop offset="1" style="stop-color:var(--nf-saw)"/></linearGradient>
  <linearGradient id="gBug" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--nf-bug-hi)"/><stop offset="1" style="stop-color:var(--nf-bug-1)"/></linearGradient>
  <pattern id="pBlocks" width="120" height="60" patternUnits="userSpaceOnUse">
    <rect width="120" height="60" class="c-cc2"/>
    <rect x="2" y="2" width="116" height="26" rx="1.5" class="c-cc1"/><rect x="2" y="2" width="116" height="3" class="c-cc3" opacity=".5"/>
    <rect x="-58" y="32" width="116" height="26" rx="1.5" class="c-cc1"/><rect x="62" y="32" width="116" height="26" rx="1.5" class="c-cc1"/>
    <rect x="-58" y="32" width="116" height="3" class="c-cc3" opacity=".5"/><rect x="62" y="32" width="116" height="3" class="c-cc3" opacity=".5"/>
    <circle cx="20" cy="14" r="1.2" class="c-cc2"/><circle cx="77" cy="20" r="1.6" class="c-cc2"/><circle cx="40" cy="47" r="1.1" class="c-cc2"/><circle cx="101" cy="44" r="1.4" class="c-cc2"/><circle cx="55" cy="9" r=".9" class="c-cc3"/>
  </pattern>
  <pattern id="pPeg" width="18" height="18" patternUnits="userSpaceOnUse"><rect width="18" height="18" class="c-peg"/><circle cx="9" cy="9" r="2.1" class="c-peg-hole"/><circle cx="9.5" cy="9.6" r="2.1" class="c-hi" opacity=".06"/></pattern>
  <pattern id="pConc" width="90" height="90" patternUnits="userSpaceOnUse"><rect width="90" height="90" class="c-cc1"/><circle cx="14" cy="22" r="1.4" class="c-cc2"/><circle cx="63" cy="11" r="1" class="c-cc3"/><circle cx="40" cy="58" r="1.8" class="c-cc2"/><circle cx="77" cy="71" r="1.2" class="c-cc2"/><circle cx="22" cy="80" r=".9" class="c-cc3"/><path d="M50 30 l9 4 l5 -2" class="s-cc2" fill="none" stroke-width="1"/></pattern>
</defs></svg>`;

// ---------- structural ----------
const wall = (pat, extra = "") => `<rect width="900" height="462" fill="url(#${pat})"/>${extra}<rect width="900" height="462" fill="url(#gWallFade)"/>`;
const floor = (pat, baseCls = "c-wd3") => `<rect y="462" width="900" height="138" fill="url(#${pat})"/><rect y="452" width="900" height="12" class="${baseCls}"/><rect y="452" width="900" height="2" class="c-hi" opacity=".06"/><rect y="462" width="900" height="138" fill="url(#gFloorFade)"/>`;
const web = (x, y, flip = 1, s = 1) => G(`${T(x, y)} scale(${flip * s} ${s})`, `<g class="s-web" fill="none" stroke-width=".8">
    <path d="M0 0 L120 0 M0 0 L0 110 M0 0 L105 55 M0 0 L60 100 M0 0 L118 22 M0 0 L28 108"/>
    <path d="M18 0 Q14 6 0 15 M38 0 Q32 15 0 33 M62 0 Q52 26 0 54 M88 0 Q74 40 0 78 M112 2 Q94 54 4 104" opacity=".8"/></g>`);
const grime = (x, y, rx, ry, o = .8) => `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="url(#gGrime)" opacity="${o}"/>`;
const rust = (x, y, r) => `<circle cx="${x}" cy="${y}" r="${r}" fill="url(#gRustSpot)"/>`;
const nail = (x, y) => `<circle cx="${x}" cy="${y}" r="3" class="c-st3"/><circle cx="${x - .8}" cy="${y - .8}" r="1.2" class="c-st1" opacity=".7"/>`;
const shadow = (x, y, rx, ry = 6) => `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" class="c-shade" opacity=".55"/>`;

// ---------- tools and weapons (drawn around their own origin) ----------
const rivets = (xs, y) => xs.map((x) => `<circle cx="${x}" cy="${y}" r="2.6" class="c-st2"/><circle cx="${x - .7}" cy="${y - .7}" r="1" class="c-st1"/>`).join("");
const hacksaw = () => `
  <path d="M0 0 H150 V44 M150 0" class="s-st2" fill="none" stroke-width="6" stroke-linejoin="round"/>
  <path d="M0 -2 V44" class="s-st2" stroke-width="7"/>
  <path d="M3 40 H148" class="s-st1" stroke-width="3"/>
  <path d="${Array.from({ length: 36 }, (_, i) => `${i ? "L" : "M"}${4 + i * 4} ${i % 2 ? 46 : 42}`).join(" ")}" class="s-st2" fill="none" stroke-width="1.2"/>
  <path d="M-4 38 Q-28 44 -30 66 Q-18 84 4 74 Q10 60 2 46 Z" fill="url(#gWood)" class="s-wd3" stroke-width="1.2"/><ellipse cx="-14" cy="62" rx="7" ry="9" class="c-peg-hole"/>
  ${rust(70, 2, 7)}${rust(150, 30, 6)}`;
const handsaw = () => `
  <path d="M0 0 L170 14 L170 28 Q90 40 0 46 Z" fill="url(#gSteel)" class="s-st3" stroke-width=".8"/>
  <path d="${Array.from({ length: 30 }, (_, i) => `${i ? "L" : "M"}${i * 5.8} ${46 - i * .6 + (i % 2 ? 4 : 0)}`).join(" ")}" class="s-st2" fill="none" stroke-width="1.4"/>
  ${rust(60, 20, 10)}${rust(120, 22, 8)}<circle cx="150" cy="20" r="3" class="c-void"/>
  <path d="M-2 -4 Q-40 -8 -46 16 Q-48 46 -6 50 L4 46 V0 Z" fill="url(#gWood)" class="s-wd3" stroke-width="1.2"/><path d="M-34 12 Q-36 32 -14 34 Q-12 18 -14 12 Z" class="c-peg-hole"/>${rivets([-8, -8], 8)}`;
const hammer = () => `
  <rect x="-6" y="0" width="12" height="150" rx="5" fill="url(#gWoodH)" class="s-wd3" stroke-width="1"/><path d="M-2 20 V140" class="s-wdhi" stroke-width="1" opacity=".4"/>
  <path d="M-30 -10 H22 Q28 -10 30 -4 L44 -24 Q50 -26 50 -18 L34 6 H-30 Q-36 -2 -30 -10 Z" fill="url(#gSteel)" class="s-st3" stroke-width="1"/>
  <rect x="-38" y="-12" width="10" height="20" rx="2" class="c-st2"/>${rust(-10, -2, 6)}`;
const screwdriver = (len = 90, cls = "c-handle-r") => `
  <rect x="-2" y="0" width="4" height="${len}" fill="url(#gSteelH)"/><path d="M-2 ${len} L0 ${len + 8} L2 ${len}" class="c-st2"/>
  <path d="M-7 -46 H7 Q10 -40 9 -2 H-9 Q-10 -40 -7 -46 Z" class="${cls}"/><path d="M-3 -44 V-4" fill="none" class="s-hi" opacity=".25" stroke-width="2"/>`;
const pliers = () => `
  <path d="M-3 0 Q-14 40 -20 110 M3 0 Q14 40 20 110" class="s-handle-r" fill="none" stroke-width="9" stroke-linecap="round"/>
  <path d="M-5 -2 Q-8 -30 -2 -52 L2 -52 Q4 -30 2 -2 Z M5 -2 Q8 -30 2 -52" fill="url(#gSteelH)" class="s-st3" stroke-width=".8"/><circle r="6" class="c-st2"/><circle r="2" class="c-st3"/>`;
const axe = (len = 230) => `
  <path d="M0 0 Q8 ${len * .5} -4 ${len}" class="s-wd2" fill="none" stroke-width="14" stroke-linecap="round"/><path d="M-2 10 Q5 ${len * .5} -5 ${len - 8}" class="s-wdhi" fill="none" stroke-width="2" opacity=".35"/>
  <path d="M-10 -8 H10 L16 -14 Q60 -40 74 -6 Q78 26 70 54 Q56 30 16 26 L10 20 H-10 Z" fill="url(#gSteel)" class="s-st3" stroke-width="1"/>
  <path d="M72 -2 Q76 24 70 50" class="s-st1" fill="none" stroke-width="3"/>${rust(30, 0, 12)}${rust(50, 22, 9)}${rust(18, 12, 6)}`;
const chain = (len, link = 12, cls = "s-st2") => { let s = ""; for (let i = 0, y = 0; y < len; i++, y += link * .82) s += i % 2 ? `<rect x="-1.6" y="${y}" width="3.2" height="${link}" rx="1.6" class="${cls.replace("s-", "c-")}"/>` : `<rect x="-4" y="${y}" width="8" height="${link}" rx="4" fill="none" class="${cls}" stroke-width="2.2"/>`; return s; };
const meatHook = () => `<path d="M0 0 V26 C0 48 -26 50 -24 30" class="s-st2" fill="none" stroke-width="6" stroke-linecap="round"/><path d="M-24 30 l-2 -9" class="s-st1" stroke-width="4" stroke-linecap="round"/>${rust(-8, 44, 6)}`;
const jar = (inner = "") => `<rect x="-22" y="-62" width="44" height="62" rx="9" fill="url(#gGlass)" class="s-glass" stroke-width="1"/>${inner}<rect x="-24" y="-70" width="48" height="10" rx="2" class="c-rs2"/><rect x="-16" y="-56" width="5" height="44" rx="2.5" class="c-hi" opacity=".18"/>`;
const eyeball = (x, y, r = 7) => `<circle cx="${x}" cy="${y}" r="${r}" class="c-bn1"/><circle cx="${x + r * .3}" cy="${y}" r="${r * .45}" class="c-iris"/><circle cx="${x + r * .35}" cy="${y}" r="${r * .2}" class="c-void"/><path d="M${x - r} ${y} q${r * .5} -2 ${r * .7} 1 M${x - r * .8} ${y + r * .5} q${r * .4} -2 ${r * .6} 0" class="s-vein" stroke-width=".7" fill="none"/>`;
const chainsaw = () => `
  <rect x="70" y="10" width="190" height="34" rx="17" fill="url(#gSteel)" class="s-st3"/>
  <path d="M78 10 H244 Q262 10 262 27 Q262 44 244 44 H78" fill="none" class="s-st3" stroke-width="5" stroke-dasharray="3 3"/>
  ${rust(160, 26, 14)}${rust(220, 20, 9)}
  <path d="M0 4 Q0 -14 18 -16 H74 Q92 -16 92 4 V52 Q92 64 78 64 H12 Q0 64 0 52 Z" fill="url(#gOrange)" class="s-rs3" stroke-width="1.2"/>
  <path d="M14 -16 Q24 -46 56 -44 Q78 -42 80 -16" fill="none" class="s-void" stroke-width="9"/><path d="M14 -16 Q24 -46 56 -44 Q78 -42 80 -16" fill="none" class="s-saw-hi" stroke-width="5"/>
  <rect x="14" y="8" width="44" height="22" rx="4" class="c-void" opacity=".75"/><path d="M18 12 v14 M24 12 v14 M30 12 v14 M36 12 v14 M42 12 v14 M48 12 v14" class="s-saw" stroke-width="2"/>
  <path d="M-2 40 Q-34 40 -34 20 Q-34 4 -8 6" fill="none" class="s-void" stroke-width="8"/>`;
const vise = () => `<rect x="-60" y="-6" width="120" height="10" rx="2" class="c-rs3"/><path d="M-50 -6 V-46 H-12 V-6 Z" fill="url(#gRust)"/><path d="M12 -6 V-46 H44 V-6 Z" fill="url(#gRust)"/><rect x="-14" y="-40" width="28" height="10" class="c-st3"/><path d="M44 -26 H96" class="s-st2" stroke-width="5"/><path d="M96 -46 V-6" class="s-st2" stroke-width="5" stroke-linecap="round"/><circle cx="96" cy="-48" r="5" class="c-st3"/><circle cx="96" cy="-4" r="5" class="c-st3"/>`;
const bulb = (len) => `<path d="M0 0 V${len}" class="s-cord" stroke-width="2.2"/><rect x="-7" y="${len}" width="14" height="16" rx="2" class="c-st3"/><path d="M-12 ${len + 16} Q-18 ${len + 44} 0 ${len + 52} Q18 ${len + 44} 12 ${len + 16} Z" fill="url(#gGlass)" class="s-glass"/><path d="M-4 ${len + 24} q4 8 8 0 q-4 -6 -8 0" class="s-st3" fill="none" stroke-width="1"/><path d="M-6 ${len + 22} q-3 10 0 18" class="s-hi" opacity=".3" fill="none" stroke-width="2"/>`;
const breaker = (blown) => `<rect x="-46" y="-60" width="92" height="120" rx="6" fill="url(#gSteel)" class="s-st3"/><rect x="-38" y="-50" width="76" height="100" rx="3" class="c-st3"/>
  ${[0, 1, 2, 3].map((i) => `<rect x="-30" y="${-42 + i * 24}" width="24" height="16" rx="2" class="c-st2"/><rect x="6" y="${-42 + i * 24}" width="24" height="16" rx="2" class="c-st2"/><rect x="${-24}" y="${-38 + i * 24}" width="12" height="8" rx="1" class="${blown && i === 2 ? "c-rs2" : "c-void"}"/><rect x="12" y="${-38 + i * 24}" width="12" height="8" rx="1" class="c-void"/>`).join("")}
  ${blown ? `<path d="M-24 6 l4 -6 l3 5 l4 -7" class="s-saw" fill="none" stroke-width="1.4"/><ellipse cx="-14" cy="0" rx="22" ry="10" class="c-shade" opacity=".35"/>` : ""}${rust(30, 50, 10)}`;
const outline = (d) => `<path d="${d}" class="s-paint" fill="none" stroke-width="2.4" stroke-dasharray="6 4"/>`;

// ---------- crawlers (animated by the page script; legs move while .is-run) ----------
const legs = (pairs, len, spread) => { let a = "", b = ""; pairs.forEach((x, i) => { const p = (i % 2 ? "a" : "b"); const l = `<path d="M${x} -3 q${spread} -${len * .6} ${spread * 1.6} -${len}" fill="none"/><path d="M${x} 3 q${spread} ${len * .6} ${spread * 1.6} ${len}" fill="none"/>`; if (p === "a") a += l; else b += l; }); return `<g class="lg-a">${a}</g><g class="lg-b">${b}</g>`; };
const CR = {
  roach: (s = 1) => `<g transform="scale(${s})"><g class="s-bug" stroke-width="1.3" stroke-linecap="round">${legs([-6, 0, 6], 11, 4)}</g>
    <path d="M14 -2 Q30 -16 40 -10 M14 2 Q30 16 40 10" class="s-bug" fill="none" stroke-width=".9"/>
    <ellipse cx="-2" cy="0" rx="15" ry="7.5" fill="url(#gBug)" class="s-bug" stroke-width=".6"/><path d="M-14 0 H10" class="s-bug" stroke-width=".8" opacity=".7"/><ellipse cx="12" cy="0" rx="5" ry="5" class="c-bug2"/><ellipse cx="-4" cy="-2.5" rx="7" ry="1.5" class="c-hi" opacity=".22"/></g>`,
  beetle: (s = 1) => `<g transform="scale(${s})"><g class="s-bug" stroke-width="1.4" stroke-linecap="round">${legs([-5, 0, 5], 9, 3)}</g>
    <ellipse cx="0" cy="0" rx="12" ry="9" class="c-beetle"/><path d="M-12 0 H10" class="s-void" stroke-width="1"/><ellipse cx="11" cy="0" rx="4" ry="4.5" class="c-void"/><ellipse cx="-2" cy="-4" rx="6" ry="1.6" class="c-hi" opacity=".3"/><path d="M14 -2 l6 -5 M14 2 l6 5" class="s-bug" stroke-width="1"/></g>`,
  spider: (s = 1) => `<g transform="scale(${s})"><g class="s-spider" stroke-width="1.6" stroke-linecap="round" fill="none">
    <g class="lg-a"><path d="M2 -3 q-4 -14 -18 -18 l-6 10"/><path d="M4 -3 q6 -16 20 -16 l6 10"/><path d="M-1 3 q-6 12 -20 16 l-6 -8"/><path d="M5 3 q8 12 22 14 l4 -9"/></g>
    <g class="lg-b"><path d="M0 -3 q-10 -8 -22 -6 l-4 9"/><path d="M6 -3 q10 -6 24 -4 l2 10"/><path d="M1 3 q-10 8 -24 6 l-2 -9"/><path d="M6 3 q12 6 24 3 l2 -9"/></g></g>
    <ellipse cx="-9" cy="0" rx="10" ry="8.5" class="c-spider"/><circle cx="5" cy="0" r="5.5" class="c-spider"/><path d="M-14 -2 l3 2 l-3 2 M-8 -3 l3 3 l-3 3" class="s-hourglass" fill="none" stroke-width="1.2"/><circle cx="9" cy="-1.6" r="1" class="c-eye-r"/><circle cx="9" cy="1.6" r="1" class="c-eye-r"/></g>`,
  centipede: (s = 1) => { let seg = "", lg = ""; for (let i = 0; i < 13; i++) { const x = -i * 7; lg += `<g class="cl" style="--i:${i}"><path d="M${x} -3 l-2 -8 M${x} 3 l-2 8" /></g>`; seg += `<ellipse class="cs" style="--i:${i}" cx="${x}" cy="0" rx="5" ry="${4.4 - i * .12}"/>`; }
    return `<g transform="scale(${s})"><g class="s-cent" stroke-width="1.2" stroke-linecap="round">${lg}</g><g class="c-cent">${seg}</g><circle cx="5" cy="0" r="4.6" class="c-cent2"/><path d="M8 -2 q8 -6 14 -4 M8 2 q8 6 14 4" class="s-cent" fill="none" stroke-width="1"/></g>`; },
  rat: (s = 1) => `<g transform="scale(${s})"><path d="M-22 2 C-40 6 -54 -6 -70 4" class="s-tail" fill="none" stroke-width="2.6" stroke-linecap="round"/>
    <g class="s-rat" stroke-width="3" stroke-linecap="round"><g class="lg-a"><path d="M10 6 l4 8 M-14 6 l-4 8"/></g><g class="lg-b"><path d="M8 -6 l4 -8 M-16 -6 l-4 -8"/></g></g>
    <ellipse cx="-4" cy="0" rx="22" ry="11" class="c-rat"/><path d="M14 -7 Q32 -3 34 0 Q32 3 14 7 Z" class="c-rat"/><circle cx="34" cy="0" r="2" class="c-rat-nose"/><circle cx="12" cy="-9" r="5" class="c-rat-ear"/><circle cx="12" cy="9" r="5" class="c-rat-ear"/><circle cx="24" cy="-3.4" r="1.6" class="c-eye-r"/><circle cx="24" cy="3.4" r="1.6" class="c-eye-r"/><path d="M33 -1 l8 -4 M33 1 l8 4 M32 0 l9 0" class="s-whisk" stroke-width=".5"/><ellipse cx="-8" cy="-4" rx="12" ry="2.4" class="c-hi" opacity=".07"/></g>`,
  scorpion: (s = 1) => `<g transform="scale(${s})"><g class="s-scorp" stroke-width="1.6" stroke-linecap="round" fill="none">${legs([-6, -1, 4, 9], 10, -3)}</g>
    <path d="M-16 0 C-30 0 -40 -8 -40 -18 C-40 -30 -24 -34 -20 -24" class="s-scorp" fill="none" stroke-width="5" stroke-linecap="round"/><path d="M-20 -24 l4 -4 l1 5" class="c-scorp2"/>
    <ellipse cx="0" cy="0" rx="14" ry="7" class="c-scorp"/><path d="M-10 0 h22 M-6 -5 v10 M0 -6 v12 M6 -5 v10" class="s-scorp2" stroke-width=".8"/>
    <path d="M12 -4 Q22 -12 28 -10 M12 4 Q22 12 28 10" class="s-scorp" fill="none" stroke-width="2.5"/><path d="M27 -13 q8 0 8 4 q-4 0 -7 1 M27 13 q8 0 8 -4 q-4 0 -7 -1" class="c-scorp"/></g>`,
  maggot: (s = 1) => `<g transform="scale(${s})"><g class="mg"><ellipse cx="0" cy="0" rx="7" ry="3" class="c-maggot"/><path d="M-4 -2.6 v5.2 M-1 -3 v6 M2 -2.8 v5.6" class="s-maggot" stroke-width=".6"/></g></g>`,
};


// ---------- workshop props ----------
const DEFS2 = `<svg class="nf-defs nf-art" width="0" height="0" style="position:absolute;width:0;height:0;overflow:hidden" aria-hidden="true" focusable="false"><defs>
  <clipPath id="cTvScreen"><rect x="-44" y="-76" width="62" height="64" rx="16"/></clipPath>
  <linearGradient id="gTvCase" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--nf-tv-case-hi)"/><stop offset=".55" style="stop-color:var(--nf-tv-case)"/><stop offset="1" style="stop-color:var(--nf-wd-3)"/></linearGradient>
  <radialGradient id="gTvGlass" cx=".42" cy=".38" r=".75"><stop offset="0" style="stop-color:var(--nf-tv-glass-hi)"/><stop offset="1" style="stop-color:var(--nf-tv-glass)"/></radialGradient>
  <radialGradient id="gTvVig" cx=".5" cy=".5" r=".62"><stop offset=".55" style="stop-color:var(--nf-shade);stop-opacity:0"/><stop offset="1" style="stop-color:var(--nf-shade);stop-opacity:.85"/></radialGradient>
  <pattern id="pScan" width="4" height="2.4" patternUnits="userSpaceOnUse"><rect width="4" height="1.1" class="c-shade" opacity=".55"/></pattern>
  <pattern id="pNoise" width="24" height="24" patternUnits="userSpaceOnUse">${Array.from({ length: 90 }, (_, i) => `<rect x="${(i * 37) % 24}" y="${((i * 53) % 24 + (i % 5) * 0.4).toFixed(1)}" width="${1 + (i % 3)}" height="1" class="c-hi" opacity="${(0.2 + ((i * 29) % 70) / 100).toFixed(2)}"/>`).join("")}</pattern>
  <linearGradient id="gPipe" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--nf-st-2)"/><stop offset=".35" style="stop-color:var(--nf-st-1)"/><stop offset=".6" style="stop-color:var(--nf-st-3)"/><stop offset="1" style="stop-color:var(--nf-rs-3)"/></linearGradient>
  <linearGradient id="gStreak" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--nf-rs-3);stop-opacity:.55"/><stop offset=".6" style="stop-color:var(--nf-grime);stop-opacity:.35"/><stop offset="1" style="stop-color:var(--nf-grime);stop-opacity:0"/></linearGradient>
  <linearGradient id="gSheet" x1="0" y1="0" x2="1" y2="0"><stop offset="0" style="stop-color:var(--nf-sheet);stop-opacity:.12"/><stop offset=".2" style="stop-color:var(--nf-sheet);stop-opacity:.3"/><stop offset=".35" style="stop-color:var(--nf-sheet);stop-opacity:.14"/><stop offset=".55" style="stop-color:var(--nf-sheet);stop-opacity:.34"/><stop offset=".7" style="stop-color:var(--nf-sheet);stop-opacity:.16"/><stop offset=".88" style="stop-color:var(--nf-sheet);stop-opacity:.3"/><stop offset="1" style="stop-color:var(--nf-sheet);stop-opacity:.18"/></linearGradient>
  <pattern id="pCork" width="30" height="30" patternUnits="userSpaceOnUse"><rect width="30" height="30" class="c-cork"/><circle cx="5" cy="7" r="1.2" class="c-wd2"/><circle cx="19" cy="4" r=".9" class="c-wd2"/><circle cx="24" cy="19" r="1.4" class="c-wd3"/><circle cx="11" cy="23" r="1" class="c-wd2"/><circle cx="16" cy="13" r=".8" class="c-wdhi"/></pattern>
</defs></svg>`;

const tv = () => `<g class="nf-tv">
  <rect x="-46" y="-2" width="14" height="5" rx="2" class="c-void"/><rect x="32" y="-2" width="14" height="5" rx="2" class="c-void"/>
  <path d="M-4 -88 L-36 -152 M4 -88 L30 -150" class="s-st2" stroke-width="2.4" stroke-linecap="round"/><circle cx="-36" cy="-152" r="2.6" class="c-st1"/><circle cx="30" cy="-150" r="2.6" class="c-st1"/>
  <ellipse cx="0" cy="-89" rx="14" ry="5" class="c-st3"/>
  <rect x="-54" y="-88" width="108" height="88" rx="12" fill="url(#gTvCase)" class="s-wd3" stroke-width="1.5"/>
  <path d="M-50 -60 q30 -3 60 0 M-50 -30 q40 3 100 -1 M20 -80 q14 2 30 -1" class="s-wd3" fill="none" stroke-width=".8" opacity=".5"/>
  <rect x="-54" y="-88" width="108" height="5" rx="2.5" class="c-hi" opacity=".07"/>
  <rect x="-49" y="-81" width="72" height="74" rx="17" class="c-tv-bezel"/>
  <rect class="tv-glass" x="-44" y="-76" width="62" height="64" rx="16" fill="url(#gTvGlass)"/>
  <g class="tv-on" clip-path="url(#cTvScreen)">
    <rect x="-44" y="-76" width="62" height="64" class="c-tv-bg"/>
    <rect x="-70" y="-100" width="110" height="110" fill="url(#pNoise)" class="tv-static"/>
    <text x="-13" y="-39" text-anchor="middle" class="tv-404">404</text>
    <text x="-13" y="-27" text-anchor="middle" class="tv-sub">PAGE NOT FOUND</text>
    <text x="-13" y="-38" text-anchor="middle" class="tv-alt">BEHIND</text><text x="-13" y="-27" text-anchor="middle" class="tv-alt">YOU</text>
    <rect x="-44" y="-76" width="62" height="64" fill="url(#pScan)" opacity=".5"/>
    <rect x="-44" y="-86" width="62" height="9" class="tv-roll"/>
    <rect x="-44" y="-76" width="62" height="64" fill="url(#gTvVig)"/>
  </g>
  <path d="M-38 -70 Q-14 -77 10 -70 Q-10 -66 -36 -61 Z" class="c-hi" opacity=".13"/><ellipse cx="6" cy="-22" rx="5" ry="2.2" class="c-hi" opacity=".08" transform="rotate(-30 6 -22)"/>
  <g class="s-void" stroke-width="1.6">${Array.from({ length: 8 }, (_, i) => `<path d="M29 ${-77 + i * 4} h18"/>`).join("")}</g>
  <circle cx="38" cy="-36" r="6.5" class="c-void"/><circle cx="38" cy="-36" r="5" class="c-st3"/><path d="M38 -36 l3 -3.5" class="s-st1" stroke-width="1.2"/>
  <circle cx="38" cy="-21" r="5" class="c-void"/><circle cx="38" cy="-21" r="3.8" class="c-st3"/><path d="M38 -21 l-2.5 -2.5" class="s-st1" stroke-width="1"/>
  <rect x="30" y="-12" width="15" height="6" rx="1.6" class="c-st2 tv-btn"/>
  <text x="-13" y="-1.5" text-anchor="middle" class="tv-brand">ZENTRON</text>
  ${rust(-40, -6, 6)}${grime(0, -84, 50, 6, .6)}
  <rect x="-56" y="-158" width="112" height="162" fill="transparent" class="tv-hit"/>
</g>`;
const pipe = () => `<path d="M-10 6 V16 M220 6 V16 M520 6 V16 M820 6 V16" class="s-st3" stroke-width="4"/>
  <rect x="-10" y="14" width="920" height="16" fill="url(#gPipe)"/>${[110, 380, 660].map((x) => `<rect x="${x}" y="11" width="12" height="22" rx="2" class="c-st3"/><circle cx="${x + 3}" cy="15" r="1.4" class="c-st2"/><circle cx="${x + 3}" cy="29" r="1.4" class="c-st2"/>`).join("")}
  ${rust(250, 26, 10)}${rust(460, 24, 14)}${rust(700, 22, 8)}`;
const streak = (x, w, len) => `<path d="M${x} 30 q${w * .4} ${len * .4} ${w * .1} ${len} h${w} q-${w * .3} -${len * .5} ${w * .2} -${len} Z" fill="url(#gStreak)"/>`;
const drip = (x, toY) => `<g class="nf-drip" style="--fall:${toY - 34}px"><path d="M${x} 34 q-3 5 0 8 q3 -3 0 -8 Z" class="c-water"/></g>
  <ellipse cx="${x}" cy="${toY}" rx="14" ry="2.6" class="c-puddle"/><ellipse class="nf-splash" cx="${x}" cy="${toY}" rx="8" ry="1.6" fill="none" style="stroke:var(--nf-frost)" stroke-width=".8"/>`;
const flypaper = () => `<path d="M0 0 V26" class="s-cord" stroke-width="1.2"/><path d="M-5 26 q3 22 0 44 q-3 22 0 46 H5 q3 -24 0 -46 q-3 -22 0 -44 Z" class="c-flypaper"/>
  ${[[0, 40], [-2, 58], [2, 75], [-1, 96], [1, 108], [0, 66]].map(([x, y]) => `<ellipse cx="${x}" cy="${y}" rx="2.2" ry="1.4" class="c-void"/><path d="M${x - 1} ${y} l-3 -2 M${x + 1} ${y} l3 -2" class="s-void" stroke-width=".6" opacity=".7"/>`).join("")}`;
const box = (w, h, label = "") => `<rect x="0" y="${-h}" width="${w}" height="${h}" class="c-box"/><rect x="0" y="${-h}" width="${w}" height="5" class="c-box2"/><path d="M${w / 2} ${-h} v${h}" class="s-box2" stroke-width="1"/><rect x="${w / 2 - 6}" y="${-h}" width="12" height="${h * .45}" class="c-tape"/>${grime(w * .5, -6, w * .5, 6, .7)}<path d="M2 ${-h + 8} l${w - 4} 2" class="s-box2" stroke-width=".6" opacity=".6"/>${label ? `<path class="nf-marker" transform="translate(${w * .24} ${-h * .38}) rotate(-3) scale(.1)" d="${MK[label]}"/>` : ""}`;
const mousetrap = () => `<rect x="-18" y="-6" width="36" height="8" rx="1" fill="url(#gWood)"/><path d="M-12 -6 V-12 H10 V-6 M-4 -6 l-4 -6" class="s-st2" fill="none" stroke-width="1.6"/><circle cx="12" cy="-4" r="2" class="c-cheese"/>`;
const gasmask = () => `<path d="M0 0 C-30 4 -36 26 -26 40 M0 0 C30 4 36 26 26 40" class="s-rubber" fill="none" stroke-width="4"/>
  <path d="M-22 22 C-28 50 -16 74 0 80 C16 74 28 50 22 22 C14 12 -14 12 -22 22 Z" class="c-rubber"/>
  <path d="M-18 26 C-12 18 12 18 18 26" class="s-rubber-hi" fill="none" stroke-width="2"/>
  <circle cx="-10" cy="38" r="9.5" class="c-st3"/><circle cx="10" cy="38" r="9.5" class="c-st3"/><circle cx="-10" cy="38" r="7.5" fill="url(#gGlass)"/><circle cx="10" cy="38" r="7.5" fill="url(#gGlass)"/>
  <ellipse cx="-12" cy="35" rx="2.6" ry="1.6" class="c-hi" opacity=".35"/><ellipse cx="8" cy="35" rx="2.6" ry="1.6" class="c-hi" opacity=".35"/>
  <rect x="-12" y="68" width="24" height="26" rx="5" class="c-olive"/><path d="M-12 74 h24 M-12 80 h24 M-12 86 h24" class="s-void" stroke-width="1" opacity=".6"/><rect x="-12" y="68" width="6" height="26" rx="3" class="c-hi" opacity=".07"/>${rust(4, 90, 4)}`;
const doll = () => `<g class="nf-doll">
  <path d="M-7 0 l-3 22 M7 0 l3 22" class="s-bn2" stroke-width="5" stroke-linecap="round"/><ellipse cx="-11" cy="24" rx="5" ry="3" class="c-void"/><ellipse cx="11" cy="24" rx="5" ry="3" class="c-void"/>
  <path d="M-18 2 Q0 8 18 2 L9 -30 H-9 Z" class="c-dress"/><path d="M-18 2 Q0 8 18 2" class="s-paint" fill="none" stroke-width="1.2" stroke-dasharray="2 2"/>
  <path d="M-9 -26 Q-20 -14 -18 -4 M9 -26 Q19 -16 16 -6" class="s-bn2" stroke-width="4" stroke-linecap="round" fill="none"/>
  <g class="nf-doll-head" transform="translate(0 -40)">
    <circle r="13" fill="url(#gBone)"/>
    <path d="M-13 -2 Q-16 -18 0 -16 Q15 -17 13 -3 Q10 -12 0 -11 Q-9 -12 -13 -2 Z" class="c-hair"/><path d="M-13 -4 Q-19 8 -15 18 M13 -4 Q18 8 14 16 M-10 -10 Q-14 4 -12 10" class="s-hair" fill="none" stroke-width="1.6"/>
    <circle cx="-5" cy="1" r="3.2" class="c-void"/><circle cx="5" cy="1" r="3.4" class="c-bn1"/><circle class="nf-doll-iris" cx="5" cy="1" r="1.8" style="fill:var(--nf-iris)"/>
    <path d="M-3 7 q3 1.6 6 0" class="s-bn3" fill="none" stroke-width="1"/><circle cx="-8" cy="6" r="2" class="c-dress" opacity=".4"/><circle cx="8" cy="6" r="2" class="c-dress" opacity=".4"/>
    <path d="M2 -12 l-3 6 l4 4 l-2 6 l3 3" class="s-bn3" fill="none" stroke-width=".9"/>
  </g></g>`;
const corkboard = () => {
  const pol = (x, y, r, scr) => G(T(x, y, r), `<rect x="-13" y="-15" width="26" height="31" class="c-paper"/><rect x="-11" y="-13" width="22" height="21" class="c-photo"/><circle cx="0" cy="-5" r="4.6" class="c-photo2"/><path d="M-8 8 Q0 -2 8 8 Z" class="c-photo2"/>
    ${scr ? `<path d="M-6 -9 l11 3 l-11 2 l11 3 l-10 2" class="s-void" fill="none" stroke-width="1.6"/>` : ""}<circle cx="0" cy="-13" r="2.4" class="c-pin"/>`);
  return `<rect x="584" y="42" width="170" height="86" rx="3" fill="url(#pCork)" class="s-wd3" stroke-width="5"/>
    ${pol(612, 74, -6, 1)}${pol(652, 92, 4, 1)}${pol(694, 70, -3, 0)}${pol(730, 96, 7, 1)}
    <path d="M612 61 L652 79 L694 57 L730 83 M612 61 L694 57" class="s-string" fill="none" stroke-width="1"/>
    <path class="nf-marker" transform="translate(676 122) rotate(-2) scale(.1)" d="${MK["WHO'S NEXT?"]}"/>`;
};
const chairBack = () => `${shadow(0, 6, 44, 6)}<rect x="-40" y="-58" width="6" height="66" class="c-wd2"/><rect x="34" y="-58" width="6" height="66" class="c-wd2"/>
  <rect x="-32" y="-128" width="7" height="132" fill="url(#gWoodH)"/><rect x="25" y="-128" width="7" height="132" fill="url(#gWoodH)"/>
  <rect x="-34" y="-128" width="68" height="13" rx="3" fill="url(#gWood)"/><rect x="-34" y="-128" width="68" height="2" class="c-hi" opacity=".1"/>
  ${[-17, -3, 11].map((x) => `<rect x="${x}" y="-115" width="6" height="48" fill="url(#gWoodH)"/>`).join("")}
  <rect x="-40" y="-66" width="80" height="9" fill="url(#gWood)"/><path d="M-30 -96 h60" class="s-wd3" stroke-width="2"/>`;
const footprint = (x, y, r, flip) => G(`${T(x, y, r)} scale(${flip} 1)`, `<ellipse cx="0" cy="0" rx="5" ry="11" class="c-foot"/><ellipse cx="-1" cy="-15" rx="4" ry="3" class="c-foot"/>${[[-4, -20], [-1, -21.5], [2, -21], [4.5, -19.5], [6, -17]].map(([a, b]) => `<circle cx="${a}" cy="${b}" r="1.4" class="c-foot"/>`).join("")}`);
const scratched = (x, y, txt, r = 0) => `<path class="nf-scratched" transform="translate(${x} ${y}) rotate(${r}) scale(.1)" d="${MK[txt]}"/>`;
const tally = (x, y, n) => { let s = ""; for (let i = 0; i < n; i++) { const g = Math.floor(i / 5), k = i % 5, bx = x + g * 30; s += k < 4 ? `<path d="M${bx + k * 5} ${y} l1 18" />` : `<path d="M${bx - 3} ${y + 14} l24 -10" />`; } return `<g class="s-paint" stroke-width="1.3" opacity=".55">${s}</g>`; };
const sheet = () => `<g class="nf-figure" transform="translate(770 560)"><path d="M-8 -238 a14 17 0 1 1 16 0 q1 6 -1 10 q22 6 30 26 q8 40 6 96 q-2 30 -8 58 l-4 -60 q-2 30 -4 108 h-12 l-4 -84 l-4 84 h-12 q-3 -70 -4 -110 l-5 62 q-6 -30 -8 -60 q-2 -56 6 -96 q8 -18 30 -24 q-3 -4 -2 -10 Z" class="c-void"/></g>
  <path d="M700 30 Q705 300 696 560 Q750 576 800 566 Q850 578 905 562 V30 Z" fill="url(#gSheet)"/>
  <path d="M716 30 Q722 300 712 560 M742 30 Q736 290 746 566 M768 30 Q776 310 764 568 M798 30 Q792 300 804 566 M828 30 Q836 320 822 570 M858 30 Q852 300 864 566" class="s-sheet" fill="none" stroke-width="1.2"/>
  <path d="M696 560 Q750 576 800 566 Q850 578 905 562 L905 590 Q850 600 800 592 Q740 600 690 586 Z" fill="url(#gSheet)"/>
  ${[706, 744, 782, 820, 858, 896].map((x) => `<rect x="${x - 3}" y="26" width="6" height="9" rx="1" class="c-st3"/>`).join("")}
  ${G(T(752, 318, -12), `<ellipse cx="0" cy="0" rx="10" ry="12" class="c-grime-hand"/>${[-7, -2.5, 2.5, 7].map((a) => `<path d="M${a} -9 l${a * .3} -14" class="s-grime-hand" stroke-width="4" stroke-linecap="round"/>`).join("")}<path d="M-10 2 l-10 -6" class="s-grime-hand" stroke-width="4" stroke-linecap="round"/><path d="M0 12 q-2 30 2 60 M6 10 q2 26 -1 44" class="s-grime-hand" fill="none" stroke-width="2.2" opacity=".6"/>`)}
  ${G(T(814, 380, 10, .9), `<ellipse cx="0" cy="0" rx="10" ry="12" class="c-grime-hand"/>${[-7, -2.5, 2.5, 7].map((a) => `<path d="M${a} -9 l${a * .3} -14" class="s-grime-hand" stroke-width="4" stroke-linecap="round"/>`).join("")}<path d="M3 12 q2 26 -1 50" class="s-grime-hand" fill="none" stroke-width="2.2" opacity=".6"/>`)}`;
// ---------- the workshop (the mockup's level 4, "Don't stay") ----------
function art() {
  const p = [];
  p.push(wall("pBlocks", grime(120, 420, 160, 60) + grime(780, 90, 140, 70, .6) + streak(150, 40, 300) + streak(470, 26, 220) + streak(700, 34, 260) + `<path d="M820 120 l-14 30 l6 18 l-10 30" class="s-cc2" fill="none" stroke-width="2"/>` + grime(450, 300, 300, 160, .5)));
  p.push(floor("pConc", "c-cc2"));
  p.push(grime(640, 540, 120, 26) + `<ellipse cx="620" cy="548" rx="34" ry="9" class="c-void"/><path d="M596 548 h48 M602 544 h36 M602 552 h36" class="s-st3" stroke-width="2"/>`);
  p.push(grime(300, 560, 160, 30, .8) + `<path d="M560 520 q30 10 40 28" class="s-grime" stroke-width="5" fill="none" opacity=".6"/>`);
  // bare footprints leading to the plastic
  p.push([[330, 590, -28, 1], [372, 566, -30, -1], [420, 548, -40, 1], [470, 534, -48, -1], [530, 522, -60, 1], [590, 512, -66, -1], [650, 504, -70, 1], [698, 498, -74, -1]].map((f) => footprint(...f)).join(""));
  p.push(pipe());
  // pegboard, the two empty outlines, the tools
  p.push(`<rect x="190" y="74" width="380" height="250" rx="3" fill="url(#pPeg)" class="s-wd3" stroke-width="4"/><rect x="190" y="74" width="380" height="250" rx="3" fill="url(#gWallFade)" opacity=".6"/>`);
  p.push(outline("M220 120 H312 Q320 120 320 130 V164 Q300 172 220 168 Z M162 134 H222 V150 H162") + `<path class="nf-scrawl" transform="translate(242 200) rotate(-4) scale(.1)" d="${MK["gone?"]}"/>`);
  p.push(outline("M528 246 h30 v52 h-30 Z") + `<path class="nf-scrawl" transform="translate(520 316) scale(.1)" d="${MK["this one too"]}"/>`);
  p.push(G(T(360, 100), hacksaw()) + G(T(250, 222, 0, .82), hammer()) + G(T(340, 238), screwdriver(64)) + G(T(366, 232), screwdriver(78, "c-handle-y")) + G(T(392, 240), screwdriver(56, "c-handle-r")) + G(T(452, 210, 0, .9), pliers()));
  p.push(G(T(512, 150), `<path d="M0 0 V6" class="s-st3" stroke-width="3"/>` + G(T(0, 6, 0, .9), gasmask()), "nf-sway", ` style="transform-origin:512px 150px"`) + nail(512, 150));
  p.push(nail(250, 220) + nail(452, 206));
  p.push(corkboard());
  // shelf: the chainsaw and the jar of eyeballs
  p.push(`<rect x="556" y="198" width="214" height="12" fill="url(#gWood)" class="s-wd3"/><path d="M574 210 v26 l20 -26 M752 210 v26 l-20 -26" class="s-st3" fill="none" stroke-width="4"/>` + shadow(663, 212, 100, 5));
  p.push(G(T(574, 160, 0, .58), chainsaw()) + G(T(738, 198, 0, .66), jar(`<circle cx="0" cy="-20" r="14" class="c-murk"/>${eyeball(-6, -26, 7)}${eyeball(7, -14, 6)}${eyeball(-4, -10, 5)}`)));
  // the breaker box with the blown fuse
  p.push(G(T(668, 330, 0, .78), breaker(true)) + `<path d="M668 377 V452" class="s-cord" stroke-width="3"/>`);
  p.push(scratched(586, 262, "DON'T", -6) + scratched(592, 284, "STAY", -4));
  // boxes
  p.push(G(T(586, 462), box(92, 56, "TAPES")) + G(T(600, 406), box(62, 34)));
  // the bench, and what's scratched in the dark under it
  p.push(`<rect x="150" y="352" width="440" height="20" fill="url(#gWood)" class="s-wd3" stroke-width="1.5"/><rect x="150" y="352" width="440" height="3" class="c-hi" opacity=".08"/><rect x="166" y="372" width="16" height="84" class="c-wd2"/><rect x="556" y="372" width="16" height="84" class="c-wd2"/><rect x="166" y="420" width="406" height="8" class="c-wd3"/>`);
  p.push(`<rect x="182" y="372" width="374" height="48" class="c-shade" opacity=".45"/>` + scratched(300, 410, "IT'S STILL HERE", -2) + tally(196, 380, 13));
  p.push(G(T(214, 352, 0, .85), vise()) + G(T(390, 320, -6, .62), handsaw()));
  p.push(G(T(516, 352), tv()) + `<path d="M570 346 q14 -2 18 10 q4 20 -10 40" class="s-cord" stroke-width="2.2"/>`);
  p.push(drip(430, 350));
  // leaning tools: the sledgehammer and the axe
  p.push(G(T(752, 452, -8, .9), `<rect x="-6" y="-200" width="12" height="200" rx="5" fill="url(#gWoodH)" class="s-wd3"/><rect x="-26" y="-224" width="52" height="30" rx="4" fill="url(#gSteel)" class="s-st3"/>${rust(-8, -210, 10)}`) + G(T(130, 236, 8, .8), axe(230)) + shadow(752, 456, 28, 4));
  p.push(G(T(668, 283, 0, .9), doll()));
  p.push(G(T(282, 548), chairBack()));
  p.push(G(T(352, 580), mousetrap()));
  // ceiling: the dead bulb, fly paper, two meat hooks
  p.push(G(T(450, -10), bulb(36), "nf-sway", ` style="transform-origin:450px -10px"`));
  p.push(G(T(330, 30), flypaper(), "nf-sway", ` style="transform-origin:330px 30px"`));
  p.push([[262, 84], [772, 150]].map(([x, len]) => G(T(x, 30), chain(len, 12, "s-rs2") + G(T(0, len), meatHook()), "nf-sway", ` style="transform-origin:${x}px 30px"`)).join(""));
  p.push(sheet());
  p.push(web(0, 0, 1, 1.1) + web(900, 0, -1, .9) + web(150, 352, 1, .5) + web(556, 210, 1, .4) + web(770, 210, -1, .35));
  return p.join("");
}

/** The level-4 room: its art, what lives in it and where the firefly likes to go. */
export const ROOM = {
  art,
  // crawlers: kind, start (scene units), heading (degrees), size
  crawlers: [
    { k: "roach", x: 300, y: 500, a: 20 }, { k: "roach", x: 520, y: 560, a: 200, s: .9 }, { k: "roach", x: 690, y: 520, a: 120, s: .8 }, { k: "centipede", x: 420, y: 530, a: -10 }, { k: "spider", x: 250, y: 560, a: 160 },
    { k: "rat", x: 640, y: 570, a: 190 }, { k: "roach", x: 380, y: 590, a: -30, s: .85 }, { k: "beetle", x: 200, y: 500, a: 40 },
    ...[[460, 500], [480, 512], [470, 524], [500, 508]].map(([x, y], i) => ({ k: "roach", x, y, a: i * 80, s: .75 })), { k: "centipede", x: 720, y: 590, a: 170, s: .9 }, { k: "spider", x: 560, y: 590, a: 30, s: .8 },
    { k: "rat", x: 240, y: 590, a: 10, s: .9 }, { k: "maggot", x: 612, y: 548, a: 0 }, { k: "maggot", x: 628, y: 544, a: 40 }, { k: "maggot", x: 620, y: 556, a: 80 }, { k: "scorpion", x: 760, y: 520, a: 200, s: .8 },
  ],
  eyes: [
    { x: 230, y: 440, tone: "red" }, { x: 860, y: 80, tone: "gold" }, { x: 60, y: 520, tone: "red" }, { x: 600, y: 452, tone: "gold", s: .7 },
    { x: 520, y: 438, tone: "red", s: .8 }, { x: 40, y: 140, tone: "gold" }, { x: 120, y: 360, tone: "red", s: 1.2 }, { x: 860, y: 300, tone: "red" },
  ],
  hangers: [{ x: 290, top: 30, rest: 72 }, { x: 700, top: 30, rest: 150 }, { x: 420, top: 30, rest: 250 }],
  pois: [[300, 110], [410, 230], [520, 230], [640, 170], [738, 170], [668, 330], [430, 360], [230, 340], [150, 260], [600, 520], [450, 60], [752, 280],
    [500, 300], [516, 300], [620, 430], [330, 90], [352, 570],
    [668, 80], [512, 200], [668, 245], [282, 470], [380, 400], [512, 200],
    [760, 300], [800, 380], [520, 530], [600, 270], [262, 140], [612, 160]],
  rest: [500, 296],   // reduced motion: the firefly rests at the TV
  motes: 22,
  grain: .1,
};

export { DEFS, DEFS2, CR };
