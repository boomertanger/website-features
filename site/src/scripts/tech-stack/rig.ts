// site/src/scripts/tech-stack/rig.ts — the wiring diagram's engine (docs/specs/tech-stack.md §5), ported from the approved mockup's Rig. One engine for
// every view (Photo, Drawn, Blueprint, Flow; List is the same data as text), inside the kit's .bt-zoomframe (shared/ui/zoomframe.js).
//   select       tap, click, Enter or a deep link: the device's cables light, the rest dim, the detail card fills (Fan Club: ports, specs, notes)
//   trace        Trace from here: everything downstream along compatible signals (audio follows audio, video follows video, game capture carries
//                both, the internet follows network, control stops at a PC)
//   tour         Follow the signal: members step through with narration and a pulse down each cable; visitors see the whole route lit + a lock card
//   unplug       Pull the plug (Fan Club): what goes dark, and Live / Down per platform (a stream needs its PC to have a live network path)
//   clear        five ways, all the same (clear()): the "✕ Show everything" chip on the frame, tapping the selected device again, the card's ✕,
//                tapping empty space (never a drag or a pinch), and Esc anywhere in the diagram or card. Clears the selection, trace and tour (not the
//                zoom or a pulled plug), restores every device and cable, and puts focus back on the zoom frame.
//   layers, search, keyboard (devices are buttons; arrows follow cables; Escape clears; + − 0 zoom), reduced motion (no pulses; zoom jumps)
import { initZoomFrame } from "../../../../shared/ui/zoomframe.js";
import { DEVICES, CABLES, TOURS, DEV, CAB, CAT_NAME, PC_NAME, VERB, VB_W, VB_H, outOf, inTo, posOf, photoUrl, type Look, type View, type Cable } from "./data";
import { svgMarkup, devPic, esc } from "./art";
import { memberState, onMember } from "./member";
import { lockCard, mascot, RM, LOCK_SVG } from "./ui";

type Hooks = { toast: (msg: string) => void; showHardware: (id: string) => void; showMixer: () => void; onView?: (v: View) => void };
type State = { sel: string | null; trace: string | null; tour: { id: string; i: number } | null; off: string | null; hidden: Set<string>; q: string };
const VIEW_KEY = "bt.techstack.view";
let RIG_N = 0;

export class Rig {
  root: HTMLElement; hooks: Hooks; uid: string;
  s: State = { sel: null, trace: null, tour: null, off: null, hidden: new Set(), q: "" };
  view: View = "photo";
  frame: HTMLElement; svg: SVGSVGElement; card: HTMLElement; readout: HTMLElement; list: HTMLElement; stage: HTMLElement;
  zf: ReturnType<typeof initZoomFrame>;
  chipAt = 0;   // when the Show everything chip last appeared
  devEls: Record<string, SVGGElement> = {}; cabEls: Record<string, SVGGElement> = {};
  pulses: { el: SVGCircleElement; path: SVGPathElement; len: number; dur: number; off: number }[] = []; raf = 0;

  constructor(root: HTMLElement, hooks: Hooks) {
    this.root = root; this.hooks = hooks; this.uid = `r${++RIG_N}`;
    this.frame = root.querySelector(".bt-zoomframe")!; this.svg = root.querySelector(".ts-svg")!;
    this.card = root.querySelector(".ts-card")!; this.readout = root.querySelector(".ts-readout")!; this.list = root.querySelector(".ts-list")!; this.stage = root.querySelector(".ts-stage")!;
    this.zf = initZoomFrame(this.frame, { width: VB_W, height: VB_H, minWidth: 260, itemSelector: ".ts-dev", reduced: RM,
      onTap: (e: PointerEvent, item: Element | null) => {
        if (item && this.seeThrough(item as SVGGElement, e)) item = null;   // a tap on a cut-out's transparent part is empty space
        if (item) this.select((item as HTMLElement).dataset.id!); else if (this.busy) this.clear();
      } });
    this.frame.insertAdjacentHTML("beforeend", `<button type="button" class="bt-chip bt-chip--small ts-showall" hidden>✕ Show everything</button>`);
    // a touch tap that selects a device also sends a click at the same spot a moment later; if the chip has just appeared there, ignore it
    this.frame.querySelector(".ts-showall")!.addEventListener("click", () => { if (performance.now() - this.chipAt > 450) this.clear(); });
    root.addEventListener("keydown", (e) => { if (e.key === "Escape" && this.busy) { e.preventDefault(); this.clear(); } });
    this.bindChrome();
    this.renderList();
    onMember(() => { this.apply(); this.renderCard(); });
  }
  get look(): Look { return (this.root.dataset.look as Look) || "photo"; }
  get narrow() { return this.frame.getBoundingClientRect().width < 600; }
  get member() { return memberState().status === "member"; }
  /** Something is selected, traced or on tour (what the clear paths undo). */
  get busy() { return !!(this.s.sel || this.s.trace || this.s.tour); }

