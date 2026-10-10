// site/src/scripts/tech-stack/mixer.ts — Inside the mixer (docs/specs/tech-stack.md §5.4), ported from the approved mockup. The drawn back panel and the L-8
// photo are on the page for everyone (tech-stack.astro); the rows (what comes in, what goes out, which socket) are Fan Club text from the member doc
// (mixer.inputs / mixer.outputs). Visitors see blurred placeholder rows and the lock card. Tap a row: its socket glows, a pink cable flows from the row,
// everything it reaches lights, and BOOMBOT explains the path in one sentence. Word chips explain Input, Fader, Master out and Headphone out. Phones:
// panel and photo on top, rows below, no cables. Reduced motion: the lit cable doesn't flow.
import { TS } from "./data";
import { esc } from "./art";
import { onMember, type MixRow, type MemberState } from "./member";
import { lockCard } from "./ui";

const INTRO = "Each PC sends its sound into the mixer and gets the finished mix back. That's how one voice reaches three platforms.";

export function mountMixer(sec: HTMLElement) {
  const mx = sec.querySelector<HTMLElement>(".ts-mx")!, wires = mx.querySelector<SVGSVGElement>(".ts-mx-wires")!;
  const cols = { in: mx.querySelector<HTMLElement>("[data-mx-col=in]")!, out: mx.querySelector<HTMLElement>("[data-mx-col=out]")! };
  const gate = sec.querySelector<HTMLElement>(".ts-mx-gate")!, lockHost = sec.querySelector<HTMLElement>("[data-mx-lock]")!, say = sec.querySelector<HTMLElement>(".ts-mx-say-t")!;
  let rows: Record<"in" | "out", MixRow[]> = { in: [], out: [] }, sel: string | null = null;
  const jackEl = (id: string) => mx.querySelector(`[data-jack="${id}"]`);
  const find = (key: string) => { const [side, id] = key.split(":") as ["in" | "out", string]; return { side, r: rows[side].find((x) => x.id === id)! }; };

  const rowHtml = (r: MixRow, side: string) => `<button type="button" class="ts-mx-row" data-mx="${side}:${esc(r.id)}" aria-pressed="false"><span class="ts-mx-ic" aria-hidden="true">${esc(r.icon)}</span><span class="ts-mx-rt"><b>${esc(r.title)}</b><small>${esc(r.sub)}</small><em>${esc(r.port)}${r.cable ? ` · ${esc(r.cable)}` : ""}</em></span></button>`;
  const placeholder = (n: number) => Array.from({ length: n }, () => `<div class="ts-mx-row ts-mx-row--ph" aria-hidden="true"><span class="ts-mx-ic">🔊</span><span class="ts-mx-rt"><b>Sound</b><small>Where it comes from</small><em>SOCKET</em></span></div>`).join("");

  const apply = () => {
    const lit = new Set<string>(), jacks = new Set<string>();
    if (sel) {
      const { side, r } = find(sel); lit.add(sel); r.sockets.forEach((j) => jacks.add(j));
      const other = side === "in" ? "out" : "in";
      rows[other].forEach((o) => { lit.add(`${other}:${o.id}`); o.sockets.forEach((j) => jacks.add(j)); });
      ["mL", "mR"].forEach((j) => jacks.add(j));
      say.textContent = side === "in"
        ? `${r.title} comes in on ${r.port === "Built in" ? "the pads on top of the L-8" : r.port}. The L-8 mixes it with everything else, then the master out sends that mix to both PCs (so Twitch, YouTube and TikTok) and the headphone out sends it to Boomer's ears.`
        : `${r.id === "hp" ? "Boomer's headphones hear" : `${r.title} gets`} the whole mix: VR sound, Boomer's voice, both PCs and the sound pads, balanced on the faders. It leaves on ${r.port}.`;
    }
    mx.classList.toggle("has-sel", !!sel);
    mx.querySelectorAll<HTMLElement>(".ts-mx-row[data-mx]").forEach((b) => { b.classList.toggle("is-lit", lit.has(b.dataset.mx!)); b.setAttribute("aria-pressed", String(b.dataset.mx === sel)); });
    mx.querySelectorAll<SVGElement>("[data-jack]").forEach((j) => j.classList.toggle("is-lit", jacks.has(j.dataset.jack!)));
    wires.querySelectorAll<SVGElement>(".ts-mx-wire").forEach((w) => w.classList.toggle("is-lit", lit.has(w.dataset.for!)));
  };
  const draw = () => {
    const box = mx.getBoundingClientRect();
    wires.setAttribute("viewBox", `0 0 ${box.width} ${box.height}`); wires.style.width = `${box.width}px`; wires.style.height = `${box.height}px`;
    const btns = [...mx.querySelectorAll<HTMLElement>(".ts-mx-row[data-mx]")];
    if (box.width < 640 || !btns.length) { wires.innerHTML = ""; return; }
    wires.innerHTML = btns.map((b) => {
      const { side, r } = find(b.dataset.mx!), jack = r && jackEl(r.sockets[0]); if (!jack) return "";
      const rb = b.getBoundingClientRect(), jb = jack.getBoundingClientRect();
      const x1 = side === "in" ? rb.right - box.left : rb.left - box.left, y1 = rb.top + rb.height / 2 - box.top;
      const x2 = jb.left + jb.width / 2 - box.left, y2 = jb.top + jb.height / 2 - box.top, dx = (x2 - x1) * 0.55;
      return `<path class="ts-mx-wire" data-for="${b.dataset.mx}" d="M${x1} ${y1} C${x1 + dx} ${y1} ${x2} ${y1 + (y2 - y1) * 0.2} ${x2} ${y2}"/>`;
    }).join("");
    apply();
  };

  const paint = (m: MemberState) => {
    const open = m.status === "member" && !!m.doc?.mixer;
    rows = open ? { in: m.doc!.mixer!.inputs || [], out: m.doc!.mixer!.outputs || [] } : { in: [], out: [] };
    sel = null; say.textContent = INTRO;
    cols.in.innerHTML = `<span class="bt-label">Sound coming in</span>${open ? rows.in.map((r) => rowHtml(r, "in")).join("") : placeholder(5)}`;
    cols.out.innerHTML = `<span class="bt-label">Sound going out</span>${open ? rows.out.map((r) => rowHtml(r, "out")).join("") : placeholder(3)}`;
    gate.classList.toggle("is-locked", !open);
    lockHost.innerHTML = open ? "" : m.status === "member"
      ? `<div class="bt-lock-card ts-lock"><span class="bt-lock-card-ic" aria-hidden="true">🎚️</span><div><b>The mixer notes are on the way</b><p>Boomer hasn't written them up yet.</p></div></div>`
      : lockCard(m, "Inside the mixer", "Socket-by-socket routing, in plain words. Free with Fan Club.", "#ts-mixer");
    requestAnimationFrame(draw);
  };

  mx.addEventListener("click", (e) => { const b = (e.target as Element).closest<HTMLElement>(".ts-mx-row[data-mx]"); if (!b) return; sel = sel === b.dataset.mx ? null : b.dataset.mx!; apply(); });
  sec.querySelectorAll<HTMLElement>("[data-term]").forEach((c) => c.addEventListener("click", () => {
    sec.querySelectorAll("[data-term]").forEach((x) => x.classList.toggle("is-active", x === c));
    say.textContent = TS.mixerPublic.terms[c.dataset.term!] || "";
  }));
  new ResizeObserver(draw).observe(mx);
  onMember(paint);
}
