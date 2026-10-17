// The Map (docs/specs/boomertang.md §4d, §6; mockup boomertang-granny.html "The Map"): every hiding spot, item, creak and route in the house,
// floor by floor, in the kit's pan and zoom frame (.bt-zoomframe). Layers switch on and off; the floors change the plan; a pin opens the panel
// with its tag, Boomer's tip, the episode, Watch the short (a YouTube embed when the pin has one) and Read the room guide (Survive ?room=).
// PC 1.3.4 is the default version; the mobile layer comes later. Deep links: ?floor=base ?layer=items ?pin=p3 (the URL follows the reader).
// The layout is the placeholder plan until Boomer's drawing is traced (the badge says so). The Map stays dark in Paper and Ink.
import { zoomFrameHtml, initZoomFrame } from "../../../../shared/ui/zoomframe.js";
import { factagHtml } from "../../../../shared/ui/magazine.js";
import { toast } from "../../../../shared/ui/toast.js";

interface Floor { id: string; label: string; rooms: [number, number, number, number, string][] }
interface Layer { id: string; label: string; tone: string; on: boolean; count?: string }
interface Pin { id: string; layer: string; floor: string; x: number; y: number; room?: string; title: string; text: string; episode?: string; tag: string; source: string; platform: string; sample?: boolean; video?: { youtubeId: string; start?: number } }
interface MapData { placeholder?: boolean; version: string; size: [number, number]; floors: Floor[]; layers: Layer[]; areas: Record<string, any[]>; pins: Pin[] }