  // ---------- views ----------
  /** The view to open on: ?view=, then the remembered one, then List under 420 px, then Photo. */
  static startView(): View {
    const ok = (v: string | null): v is View => !!v && ["photo", "drawn", "blueprint", "flow", "list"].includes(v);
    const q = new URLSearchParams(location.search).get("view");
    if (ok(q)) return q;
    try { const v = localStorage.getItem(VIEW_KEY); if (ok(v)) return v; } catch { /* storage blocked */ }
    return innerWidth < 420 ? "list" : "photo";
  }
  setView(v: View, remember = true) {
    this.view = v;
    this.root.querySelectorAll<HTMLElement>(".ts-views [data-view]").forEach((b) => b.setAttribute("aria-checked", String(b.dataset.view === v)));
    this.stage.classList.toggle("is-list", v === "list");
    this.list.classList.toggle("is-on", v === "list");
    if (remember) { try { localStorage.setItem(VIEW_KEY, v); } catch { /* storage blocked */ } }
    if (v !== "list" && (v !== this.look || !this.svg.firstChild)) { this.root.dataset.look = v; this.s.off = null; this.render(); this.zf.setView({ x: 0, y: 0, w: VB_W, h: VB_H }); }
    this.hooks.onView?.(v);
  }
  render() {
    this.svg.innerHTML = svgMarkup(this.look, this.uid);
    this.zf.setMap(svgMarkup(this.look, `${this.uid}m`, false));
    if (this.look === "photo") this.loadMasks();
    this.devEls = Object.fromEntries([...this.svg.querySelectorAll<SVGGElement>(".ts-dev")].map((g) => [g.dataset.id!, g]));
    this.cabEls = Object.fromEntries([...this.svg.querySelectorAll<SVGGElement>(".ts-cab")].map((g) => [g.dataset.id!, g]));
    Object.values(this.devEls).forEach((g) => {
      g.addEventListener("keydown", (e) => this.devKey(e, g.dataset.id!));
      g.addEventListener("focus", () => this.ensureVisible(g.dataset.id!));
    });
    this.apply(); this.renderCard();
  }

  // ---------- state ----------
  select(id: string, fly = true) {
    if (!DEV[id]) return;
    if (id === this.s.sel && !this.s.tour) { this.clear(); return; }   // tapping the selected device again shows everything
    this.s.tour = null; this.s.sel = id; if (this.s.trace && this.s.trace !== id) this.s.trace = null;
    this.apply(); this.renderCard(true); this.markTours();
    if (fly && (this.narrow || this.zf.zoomed)) this.flyToDev(id, this.narrow ? Math.min(this.zf.vb.w, 760) : this.zf.vb.w);
  }
  /** Show everything: no selection, trace or tour (the zoom and a pulled plug stay), focus back on the zoom frame. */
  clear() { this.s.sel = null; this.s.trace = null; this.s.tour = null; this.apply(); this.renderCard(); this.markTours(); this.frame.focus({ preventScroll: true }); }
  startTour(id: string) {
    if (!TOURS.some((t) => t.id === id)) return;
    if (this.s.tour && this.s.tour.id === id) return this.clear();
    this.s = { ...this.s, sel: null, trace: null, tour: { id, i: 0 } };
    this.markTours(); this.apply(); this.renderCard(true); this.flyStep();
  }
  markTours() { this.root.querySelectorAll<HTMLElement>(".ts-tour").forEach((b) => { const on = !!this.s.tour && b.dataset.tour === this.s.tour.id; b.classList.toggle("is-active", on); b.setAttribute("aria-pressed", String(on)); }); }
  step(n: number) {
    const t = TOURS.find((x) => x.id === this.s.tour!.id)!, i = this.s.tour!.i + n;
    if (i >= t.steps.length) { this.clear(); this.hooks.toast("Signal delivered. That's the whole route."); return; }
    this.s.tour!.i = Math.max(0, i); this.apply(); this.renderCard(true); this.flyStep();
  }
  flyStep() {
    if (!this.s.tour || !this.member) return;
    const st = TOURS.find((x) => x.id === this.s.tour!.id)!.steps[this.s.tour.i];
    if (this.narrow || this.zf.zoomed) this.flyToDev(st.device, this.narrow ? 900 : this.zf.vb.w);
  }
  togglePlug(id: string) { this.s.off = this.s.off === id ? null : id; this.apply(); this.renderCard(); }

