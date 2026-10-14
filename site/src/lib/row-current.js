// The phone link row's first-paint script (docs/design-system.md §5 "Feature bars"; kit .bt-topbar--rows). Rendered inline right after a
// feature bar's .bt-seg-nav (<script is:inline set:html={ROW_CURRENT} />), it runs while the page is still parsing, before first paint:
//   1. marks the link for this URL as the current one (aria-current="page"): the same path, and every query value the link has matches
//      (so /live?how=1 beats /live on the How it works view); with no exact match the server's choice stays (/crew/tasks under HQ)
//   2. scrolls the row so that link is in view (centred), instantly: no animation and no reset to the start
// shared/ui/seg-nav.js then keeps it there. Plain ES5, no imports: it is inlined as text.
export const ROW_CURRENT = `(function (s) {
  var n = s && s.previousElementSibling;
  if (!n || !n.querySelectorAll) return;
  var here = location.pathname.replace(/[/]+$/, "") || "/", q = new URLSearchParams(location.search), best = null, bestN = -1;
  [].forEach.call(n.querySelectorAll("a[href]"), function (a) {
    var u = new URL(a.getAttribute("href"), location.href), ok = (u.pathname.replace(/[/]+$/, "") || "/") === here, k = 0;
    u.searchParams.forEach(function (v, key) { k++; if (q.get(key) !== v) ok = false; });
    if (ok && k > bestN) { best = a; bestN = k; }
  });
  if (best) [].forEach.call(n.querySelectorAll("a"), function (a) { if (a === best) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current"); });
  var c = n.querySelector('a[aria-current="page"]');
  if (c && c.offsetWidth && n.scrollWidth > n.clientWidth + 1) n.scrollLeft = Math.max(0, c.offsetLeft - (n.clientWidth - c.offsetWidth) / 2);
})(document.currentScript);`;
