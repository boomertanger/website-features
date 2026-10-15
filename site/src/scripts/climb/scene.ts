// Creator Climb hero, H1-D Summit camp (docs/specs/creator-climb.md §6; mockup creator-climb.html heroRidge + RIDGE.d). An SVG (aspect-ratio,
// never a fixed height): the ridge is the combined month-end line from January 2025 to the last reading over a far ridge, stars and the moon;
// after the last reading it levels off into fog (never drawn as a drop). Tents and campfires where the early eras began, a flag at every
// thousand (lit gold in order on load), and on the summit the cabin being built, labelled with the current era. Once Back on air has a start
// date the cabin is finished, a new tent marks the Back on air camp, and a dark hill rises from it with the teal members trail (its own scale)
// and a teal flag at every 100 members; the untracked gap is drawn short (about 45 days) so the relaunch has room (charts keep true time).
// The real mascot stands at the last reading. Scrub the climb: hover or drag along the scene, or arrows / Home / End (role="slider" with value
// text): the mascot moves to that month, onScrub reports it (the page shows that month's total), flags light up to that point and a gold month
// pill sits over the mascot; Esc, leaving or letting go (1.4 s on touch) returns it to the summit. Reduced motion: no movement, values change.
import { type Public, ms, fmt, monthLabel, todayMs, escapeHtml as esc } from "./data";

const RW = 760, RH = 420, DAY = 864e5, GAP_DRAWN = 45 * DAY;
const reduce = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const path = (a: [number, number][]) => a.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join("");
const niceCeil = (v: number) => { const step = v > 5000 ? 2000 : v > 1000 ? 1000 : 100; return Math.max(step, Math.ceil(v / step) * step); };

export interface ScrubPoint { key: string; value: number; last: boolean }
export interface SceneOpts { onScrub: (p: ScrubPoint | null) => void }