  traceFrom(start: string) {
    const devs = new Set([start]), cabs = new Set<string>();
    type M = Cable["carries"];
    const compat = (m: M, nm: M) => nm === "stream" ? m !== "control" : m === "data" ? nm === "data" : m === nm || (m === "av" && ["video", "audio", "av"].includes(nm)) || (nm === "av" && ["video", "audio"].includes(m));
    const q: [Cable, M][] = outOf(start).map((c) => [c, c.carries]);
    while (q.length) {
      const [c, m] = q.shift()!; if (cabs.has(c.id)) continue;
      cabs.add(c.id); devs.add(c.to);
      if (m === "control" && DEV[c.to].category === "pcs") continue;
      outOf(c.to).forEach((n) => { if (compat(m, n.carries)) q.push([n, n.carries === "stream" ? "stream" : m === "av" ? n.carries : n.carries === "av" ? m : n.carries]); });
    }
    return { devs, cabs };
  }
  darkFrom(off: string) {
    const alive = new Set(DEVICES.filter((d) => !inTo(d.id).length && d.id !== off).map((d) => d.id));
    const netOk = (id: string) => inTo(id).some((c) => c.signal === "net" && c.carries === "data" && alive.has(c.from));
    let ch = true;
    while (ch) { ch = false; for (const c of CABLES) if (alive.has(c.from) && c.to !== off && !alive.has(c.to)) { if (c.carries === "stream" && !netOk(c.from)) continue; alive.add(c.to); ch = true; } }
    return new Set(DEVICES.filter((d) => !alive.has(d.id) && d.id !== off).map((d) => d.id));
  }

  apply() {
    const s = this.s;
    let litD = new Set<string>(), litC = new Set<string>(), focus = false, pulse = false;
    if (s.tour) {
      const t = TOURS.find((x) => x.id === s.tour!.id)!;
      (this.member ? [t.steps[s.tour.i]] : t.steps).forEach((st) => st.cables.forEach((id) => { litC.add(id); litD.add(CAB[id].from); litD.add(CAB[id].to); }));
      focus = true; pulse = this.member;
    } else if (s.trace) { const r = this.traceFrom(s.trace); litD = r.devs; litC = r.cabs; focus = true; pulse = true; }
    else if (s.sel) { CABLES.forEach((c) => { if (c.from === s.sel || c.to === s.sel) { litC.add(c.id); litD.add(c.from); litD.add(c.to); } }); focus = true; }
    const dark = s.off ? this.darkFrom(s.off) : new Set<string>();
    for (const [id, g] of Object.entries(this.cabEls)) {
      const c = CAB[id], path = g.querySelector(".ts-cable")!;
      g.style.display = s.hidden.has(c.signal) ? "none" : "";
      path.classList.toggle("is-lit", litC.has(id));
      path.classList.toggle("is-dark", dark.has(c.from) || dark.has(c.to) || c.from === s.off || c.to === s.off);
    }
    for (const [id, g] of Object.entries(this.devEls)) {
      g.classList.toggle("is-sel", id === s.sel || id === s.trace);
      g.classList.toggle("is-lit", litD.has(id));
      g.classList.toggle("is-dark", dark.has(id));
      g.classList.toggle("is-off", id === s.off);
      g.classList.toggle("is-match", !!s.q && this.matches(id));
    }
    this.svg.classList.toggle("has-focus", focus);
    const chip = this.frame.querySelector<HTMLElement>(".ts-showall"); if (chip) { if (chip.hidden && focus) this.chipAt = performance.now(); chip.hidden = !focus; }
    this.setPulses(pulse && !RM() ? [...litC].filter((id) => !s.hidden.has(CAB[id].signal)) : []);
    this.renderReadout(dark);
  }
  matches(id: string) { const d = DEV[id], q = this.s.q.toLowerCase(); return `${d.name} ${d.short} ${d.model} ${d.tags} ${CAT_NAME[d.category]}`.toLowerCase().includes(q); }

