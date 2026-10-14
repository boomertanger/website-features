// shared/ui/patch.js — patchHTML(el, html): update el's contents to match html by changing only what differs, instead of el.innerHTML = html.
// Live pages redraw their panels from fresh data many times a minute; replacing a whole list or panel throws away the nodes under the reader
// (scroll anchoring, a focused input and its caret, an open <details>, listeners wired after the last draw). This keeps every node that
// still matches and patches its text and attributes in place, so the page never moves and focus stays where it is.
//
//   patchHTML(el, html)                 the new markup for el's children
//
// Matching: an element is the same as an old one when the tag matches and so does its key (id, data-key, data-id, data-slot or data-pick,
// whichever it has); keyed children are matched across reorders, the rest by position.
// Kept as they are:
//   - a focused input / textarea / select: its value, selection and checked state (you keep typing); an unfocused one is updated only when
//     the value in the markup changed (unsaved typing elsewhere stays)
//   - the children of an element marked data-patch="own" (another script mounts its content there: a run panel, a drop panel)
//   - init markers other scripts set (data-*-ready, data-*-wired, data-*-done, data-wired, data-done) when the new markup lacks them, so
//     their init stays idempotent and nothing is bound twice; and properties set on nodes (they are the same nodes)

const KEY_ATTRS = ["id", "data-key", "data-id", "data-slot", "data-pick"];
const KEEP_ATTR = /^data-(?:[\w-]*-)?(?:ready|wired|done)$/;
const keyOf = (n) => { if (n.nodeType !== 1) return null; for (const a of KEY_ATTRS) { const v = n.getAttribute(a); if (v) return `${a}=${v}`; } return null; };
const same = (a, b) => a.nodeType === b.nodeType && (a.nodeType !== 1 || (a.tagName === b.tagName && keyOf(a) === keyOf(b)));
const isField = (n) => n.nodeType === 1 && (n.tagName === "INPUT" || n.tagName === "TEXTAREA" || n.tagName === "SELECT");

export function patchHTML(el, html) {
  if (!el) return;
  const t = document.createElement("template");
  t.innerHTML = html;
  patchChildren(el, t.content);
}

function patchChildren(from, to) {
  const olds = [...from.childNodes];
  const keyed = new Map();
  for (const n of olds) { const k = keyOf(n); if (k && !keyed.has(k)) keyed.set(k, n); }
  const used = new Set();
  let at = 0;
  for (const nn of [...to.childNodes]) {
    const k = keyOf(nn);
    let match = null;
    if (k) { const o = keyed.get(k); if (o && !used.has(o) && same(o, nn)) match = o; }
    else {
      // the next unused, unkeyed old node of the same kind
      for (let j = at; j < from.childNodes.length; j++) {
        const o = from.childNodes[j];
        if (used.has(o)) continue;
        if (keyOf(o)) continue;
        if (same(o, nn)) match = o;
        break;
      }
    }
    const here = from.childNodes[at] || null;
    if (match) {
      used.add(match);
      if (match !== here) from.insertBefore(match, here);
      patchNode(match, nn);
    } else {
      from.insertBefore(nn, here);   // a new node (moved out of the template)
      used.add(nn);
    }
    at++;
  }
  // whatever is left over is gone from the markup
  for (const o of [...from.childNodes]) if (!used.has(o)) o.remove();
}

function patchNode(a, b) {
  if (a.nodeType !== 1) { if (a.nodeValue !== b.nodeValue) a.nodeValue = b.nodeValue; return; }
  const focused = isField(a) && a === document.activeElement;
  // attributes
  for (const { name } of [...a.attributes]) if (!b.hasAttribute(name) && !KEEP_ATTR.test(name) && !(focused && (name === "value" || name === "checked"))) a.removeAttribute(name);
  for (const { name, value } of [...b.attributes]) {
    if (a.getAttribute(name) === value) continue;
    if (isField(a) && (name === "value" || name === "checked")) {
      if (focused) continue;
      a.setAttribute(name, value);
      if (name === "value" && a.tagName !== "SELECT") a.value = value; else if (name === "checked") a.checked = true;
      continue;
    }
    a.setAttribute(name, value);
  }
  if (isField(a) && a.tagName === "INPUT" && !b.hasAttribute("checked") && a.hasAttribute("checked") && !focused) { a.removeAttribute("checked"); a.checked = false; }
  if (a.getAttribute("data-patch") === "own") return;
  if (a.tagName === "TEXTAREA") { if (!focused && a.defaultValue !== b.defaultValue) { a.defaultValue = b.defaultValue; a.value = b.defaultValue; } return; }
  patchChildren(a, b);
  if (a.tagName === "SELECT" && !focused) { const sel = b.querySelector("option[selected]"); if (sel) a.value = sel.value; }
}