export function drawScene(host: HTMLElement, p: Public, o: SceneOpts) {
  const rows = p.monthEnd.filter((r) => r.all != null);
  if (!rows.length) { host.innerHTML = ""; return; }
  const back = p.eras.find((e) => e.id === "back-on-air" && e.from) || null;
  const finished = !!back;
  const gap = p.gaps[0] || null;
  const g0 = gap ? ms(gap.from) : null, g1 = gap ? (gap.to ? ms(gap.to) : back ? ms(back.from!) : null) : null;
  const T0 = Date.UTC(2025, 0, 1), T1 = Math.max(todayMs(), ms(rows[rows.length - 1].day));
  // the hero only: once relaunched, the untracked gap is drawn about 45 days wide
  const adj = (t: number) => (!finished || g0 == null || g1 == null || t <= g0 ? t : t < g1 ? g0 + ((t - g0) * GAP_DRAWN) / (g1 - g0) : t - (g1 - g0 - GAP_DRAWN));
  const rx = (t: number) => 40 + ((adj(t) - T0) / (adj(T1) - T0 || 1)) * (RW - 80);
  const maxV = Math.max(...rows.map((r) => r.all!));
  const scale = niceCeil(maxV * 1.08);
  const ry = (v: number) => RH - 70 - (v / scale) * 270;
  const pts = rows.map((r) => ({ x: rx(ms(r.day)), y: ry(r.all!), v: r.all!, key: r.month, day: r.day }));
  const last = pts[pts.length - 1];
  const before = g0 != null ? pts.filter((q) => q.day <= gap!.from) : pts;
  const after = g0 != null ? pts.filter((q) => q.day > gap!.from) : [];
  const preLast = before[before.length - 1] || last;
  // the ridge: never a drop after the last reading; across the drawn gap it rests, then climbs on from the first automatic reading
  let ridge: [number, number][];
  if (finished && after.length) {
    const f = after[0];
    ridge = [...before.map((q) => [q.x, q.y] as [number, number]), [preLast.x + 18, preLast.y + 6], [f.x - 14, Math.max(preLast.y + 4, f.y)], [f.x - 6, f.y + 6], ...after.map((q) => [q.x, q.y] as [number, number])];
  } else ridge = pts.map((q) => [q.x, q.y]);
  const top = path([[-10, RH - 60], [40, pts[0].y + 8], ...ridge]) + (finished ? ` L${RW + 10} ${last.y - 4}` : ` L${last.x + 18} ${last.y + 6} L${Math.min(last.x + 60, RW)} ${last.y + 4} L${RW + 10} ${last.y + 10}`);
  const fill = `${top} L${RW + 10} ${RH + 10} L-10 ${RH + 10}Z`;
  // flags at every thousand where the line crosses it
  const crossings: { v: number; x: number; y: number }[] = [];
  for (let v = 1000; v <= maxV; v += 1000) for (let i = 1; i < pts.length; i++) { const a = pts[i - 1], b = pts[i]; if (a.v < v && b.v >= v) { const f = (v - a.v) / (b.v - a.v); crossings.push({ v, x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f }); break; } }
  const rnd = (i: number) => Math.abs((Math.sin(i * 99.13) * 10000) % 1);
  let stars = ""; for (let i = 1; i <= 30; i++) stars += `<circle class="cc-star" cx="${(rnd(i) * RW).toFixed(1)}" cy="${(rnd(i + 50) * 150).toFixed(1)}" r="${(rnd(i + 7) * 1.3 + 0.4).toFixed(2)}"/>`;
  const far = `<path class="cc-ridge-far" d="M-10 ${RH - 120} L90 ${RH - 170} L180 ${RH - 140} L300 ${RH - 230} L410 ${RH - 180} L520 ${RH - 300} L640 ${RH - 220} L770 ${RH - 260} L770 ${RH} L-10 ${RH}Z"/>`;
  const fog = finished && after.length
    ? `<ellipse class="cc-fog" cx="${(preLast.x + after[0].x) / 2}" cy="${preLast.y + 6}" rx="${(after[0].x - preLast.x) / 2 + 30}" ry="40"/><ellipse class="cc-fog" cx="160" cy="${RH - 40}" rx="260" ry="34"/>`
    : `<ellipse class="cc-fog" cx="${RW - 40}" cy="${last.y + 4}" rx="110" ry="46"/><ellipse class="cc-fog" cx="${RW - 10}" cy="${last.y + 60}" rx="140" ry="60"/><ellipse class="cc-fog" cx="160" cy="${RH - 40}" rx="260" ry="34"/>`;
  const tent = (x: number, y: number, k: string, anchor: "start" | "middle") => `<g class="cc-camp"><path class="cc-tent" d="M${x - 16} ${y} L${x} ${y - 22} L${x + 16} ${y}Z M${x} ${y - 22} L${x - 4} ${y}"/><circle class="cc-fire" cx="${x + 26}" cy="${y - 3}" r="3.5"/><path class="cc-smoke" d="M${x + 26} ${y - 8} q -6 -10 2 -18 q 8 -8 0 -18"/><text class="cc-era-k" x="${anchor === "start" ? x - 20 : x}" y="${y + 18}" text-anchor="${anchor}">${esc(k)}</text></g>`;
  const flag = (c: { v: number; x: number; y: number }) => `<g class="cc-mark" data-v="${c.v}"><line class="cc-pole" x1="${c.x}" y1="${c.y}" x2="${c.x}" y2="${c.y - 24}"/><path class="cc-flag" d="M${c.x} ${c.y - 24} l14 4 l-14 4Z"/><text class="cc-lantern-k" x="${c.x + 3}" y="${c.y - 29}">${c.v / 1000}K</text></g>`;
  // camps: where each era before the current one began (the month-end just before it, or the first reading)
  const dated = p.eras.filter((e) => e.from && e.id !== "back-on-air").sort((a, b) => (a.from! < b.from! ? -1 : 1));
  const current = finished ? null : dated[dated.length - 1] || null;
  const camps = dated.filter((e) => e !== current && e.id !== "the-build").map((e, i) => {
    const at = [...pts].reverse().find((q) => q.day < e.from!) || pts[0];
    return tent(i === 0 ? 64 : at.x + 2, (i === 0 ? pts[0].y : at.y) + (i === 0 ? 6 : 1), e.label, i === 0 ? "start" : "middle");
  }).join("");
  // the cabin on the summit: being built (scaffolding, crane, one lit window) until Back on air, then finished with the Back on air camp
  const s = finished && after.length ? { x: after[0].x - 52, y: Math.max(preLast.y, after[0].y) + 4 } : last;
  const cx = s.x + 40 > RW - 60 ? RW - 100 : s.x + 40, cy = s.y + 5;
  const cabin = finished
    ? `<g class="cc-cabin is-done"><path class="cc-cabin-wall" d="M${cx - 2} ${cy} L${cx - 2} ${cy - 24} L${cx + 30} ${cy - 24} L${cx + 30} ${cy}Z"/><path class="cc-roof cc-roof--done" d="M${cx - 8} ${cy - 22} L${cx + 14} ${cy - 42} L${cx + 36} ${cy - 22}Z"/><rect class="cc-win is-lit" x="${cx + 3}" y="${cy - 17}" width="8" height="8" rx="1.5"/><rect class="cc-win is-lit" x="${cx + 17}" y="${cy - 17}" width="8" height="8" rx="1.5"/></g>${after.length ? tent(after[0].x + 44, after[0].y + 6, back!.label, "middle") : ""}`
    : `<g class="cc-cabin"><path class="cc-cabin-wall" d="M${cx - 2} ${cy} L${cx - 2} ${cy - 26} L${cx + 30} ${cy - 26} L${cx + 30} ${cy}Z"/><path class="cc-scaff" d="M${cx - 6} ${cy} L${cx - 6} ${cy - 44} M${cx + 34} ${cy} L${cx + 34} ${cy - 44} M${cx - 6} ${cy - 36} L${cx + 34} ${cy - 36} M${cx - 6} ${cy - 18} L${cx + 34} ${cy - 18} M${cx - 6} ${cy - 36} L${cx + 34} ${cy - 18}"/><path class="cc-roof" d="M${cx - 6} ${cy - 26} L${cx + 14} ${cy - 44} L${cx + 22} ${cy - 37}"/><rect class="cc-win is-lit" x="${cx + 8}" y="${cy - 19}" width="9" height="9" rx="1.5"/><line class="cc-pole" x1="${cx + 52}" y1="${cy + 2}" x2="${cx + 52}" y2="${cy - 70}"/><path class="cc-pole" d="M${cx + 52} ${cy - 70} L${cx + 8} ${cy - 70} M${cx + 14} ${cy - 70} L${cx + 14} ${cy - 54}"/><text class="cc-era-k" x="${cx + 14}" y="${cy - 78}" text-anchor="middle">${esc(current ? current.label : "")}</text></g>`;
  // the members hill: its own scale, from the Back on air camp to the right edge
  let hill = "";
  const mem = p.members;
  if (finished && mem && mem.monthEnd.length) {
    const x0 = (after[0] ? after[0].x : last.x) - 10, x1 = RW + 10, base = RH + 2, top = Math.max(...mem.monthEnd.map((m) => m.total), mem.total || 0, 1);
    const mh = (v: number) => base - 22 - (v / top) * 150;
    const mpts: [number, number][] = mem.monthEnd.map((m) => [rx(ms(m.day)), mh(m.total)]);
    const d = path([[x0, base], [x0 + 6, mh(0)], ...mpts, [x1, mh(mem.total || 0) - 2]]);
    const flags: string[] = [];
    for (let v = 100; v <= (mem.total || 0); v += 100) { const hit = mem.monthEnd.find((m) => m.total >= v); if (hit) { const x = rx(ms(hit.day)), y = mh(hit.total); flags.push(`<g class="cc-mark" data-v="0"><line class="cc-pole" x1="${x}" y1="${y}" x2="${x}" y2="${y - 18}"/><path class="cc-mflag" d="M${x} ${y - 18} l11 3 l-11 3Z"/><text class="cc-mflag-k" x="${x + 3}" y="${y - 22}">${v}</text></g>`); } }
    hill = `<path class="cc-mhill" d="${d} L${x1} ${base + 10} L${x0} ${base + 10}Z"/><path class="cc-mtrail" d="${path([[x0 + 6, mh(0)], ...mpts])}"/>${flags.join("")}<text class="cc-mhill-k" x="${RW - 18}" y="${base - 30}" text-anchor="end">Members ${fmt(mem.total)}</text>${mem.staging ? `<text class="cc-era-k" x="${RW - 18}" y="${base - 12}" text-anchor="end">Staging</text>` : ""}`;
  }
  host.innerHTML = `<svg class="cc-art" viewBox="0 0 ${RW} ${RH}" aria-hidden="true" focusable="false"><defs><linearGradient id="cc-rock" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="cc-rock-0"/><stop offset="1" class="cc-rock-1"/></linearGradient></defs>${stars}<circle class="cc-moon" cx="150" cy="80" r="30"/>${far}<path class="cc-ridge" d="${fill}" style="stroke:none"/><path class="cc-ridge" d="${top}" style="fill:none"/>${camps}${crossings.map(flag).join("")}${cabin}${fog}${hill}</svg><span class="cc-scrub-k" aria-hidden="true"></span>`;
  const tpl = document.getElementById("bt-mascot-tpl");
  const climber = document.createElement("span");
  climber.className = "cc-climber";
  climber.setAttribute("aria-hidden", "true");
  climber.innerHTML = tpl ? tpl.innerHTML : "";
  host.appendChild(climber);
  host.setAttribute("role", "slider");
  host.tabIndex = 0;
  host.setAttribute("aria-label", "The climb: drag along the ridge, or use the arrow keys, to see the total at the end of each month");
  host.setAttribute("aria-valuemin", "0");
  host.setAttribute("aria-valuemax", String(pts.length - 1));
  const marks = [...host.querySelectorAll<SVGGElement>(".cc-mark")];
  const pill = host.querySelector<HTMLElement>(".cc-scrub-k")!;
  const place = (i: number, lit?: number) => {
    const q = pts[i];
    climber.style.left = `${(q.x / RW) * 100}%`; climber.style.top = `${(q.y / RH) * 100}%`;
    marks.forEach((g) => g.classList.toggle("is-lit", Number(g.dataset.v) <= (lit ?? q.v)));
    host.setAttribute("aria-valuenow", String(i));
    host.setAttribute("aria-valuetext", `${monthLabel(q.key, true)}: ${fmt(q.v)} followers`);
  };
  let cur = pts.length - 1, scrubbing = false, restTimer = 0;
  const scrub = (i: number) => {
    cur = Math.max(0, Math.min(pts.length - 1, i)); scrubbing = true; host.classList.add("is-scrub");
    place(cur);
    const q = pts[cur];
    pill.textContent = monthLabel(q.key);
    pill.style.left = `${(q.x / RW) * 100}%`; pill.style.top = `${(q.y / RH) * 100}%`;
    o.onScrub({ key: q.key, value: q.v, last: cur === pts.length - 1 });
  };
  const rest = () => { if (!scrubbing) return; scrubbing = false; host.classList.remove("is-scrub"); cur = pts.length - 1; place(cur); o.onScrub(null); };
  const nearest = (clientX: number) => { const r = host.getBoundingClientRect(); const x = ((clientX - r.left) / r.width) * RW; let best = 0; pts.forEach((q, i) => { if (Math.abs(q.x - x) < Math.abs(pts[best].x - x)) best = i; }); return best; };
  host.onpointermove = (e) => { if (e.pointerType !== "mouse" && !e.buttons) return; clearTimeout(restTimer); scrub(nearest(e.clientX)); };
  host.onpointerdown = (e) => { clearTimeout(restTimer); try { host.setPointerCapture(e.pointerId); } catch { /* fine */ } scrub(nearest(e.clientX)); };
  host.onpointerleave = (e) => { if (e.pointerType === "mouse") rest(); };
  host.onpointerup = (e) => { if (e.pointerType !== "mouse") { clearTimeout(restTimer); restTimer = window.setTimeout(rest, 1400); } };
  host.onkeydown = (e) => {
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") { e.preventDefault(); scrub(cur + (e.key === "ArrowRight" ? 1 : -1)); }
    else if (e.key === "Home") { e.preventDefault(); scrub(0); }
    else if (e.key === "End") { e.preventDefault(); scrub(pts.length - 1); }
    else if (e.key === "Escape") rest();
  };
  host.onblur = rest;
  // the one orchestrated moment: the flags raise in order on load
  place(pts.length - 1, 0);
  if (reduce()) marks.forEach((g) => g.classList.add("is-lit"));
  else marks.forEach((g, i) => setTimeout(() => g.classList.add("is-lit"), 500 + i * 180));
}