  setPulses(ids: string[]) {
    const layer = this.svg.querySelector(".ts-pulses"); if (!layer) return;
    layer.innerHTML = ""; this.pulses = [];
    ids.slice(0, 14).forEach((id, i) => {
      const path = this.cabEls[id]?.querySelector<SVGPathElement>(".ts-cable"); if (!path) return;
      const el = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      el.setAttribute("r", this.look === "flow" ? "5" : "7"); el.setAttribute("class", "ts-pulse"); el.setAttribute("data-sig", CAB[id].signal);
      layer.appendChild(el);
      const len = path.getTotalLength();
      this.pulses.push({ el, path, len, dur: Math.max(900, len * 2.2), off: i * 0.13 });
    });
    if (this.pulses.length && !this.raf) {
      const tick = (now: number) => {
        this.pulses.forEach((p) => { const t = (now / p.dur + p.off) % 1, pt = p.path.getPointAtLength(t * p.len); p.el.setAttribute("cx", String(pt.x)); p.el.setAttribute("cy", String(pt.y)); });
        this.raf = this.pulses.length ? requestAnimationFrame(tick) : 0;
      };
      this.raf = requestAnimationFrame(tick);
    }
  }

  renderReadout(dark: Set<string>) {
    const off = this.s.off;
    this.readout.classList.toggle("is-on", !!off);
    if (!off) { this.readout.innerHTML = ""; return; }
    const plats = ["twitch", "youtube", "tiktok"].map((p) => { const down = dark.has(p) || off === p; return `<span class="ts-plat-pill ${down ? "is-dark" : "is-live"}">${down ? "Down" : "Live"} · ${esc(DEV[p].short)}</span>`; }).join("");
    const rest = [...dark].filter((id) => DEV[id].category !== "platforms").map((id) => DEV[id].name);
    const also = rest.length ? `<span>Also dark: ${esc(rest.slice(0, 4).join(", "))}${rest.length > 4 ? ` and ${rest.length - 4} more` : ""}</span>` : "<span>Nothing else goes dark.</span>";
    this.readout.innerHTML = `<b>🔌 ${esc(DEV[off].name)} unplugged.</b>${plats}${also}<span class="ts-sp"></span><button class="bt-btn bt-btn--secondary bt-btn--sm" type="button" data-plug="${off}">Plug it back in</button>`;
  }

