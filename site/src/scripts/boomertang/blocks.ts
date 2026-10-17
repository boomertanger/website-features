// The interactive magazine blocks on a Boomertang page (docs/specs/boomertang.md §4b, §6), wired once the page body is in place (static for
// public issues, rendered from Firestore for members-only ones). Each block finds its own markup and is a no-op when it isn't on the page.
import { initRedact } from "../../../../shared/ui/magazine.js";

export interface BlockCtx { issueId: string; slug: string; hrefFor: (slug: string) => string; sources: Record<string, { title: string; version?: string }> }

export function wireBlocks(scope: HTMLElement, ctx: BlockCtx) {
  initRedact(scope);
  wireTree(scope);
  wireRooms(scope);
  const map = scope.querySelector<HTMLElement>(".tg-mapapp[data-map]");
  if (map) void import("./map").then((m) => m.mountMap(map, { hrefFor: ctx.hrefFor, sources: ctx.sources }));
  const polls = scope.querySelector<HTMLElement>("[data-polls]");
  if (polls) void import("./verdict").then((m) => m.mountVerdict(polls, ctx.issueId));
}

/**
 * Survive (S1 Room by room): the floor chips show that floor's rooms; tapping a room opens its guide under the row it's in (tap again
 * closes). ?room=<id> opens a room straight away (from The Map's "Read the room guide"); the URL follows. Watch the short plays the room's
 * episode short in place when it has one.
 */
function wireRooms(scope: HTMLElement) {
  const grid = scope.querySelector<HTMLElement>("[data-rooms]");
  if (!grid) return;
  const rooms = Array.from(grid.querySelectorAll<HTMLButtonElement>(".tg-room"));
  const guides = Array.from(grid.querySelectorAll<HTMLElement>(".tg-guide"));
  const chips = Array.from(scope.querySelectorAll<HTMLButtonElement>(".tg-chip[data-floor]"));
  const guideOf = (r: HTMLElement) => grid.querySelector<HTMLElement>(`#${CSS.escape(r.getAttribute("aria-controls") || "")}`);
  // Watch the short: no video linked yet means the button says so
  guides.forEach((g) => {
    const v = g.querySelector<HTMLElement>("[data-video]"), btn = g.querySelector<HTMLButtonElement>("[data-watch]");
    if (!btn) return;
    if (!v?.dataset.video) { btn.disabled = true; btn.textContent = "Short coming soon"; return; }
    btn.addEventListener("click", () => { v!.insertAdjacentHTML("beforeend", `<iframe src="https://www.youtube-nocookie.com/embed/${encodeURIComponent(v!.dataset.video!)}?autoplay=1&rel=0" title="The episode short" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe>`); }, { once: true });
  });
  const setUrl = (room: string | null) => { const u = new URL(location.href); if (room) u.searchParams.set("room", room); else u.searchParams.delete("room"); history.replaceState(history.state, "", u); };
  function showFloor(f: string) {
    chips.forEach((c) => c.setAttribute("aria-pressed", String(c.dataset.floor === f)));
    rooms.forEach((r) => { r.hidden = r.dataset.floor !== f; });
    open(null);
  }
  function open(room: HTMLButtonElement | null, scroll = false) {
    rooms.forEach((r) => r.setAttribute("aria-expanded", String(r === room)));
    guides.forEach((g) => { g.hidden = true; });
    if (!room) { setUrl(null); return; }
    const g = guideOf(room)!;
    // under the row: after the last visible room that shares this room's top
    const top = room.offsetTop;
    const rowEnd = rooms.filter((r) => !r.hidden && r.offsetTop === top).at(-1)!;
    rowEnd.after(g);
    g.hidden = false;
    setUrl(room.dataset.room!);
    if (scroll) g.scrollIntoView({ block: "nearest", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }
  chips.forEach((c) => c.addEventListener("click", () => showFloor(c.dataset.floor!)));
  rooms.forEach((r) => r.addEventListener("click", () => open(r.getAttribute("aria-expanded") === "true" ? null : r, true)));
  const want = rooms.find((r) => r.dataset.room === new URLSearchParams(location.search).get("room"));
  showFloor(want ? want.dataset.floor! : chips[0]?.dataset.floor || "");
  if (want) { open(want); requestAnimationFrame(() => want.scrollIntoView({ block: "start" })); }
}

/** The Family: tap anyone for what the games say and the source (one at a time; tap again to close). */
function wireTree(scope: HTMLElement) {
  const people = Array.from(scope.querySelectorAll<HTMLButtonElement>(".tg-person[data-person]"));
  if (!people.length) return;
  const show = (btn: HTMLButtonElement | null) => {
    for (const p of people) {
      const on = p === btn;
      p.setAttribute("aria-expanded", String(on));
      const say = scope.querySelector<HTMLElement>(`#${CSS.escape(p.getAttribute("aria-controls") || "")}`);
      if (say) say.hidden = !on;
    }
  };
  people.forEach((p) => p.addEventListener("click", () => show(p.getAttribute("aria-expanded") === "true" ? null : p)));
}