const MAPS = import.meta.glob("../../data/boomertang/*-map.json", { eager: true, import: "default" }) as Record<string, MapData>;
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export function mountMap(host: HTMLElement, ctx: { hrefFor: (slug: string) => string; sources: Record<string, { title: string; version?: string }> }) {
  const data = MAPS[`../../data/boomertang/${host.dataset.map}`];
  if (!data || host.dataset.mounted) return;
  host.dataset.mounted = "1";
  const [W, H] = data.size;
  const q = new URLSearchParams(location.search);
  const layersOn: Record<string, boolean> = Object.fromEntries(data.layers.map((l) => [l.id, l.on]));
  const qLayer = q.get("layer"); if (qLayer && qLayer in layersOn) layersOn[qLayer] = true;
  let floor = data.floors.some((f) => f.id === q.get("floor")) ? q.get("floor")! : data.floors[0].id;
  let pin = data.pins.find((p) => p.id === q.get("pin")) || null;
  if (pin) { floor = pin.floor; layersOn[pin.layer] = true; }
  if (!pin) pin = data.pins.find((p) => p.floor === floor && layersOn[p.layer]) || null;
  const counts = (id: string) => data.pins.filter((p) => p.layer === id).length;

  host.innerHTML = `<div class="tg-mapgrid">
    <div class="tg-layers"><h2 class="tg-maph">Layers</h2>${data.layers.map((l) => `<button type="button" class="tg-layer tg-tone--${esc(l.tone)}" data-layer="${esc(l.id)}" aria-pressed="false"><i aria-hidden="true"></i>${esc(l.label)}<em>${esc(l.count ?? counts(l.id))}</em></button>`).join("")}
      <h2 class="tg-maph">Floor</h2><div class="tg-floors" role="group" aria-label="Floor">${data.floors.map((f) => `<button type="button" class="bt-chip bt-chip--small" data-floor="${esc(f.id)}" aria-pressed="false">${esc(f.label)}</button>`).join("")}</div>
      <h2 class="tg-maph">Version</h2><div class="tg-floors" role="group" aria-label="Version"><button type="button" class="bt-chip bt-chip--small is-active" aria-pressed="true">${esc(data.version)}</button><button type="button" class="bt-chip bt-chip--small" data-mobile aria-pressed="false">Mobile</button></div></div>
    <div class="tg-plan">${zoomFrameHtml({ width: W, height: H, label: "Top-down map of Granny's house", hint: "Click, then scroll to zoom · drag to pan", svgClass: "tg-plan-svg" })}${data.placeholder ? '<span class="tg-plan-badge">Placeholder layout: Boomer draws the real house</span>' : ""}</div>
    <div class="tg-pinpanel" aria-live="polite"></div>
  </div>`;
  const svg = host.querySelector<SVGSVGElement>(".tg-plan-svg")!;
  const panel = host.querySelector<HTMLElement>(".tg-pinpanel")!;
  const frame = host.querySelector<HTMLElement>(".bt-zoomframe")!;

  function draw() {
    const f = data.floors.find((x) => x.id === floor)!;
    const grid = Array.from({ length: W / 50 + 1 }, (_, i) => `<line x1="${i * 50}" y1="0" x2="${i * 50}" y2="${H}"/>`).join("") + Array.from({ length: H / 50 + 1 }, (_, i) => `<line x1="0" y1="${i * 50}" x2="${W}" y2="${i * 50}"/>`).join("");
    const rooms = f.rooms.map(([x, y, w, h, n]) => `<rect class="room" x="${x}" y="${y}" width="${w}" height="${h}"/><text class="room-l" x="${x + 12}" y="${y + 22}">${esc(n)}</text>`).join("");
    const on = (id: string) => layersOn[id];
    const creak = on("creak") ? (data.areas.creak || []).filter((a) => a.floor === floor).map((a) => `<rect class="creak" x="${a.x}" y="${a.y}" width="${a.w}" height="${a.h}"/>`).join("") : "";
    const heat = on("deaths") ? (data.areas.deaths || []).filter((a) => a.floor === floor).map((a) => `<circle class="heat" cx="${a.x}" cy="${a.y}" r="${a.r}"/>`).join("") : "";
    const route = on("route") ? (data.areas.route || []).filter((a) => a.floor === floor).map((a) => `<path class="route" d="${esc(a.d)}"/>`).join("") : "";
    const tone = Object.fromEntries(data.layers.map((l) => [l.id, l.tone]));
    const pins = data.pins.filter((p) => p.floor === floor && on(p.layer)).map((p) => `<g class="pin tg-tone--${esc(tone[p.layer])}${pin?.id === p.id ? " is-on" : ""}" tabindex="0" role="button" aria-label="${esc(p.title)}" aria-pressed="${pin?.id === p.id}" data-pin="${esc(p.id)}"><circle cx="${p.x}" cy="${p.y}" r="8"/></g>`).join("");
    svg.innerHTML = `<g class="grid">${grid}</g>${rooms}${creak}${heat}${route}${pins}`;
    svg.setAttribute("aria-label", `Top-down map of Granny's house, ${f.label}`);
    zf.setMap(`<g class="grid">${grid}</g>${rooms}`);
    host.querySelectorAll<HTMLElement>("[data-layer]").forEach((b) => b.setAttribute("aria-pressed", String(!!layersOn[b.dataset.layer!])));
    host.querySelectorAll<HTMLElement>("[data-floor]").forEach((b) => { const cur = b.dataset.floor === floor; b.setAttribute("aria-pressed", String(cur)); b.classList.toggle("is-active", cur); });
    drawPanel();
    const u = new URL(location.href);
    u.searchParams.set("floor", floor); if (pin) u.searchParams.set("pin", pin.id); else u.searchParams.delete("pin");
    history.replaceState(history.state, "", u);
  }
  function drawPanel() {
    if (!pin) { panel.innerHTML = `<h2 class="tg-maph">${esc(data.floors.find((x) => x.id === floor)!.label)}</h2><p>No pins on this floor in the layers you have on. Switch a layer on, or tap another floor.</p>`; return; }
    const src = ctx.sources[pin.source];
    const guide = pin.room ? `<a class="bt-btn bt-btn--secondary bt-btn--sm" href="${esc(ctx.hrefFor("survive"))}?room=${esc(pin.room)}">Read the room guide</a>` : "";
    const watch = pin.video ? `<button type="button" class="bt-btn bt-btn--primary" data-watch-pin data-pulse="tang-watch-short">▶ Watch the short</button>` : `<button type="button" class="bt-btn bt-btn--primary" disabled>Short coming soon</button>`;
    panel.innerHTML = `<h2 class="tg-maph">${esc(data.floors.find((x) => x.id === pin!.floor)!.label)}</h2><h3>${esc(pin.title)}</h3>`
      + `<div>${factagHtml({ trust: pin.tag, version: pin.tag === "ver" ? src?.version || "" : "", href: src ? `${ctx.hrefFor("the-index")}#src-${pin.source}` : "", sourceTitle: src?.title || "" })}${pin.sample ? ' <span class="tg-sample">Sample text</span>' : ""}</div>`
      + `<p>${esc(pin.text)}</p><div class="tg-thumbv" data-thumb><span>Short</span><i aria-hidden="true">▶</i></div>${pin.episode ? `<p class="tg-meta">${esc(pin.episode)}</p>` : ""}${watch}${guide}`;
    panel.querySelector("[data-watch-pin]")?.addEventListener("click", () => {
      const v = pin!.video!;
      panel.querySelector<HTMLElement>("[data-thumb]")!.innerHTML = `<iframe src="https://www.youtube-nocookie.com/embed/${encodeURIComponent(v.youtubeId)}?start=${v.start || 0}&autoplay=1&rel=0" title="${esc(pin!.title)}: the short" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe>`;
    });
  }
  const select = (id: string, fly = false) => {
    const p = data.pins.find((x) => x.id === id); if (!p) return;
    pin = p; draw();
    if (fly && !matchMedia("(prefers-reduced-motion: reduce)").matches) zf.flyTo(p.x, p.y, W / 2.2);
    svg.querySelector<SVGGElement>(`[data-pin="${CSS.escape(id)}"]`)?.focus({ preventScroll: true });
  };
  const zf = initZoomFrame(frame, { width: W, height: H, minWidth: W / 5, itemSelector: ".pin", onTap: (_e: Event, item: Element | null) => { if (item) select((item as HTMLElement).dataset.pin!); } });
  svg.addEventListener("keydown", (e) => {
    const g = (e.target as Element).closest?.<SVGGElement>(".pin");
    if (g && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); select(g.dataset.pin!); }
  });
  host.addEventListener("click", (e) => {
    const t = e.target as Element;
    const lb = t.closest<HTMLElement>("[data-layer]");
    if (lb) { const id = lb.dataset.layer!; layersOn[id] = !layersOn[id]; if (pin && !layersOn[pin.layer]) pin = data.pins.find((p) => p.floor === floor && layersOn[p.layer]) || null; draw(); return; }
    const fb = t.closest<HTMLElement>("[data-floor]");
    if (fb) { floor = fb.dataset.floor!; pin = data.pins.find((p) => p.floor === floor && layersOn[p.layer]) || null; zf.fit(); draw(); return; }
    if (t.closest("[data-mobile]")) toast("The mobile version differs from PC; its layer is added later.", { kind: "info", ms: 4200 });
  });
  draw();
  if (q.get("pin") && pin) select(pin.id, true);
}