  // ---------- the detail card ----------
  renderCard(pop = false) {
    const s = this.s, m = memberState(), doc = m.doc;
    const lockIc = (txt: string) => `${this.member ? "" : LOCK_SVG}${txt}`;
    const X = (label: string) => `<button type="button" class="ts-card-x" data-clear aria-label="${label}">✕</button>`;
    let h = "";
    if (s.tour) {
      const t = TOURS.find((x) => x.id === s.tour!.id)!;
      if (!this.member) {
        h = `${X("Exit the tour and show everything")}<div class="ts-card-a"><span class="bt-label">Follow the signal</span><b class="bt-card-title">${esc(t.title)}</b><p>The route is lit on the diagram. Fan Club members follow it step by step, with a pulse down each cable and Boomer's notes at every stop.</p>${lockCard(m, `${t.steps.length} stops with narration`, "Free with Fan Club. You'll come straight back here.", `?tour=${t.id}`)}<div class="ts-acts"><button type="button" class="bt-btn bt-btn--ghost bt-btn--sm" data-clear>Close</button></div></div>`;
      } else {
        const st = t.steps[s.tour.i], n = t.steps.length, d = DEV[st.device], line = doc?.tours?.[t.id]?.[s.tour.i] || "";
        h = `${X("Exit the tour and show everything")}<div class="ts-card-a"><span class="bt-label">Follow the signal</span><b class="bt-card-title">${esc(t.title)}</b>
          <div class="ts-step"><span class="ts-step-n">Stop ${s.tour.i + 1} of ${n}</span><span class="ts-step-dots" aria-hidden="true">${t.steps.map((_, i) => `<i class="${i <= s.tour!.i ? "on" : ""}"></i>`).join("")}</span></div>
          ${line ? `<p>${esc(line)}</p>` : ""}
          <div class="ts-acts"><button type="button" class="bt-btn bt-btn--secondary bt-btn--sm" data-step="-1" ${s.tour.i ? "" : "disabled"}>Back</button><button type="button" class="bt-btn bt-btn--primary bt-btn--sm" data-step="1">${s.tour.i === n - 1 ? "Finish" : "Next stop"}</button><button type="button" class="bt-btn bt-btn--ghost bt-btn--sm" data-clear>Exit</button></div></div>
          <div class="ts-card-b"><span class="bt-label">This stop</span><div class="ts-card-hd"><span class="ts-card-ic">${devPic(d.id, 64)}</span><div><b class="bt-card-title">${esc(d.name)}</b><div class="ts-card-model">${esc(d.model)}</div></div></div><p>${esc(d.role)}</p></div>`;
      }
    } else if (s.sel) {
      const d = DEV[s.sel], note = doc?.devices?.[d.id];
      const row = (c: Cable, out: boolean) => { const o = DEV[out ? c.to : c.from], port = this.member ? doc?.cables?.[c.id]?.port : ""; return `<li><button type="button" data-go="${o.id}"><span class="ts-dot" data-sig="${c.signal}"></span><span>${out ? "Sends" : "Gets"} <em>${VERB[c.carries]}</em> ${out ? "to" : "from"} ${esc(o.name)}</span>${port ? `<small>${esc(port)}</small>` : ""}</button></li>`; };
      const tags = [d.pc ? `<span class="bt-tag">${PC_NAME[d.pc]}</span>` : "", `<span class="bt-tag">${esc(CAT_NAME[d.category])}</span>`, d.onAir ? `<span class="bt-tag">On camera or mic</span>` : ""].join("");
      const fc = this.member
        ? (note ? `<div class="ts-fc"><span class="bt-badge bt-badge--gold ts-fc-tag">Fan Club</span>${note.specs && Object.keys(note.specs).length ? `<dl>${Object.entries(note.specs).map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("")}</dl>` : ""}${note.whyPicked ? `<p><b>Why I picked it:</b> ${esc(note.whyPicked)}</p>` : ""}${note.wouldChange ? `<p><b>What I'd change:</b> ${esc(note.wouldChange)}</p>` : ""}</div>` : "")
        : lockCard(m, "Ports, full specs and Boomer's notes", "Free with Fan Club.", `?device=${d.id}`);
      const tracing = s.trace === d.id;
      h = `${X("Close and show everything")}<div class="ts-card-a"><div class="ts-card-hd"><span class="ts-card-ic">${devPic(d.id, 64)}</span><div><b class="bt-card-title">${esc(d.name)}</b><div class="ts-card-model">${esc(d.model)}</div><div class="ts-card-tags">${tags}</div></div></div>
        <p>${esc(d.role)}</p>
        ${tracing ? `<p><b class="ts-strong">Tracing:</b> everything ${esc(d.name)} feeds is lit, all the way to the stream.</p>` : ""}
        <div class="ts-acts"><button type="button" class="bt-btn bt-btn--secondary bt-btn--sm" data-trace="${d.id}" aria-pressed="${tracing}">${tracing ? "Stop tracing" : "Trace from here"}</button>
        <button type="button" class="bt-btn bt-btn--secondary bt-btn--sm ts-lkbtn" data-plugbtn="${d.id}">${lockIc(s.off === d.id ? "Plug it back in" : "Pull the plug")}</button>
        ${d.id === "l8" ? `<button type="button" class="bt-btn bt-btn--secondary bt-btn--sm ts-lkbtn" data-mixer>${lockIc("Inside the mixer")}</button>` : ""}
        ${d.category !== "platforms" ? `<button type="button" class="bt-btn bt-btn--ghost bt-btn--sm" data-hw="${d.id}">Show in hardware</button>` : ""}</div></div>
        <div class="ts-card-b"><span class="bt-label">Connections</span><ul class="ts-conn">${outOf(d.id).map((c) => row(c, true)).join("")}${inTo(d.id).map((c) => row(c, false)).join("")}</ul>${fc}</div>`;
    } else {
      h = `<div class="ts-card-a"><div class="ts-empty">${mascot()}<div><b class="bt-card-title">Tap any device</b>
        <ul><li>💡 Its cables light up and the rest step back.</li><li>🎚️ Use the chips to show one kind of signal.</li><li>🔍 Click, then scroll or pinch to zoom.</li><li>⌨️ Tab to a device; the arrows follow its cables.</li><li>✕ Tap it again, tap empty space or press Esc to show everything.</li></ul></div></div></div>`;
    }
    this.card.innerHTML = h;
    if (pop && !RM()) { this.card.classList.remove("is-pop"); void this.card.offsetWidth; this.card.classList.add("is-pop"); }
  }

  renderList() {
    const groups = new Map<string, typeof DEVICES>();
    DEVICES.forEach((d) => { if (!groups.has(d.category)) groups.set(d.category, []); groups.get(d.category)!.push(d); });
    this.list.innerHTML = [...groups].map(([k, ds]) => `<div class="ts-list-g"><span class="bt-label">${esc(CAT_NAME[k])}</span>${ds.map((d) => `<div class="ts-list-row" id="ts-list-${d.id}">${devPic(d.id, 40)}<b>${esc(d.name)} <span class="ts-list-model">· ${esc(d.model)}</span></b><span>${esc(d.role)}</span>
      <span class="ts-lc">${outOf(d.id).map((c) => `<i data-sig="${c.signal}"><span class="ts-dot"></span>to ${esc(DEV[c.to].name)}</i>`).join("")}${inTo(d.id).map((c) => `<i data-sig="${c.signal}"><span class="ts-dot"></span>from ${esc(DEV[c.from].name)}</i>`).join("")}</span></div>`).join("")}</div>`).join("");
  }

  // ---------- chrome: layers, search, views, tours, card buttons ----------
  bindChrome() {
    const r = this.root;
    r.querySelectorAll<HTMLElement>(".ts-layer").forEach((b) => b.addEventListener("click", () => {
      const k = b.dataset.layer!, on = b.getAttribute("aria-pressed") === "true";
      b.setAttribute("aria-pressed", String(!on)); if (on) this.s.hidden.add(k); else this.s.hidden.delete(k); this.apply();
    }));
    r.querySelectorAll<HTMLElement>(".ts-tour").forEach((b) => b.addEventListener("click", () => { if (this.view === "list") this.setView(this.look); this.startTour(b.dataset.tour!); }));
    r.querySelectorAll<HTMLElement>(".ts-views [data-view]").forEach((b) => b.addEventListener("click", () => this.setView(b.dataset.view as View)));
    const inp = r.querySelector<HTMLInputElement>(".ts-find")!, n = r.querySelector<HTMLElement>(".ts-find-n")!;
    inp.addEventListener("input", () => { this.s.q = inp.value.trim(); const c = this.s.q ? DEVICES.filter((d) => this.matches(d.id)).length : 0; n.textContent = this.s.q ? (c ? `${c} found` : "No match") : ""; this.apply(); });
    inp.addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;
      const d = DEVICES.find((x) => this.matches(x.id)); if (!d) return;
      if (this.view === "list") this.setView(this.look);
      this.select(d.id, false); this.flyToDev(d.id, Math.min(this.zf.vb.w, 620));
    });
    r.addEventListener("click", (e) => {
      const t = (e.target as Element).closest<HTMLElement>("button"); if (!t || !r.contains(t)) return;
      if (t.dataset.go) this.select(t.dataset.go);
      else if (t.dataset.trace) { this.s.trace = this.s.trace === t.dataset.trace ? null : t.dataset.trace; this.apply(); this.renderCard(); }
      else if (t.dataset.plugbtn) {
        if (!this.member) { this.card.innerHTML = `<div class="ts-card-a"><span class="bt-label">Pull the plug</span><b class="bt-card-title">What if a PC dies mid-stream?</b><p>Switch off any device and see what goes dark and what keeps running. It's the backup idea from chapter 1, made real.</p>${lockCard(memberState(), "Pull the plug", "Free with Fan Club.", `?device=${t.dataset.plugbtn}`)}<div class="ts-acts"><button type="button" class="bt-btn bt-btn--ghost bt-btn--sm" data-go="${t.dataset.plugbtn}">Back</button></div></div>`; return; }
        this.togglePlug(t.dataset.plugbtn);
      }
      else if (t.dataset.plug) this.togglePlug(t.dataset.plug);
      else if (t.dataset.step) this.step(+t.dataset.step);
      else if ("clear" in t.dataset) this.clear();
      else if (t.dataset.hw) this.hooks.showHardware(t.dataset.hw);
      else if ("mixer" in t.dataset) this.hooks.showMixer();
    });
  }
  devKey(e: KeyboardEvent, id: string) {
    const dirs: Record<string, [number, number]> = { ArrowRight: [1, 0], ArrowLeft: [-1, 0], ArrowDown: [0, 1], ArrowUp: [0, -1] };
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); this.select(id); return; }
    if (e.key === "Escape") { this.clear(); return; }
    const v = dirs[e.key]; if (!v) return;
    e.preventDefault();
    const [x, y] = posOf(DEV[id], this.look);
    const nb = new Set(CABLES.filter((c) => c.from === id || c.to === id).map((c) => (c.from === id ? c.to : c.from)));
    const pick = (pool: string[]) => { let best: string | null = null, bs = 1e9; pool.forEach((oid) => { const [ox, oy] = posOf(DEV[oid], this.look), dx = ox - x, dy = oy - y, dist = Math.hypot(dx, dy) || 1, cos = (dx * v[0] + dy * v[1]) / dist; if (cos > 0.35 && dist / cos < bs) { bs = dist / cos; best = oid; } }); return best; };
    const to = pick([...nb]) || pick(DEVICES.map((d) => d.id).filter((o) => o !== id));
    if (to) (this.devEls[to] as unknown as HTMLElement).focus();
  }

  // ---------- photo hit test: the cut-outs' boxes are big (a Key Light's box is mostly air), so a tap only counts where the photo isn't transparent ----------
  static masks = new Map<string, { w: number; h: number; a: Uint8ClampedArray } | null>();
  /** Loads small alpha maps of the Photo view's cut-outs once (Cloudinary sends CORS headers); until one loads, its whole box counts. */
  loadMasks() {
    DEVICES.forEach((d) => {
      const url = photoUrl(d.photo.desk, 128); if (!url || Rig.masks.has(d.id)) return;
      Rig.masks.set(d.id, null);
      const img = new Image(); img.crossOrigin = "anonymous"; img.decoding = "async";
      img.onload = () => { try {
        const c = document.createElement("canvas"); c.width = img.naturalWidth; c.height = img.naturalHeight;
        const x = c.getContext("2d", { willReadFrequently: true })!; x.drawImage(img, 0, 0);
        Rig.masks.set(d.id, { w: c.width, h: c.height, a: x.getImageData(0, 0, c.width, c.height).data });
      } catch { /* unreadable: the whole box counts */ } };
      img.src = url;
    });
  }
  /** True when a tap on a Photo-view device landed on a transparent part of its cut-out (with a few pixels of slack; more for a finger). */
  seeThrough(g: SVGGElement, e: PointerEvent) {
    if (this.look !== "photo") return false;
    const m = Rig.masks.get(g.dataset.id!), img = g.querySelector("image.ts-photo");
    if (!m || !img) return false;
    const r = img.getBoundingClientRect(), s = Math.min(r.width / m.w, r.height / m.h);
    const ox = r.left + (r.width - m.w * s) / 2, oy = r.top + (r.height - m.h * s) / 2;
    const px = (e.clientX - ox) / s, py = (e.clientY - oy) / s, slack = Math.max(1, Math.round((e.pointerType === "touch" ? 14 : 6) / s));
    for (let y = Math.floor(py) - slack; y <= py + slack; y++) for (let x = Math.floor(px) - slack; x <= px + slack; x++) {
      if (x < 0 || y < 0 || x >= m.w || y >= m.h) continue;
      if (m.a[(y * m.w + x) * 4 + 3] > 24) return false;
    }
    return true;
  }

  // ---------- zoom ----------
  flyToDev(id: string, w: number) { const [x, y] = posOf(DEV[id], this.look); this.zf.flyTo(x, y, w); }
  ensureVisible(id: string) { const [x, y] = posOf(DEV[id], this.look), v = this.zf.vb; if (x < v.x || x > v.x + v.w || y < v.y || y > v.y + v.h) this.zf.flyTo(x, y, v.w); }
}
