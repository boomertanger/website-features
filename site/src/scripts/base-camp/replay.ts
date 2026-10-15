// site/src/scripts/base-camp/replay.ts — "The rise, replayed" on /base-camp (docs/specs/base-camp.md Addendum 3; mockup base-camp-rise.html).
// Reads ONLY public/climb (climb.ts) and hard-codes no follower number. Steps: every month-end from January 2025 (months with no reading are
// skipped; a month-end on the last reading's own day is left out, since Today is that reading), then Today (public/climb.totals). No gap or
// "paused" step: the curve connects the last month-end straight to Today.
// The .bt-scrubber (shared/ui/scrubber.js) drives it: the month and its era (tint), the big rolling total with "followers on {day}, the month's
// last reading" (Today: "followers right now"), three platform bars (official icons; a dash and no bar where a platform has no value), the
// story line (site/src/data/base-camp.json replay.lines, every {…} filled from public/climb, values in bold). Play the climb steps through in
// about 10 s and lands on Today; any touch on the track stops it. Flares going forward only: TikTok 1,000 and 5,000 combined (gold), 10,000
// combined (lime, sparks; it also lights the stage 5 card). Reduced motion: no rolling and no flares; values still change; Play steps without
// animation. The whole replay stays hidden if public/climb doesn't exist.
import { scrubber } from "../../../../shared/ui/scrubber.js";
import { loadClimb, fill, fillParts, fmt, shortDate, monthName, type Climb, type Milestone, type MonthEnd } from "./climb";
import { esc, RM } from "./ui";
import data from "../../data/base-camp.json";

type Plat = "twitch" | "tiktok" | "youtube";
const PLATS: Plat[] = ["twitch", "tiktok", "youtube"];
interface Step { key: string; today: boolean; row: MonthEnd | null; vals: { all?: number; twitch?: number; tiktok?: number; youtube?: number }; day: string }
const RP = data.replay as typeof data.replay & { lines: Record<string, string>; flares: { id: string; tone: string; label: string; big?: boolean; note?: string }[]; ticks: string[] };
/** Era id → its tone (band and tint); anything else is plain. */
const TONE: Record<string, string> = { "before-the-push": "gray", "the-grind": "gold", "the-build": "plain", "back-on-air": "lime" };

export function initReplay(root: HTMLElement) {
  const wrap = root.querySelector<HTMLElement>("[data-bc-replay-wrap]");
  if (!wrap) return;
  void loadClimb().then((c) => { if (c && c.totals && typeof c.totals.all === "number") mount(root, wrap, c); });
}

function mount(root: HTMLElement, wrap: HTMLElement, c: Climb) {
  const el = wrap.querySelector<HTMLElement>("[data-bc-replay]")!;
  const $ = <T extends HTMLElement = HTMLElement>(s: string) => el.querySelector<T>(s)!;
  const lastDay = c.lastReading?.day || null;
  const months = c.monthEnd.filter((r) => r.month >= "2025-01" && typeof r.all === "number" && r.day !== lastDay);
  const steps: Step[] = [
    ...months.map((r) => ({ key: r.month, today: false, row: r, vals: r, day: r.day })),
    { key: "today", today: true, row: null, vals: c.totals, day: lastDay || new Date().toISOString().slice(0, 10) },
  ];
  if (steps.length < 2) return;
  wrap.hidden = false;
  const N = steps.length, xOf = (i: number) => i / (N - 1);
  const max = Math.max(...steps.map((s) => s.vals.all || 0)) * 1.06 || 1;
  const maxP = Math.max(1, ...steps.flatMap((s) => PLATS.map((k) => s.vals[k] || 0)));

  // eras: the steps each era covers (dated eras only; an era without a start date isn't drawn)
  const eras = c.eras.filter((e) => e.from).map((e) => ({ ...e, tone: TONE[e.id] || "plain" }));
  const eraOf = (s: Step) => { const d = s.day; let hit = null; for (const e of eras) if (e.from! <= d && (!e.to || d <= e.to)) hit = e; return hit; };
  const stepEras = steps.map(eraOf);
  const bands: { from: number; to: number; label: string; tone: string }[] = [];
  stepEras.forEach((e, i) => {
    if (!e) return;
    const last = bands[bands.length - 1];
    const half = 0.5 / (N - 1);
    if (last && last.label === e.label) last.to = Math.min(1, xOf(i) + half);
    else bands.push({ from: Math.max(0, xOf(i) - half), to: Math.min(1, xOf(i) + half), label: e.label, tone: e.tone });
  });

  // milestone dots and flares: the three the spec names, on the step of their month
  const flareMs = RP.flares.map((f) => ({ f, m: c.milestones.find((x) => x.id === f.id) })).filter((x): x is { f: (typeof RP.flares)[number]; m: Milestone } => !!x.m);
  const stepOfDay = (d: string) => { const i = steps.findIndex((s) => !s.today && s.key === d.slice(0, 7)); return i < 0 ? N - 1 : i; };
  const dots = [
    ...flareMs.map(({ f, m }) => { const i = stepOfDay(m.day); return { x: xOf(i), y: (steps[i].vals.all || 0) / max, big: !!f.big }; }),
    { x: 1, y: (c.totals.all || 0) / max, today: true },
  ];
  const ticks = RP.ticks.map((k) => (k === "today" ? { x: 1, label: RP.today } : (() => { const i = steps.findIndex((s) => s.key === k); return i < 0 ? null : { x: xOf(i), label: shortMonth(k) }; })())).filter((t): t is { x: number; label: string } => !!t);
  const textOf = (s: Step) => `${s.today ? RP.today : monthName(s.key)}: ${fmt(s.vals.all || 0)} followers`;

  let cur = N - 1, shown = 0, tween = 0, playing: number | null = null;
  const sc = scrubber($("[data-rp-scrub]"), {
    steps: steps.map((s, i) => ({ text: textOf(s), x: xOf(i) })), index: cur, label: RP.label,
    curve: steps.map((s, i) => ({ x: xOf(i), y: (s.vals.all || 0) / max })), bands, dots, ticks,
    onInput: (i) => { stop(); go(i); },
  });

  function roll(to: number) {
    cancelAnimationFrame(tween);
    const tot = $("[data-rp-total]");
    const from = shown;
    if (RM() || from === to) { shown = to; tot.textContent = fmt(to); return; }
    const t0 = performance.now();
    const step = (now: number) => { const k = Math.min(1, (now - t0) / 420), e = 1 - Math.pow(1 - k, 3); shown = Math.round(from + (to - from) * e); tot.textContent = fmt(shown); if (k < 1) tween = requestAnimationFrame(step); };
    tween = requestAnimationFrame(step);
  }
  /** The story line for a step: its month's line and the lines of the milestones that fall in it, values in bold. */
  function story(s: Step): string | null {
    const html = (text: string, ctx?: Milestone) => { const parts = fillParts(text, c, ctx); return parts ? parts.map(([t, v]) => (v ? `<b>${esc(t)}</b>` : esc(t))).join("") : null; };
    if (s.today) return html(RP.lines.today);
    const out: string[] = [];
    if (RP.lines[s.key]) { const l = html(RP.lines[s.key]); if (l) out.push(l); }
    for (const m of c.milestones.filter((x) => x.day.slice(0, 7) === s.key)) if (RP.lines[m.id]) { const l = html(RP.lines[m.id], m); if (l) out.push(l); }
    return out.length ? out.join(" ") : null;
  }
  function flare(f: (typeof RP.flares)[number], m: Milestone) {
    if (RM()) return;
    const box = $("[data-rp-flare]");
    box.classList.remove("is-on", "is-big");
    void box.offsetWidth;
    box.querySelector("b")!.textContent = fill(f.label, c, m) || "";
    box.querySelector("span")!.textContent = shortDate(m.day) + (f.note ? ` · ${f.note}` : "");
    box.dataset.tone = f.tone;
    if (f.big) {
      box.classList.add("is-big");
      for (let k = 0; k < 24; k++) {
        const sp = document.createElement("span");
        sp.className = "bc-rp-spark";
        sp.dataset.tone = ["gold", "lime", "gray"][k % 3];
        const a = (k / 24) * Math.PI * 2, r = 90 + (k % 4) * 30;
        sp.style.setProperty("--dx", `${Math.cos(a) * r}px`); sp.style.setProperty("--dy", `${Math.sin(a) * r * 0.6}px`);
        el.appendChild(sp);
        sp.addEventListener("animationend", () => sp.remove());
      }
      // 10,000 also lights the stage 5 card
      const li = root.querySelector<HTMLElement>('[data-stop="build"]');
      if (li) { li.classList.add("is-glow"); setTimeout(() => li.classList.remove("is-glow"), 2400); }
    }
    box.classList.add("is-on");
  }
  function go(i: number, opts: { silent?: boolean } = {}) {
    const prev = cur;
    cur = Math.max(0, Math.min(N - 1, i));
    const s = steps[cur], e = stepEras[cur];
    $("[data-rp-month]").textContent = s.today ? RP.today : monthName(s.key);
    const era = $("[data-rp-era]");
    era.hidden = !e; era.textContent = e ? e.label : "";
    el.dataset.era = e ? e.tone : "";
    roll(s.vals.all || 0);
    $("[data-rp-sub]").textContent = s.today ? RP.todaySub : RP.monthSub.replace("{day}", shortDate(s.day));
    for (const k of PLATS) {
      const li = $(`[data-rp-bar="${k}"]`), v = s.vals[k];
      li.classList.toggle("is-none", typeof v !== "number");
      li.querySelector<HTMLElement>("i")!.style.setProperty("--w", typeof v === "number" ? `${((v / maxP) * 100).toFixed(1)}%` : "0%");
      li.querySelector("b")!.textContent = typeof v === "number" ? fmt(v) : "—";
    }
    const st = $("[data-rp-story]"), line = story(s);
    st.classList.toggle("is-quiet", !line);
    st.querySelector("p")!.innerHTML = line || esc(`${monthName(s.key)}.`);
    sc.set(cur);
    // flares going forward only, for every step passed
    if (!opts.silent && cur > prev) for (let k = prev + 1; k <= cur; k++) for (const { f, m } of flareMs) if (stepOfDay(m.day) === k) flare(f, m);
  }

  const btn = $<HTMLButtonElement>("[data-rp-play]");
  const setBtn = (on: boolean) => { btn.setAttribute("aria-pressed", String(on)); $("[data-rp-play-ic]").textContent = on ? "■" : "▶"; $("[data-rp-play-l]").textContent = on ? RP.stop : RP.play; };
  function stop() { if (playing != null) { clearInterval(playing); playing = null; setBtn(false); } }
  btn.addEventListener("click", () => {
    if (playing != null) { stop(); return; }
    go(0, { silent: true });
    setBtn(true);
    let k = 0;
    playing = window.setInterval(() => { k++; go(k); if (k >= N - 1) stop(); }, Math.round(10000 / N));
  });
  // any touch on the track stops Play (onInput covers drags and keys; this covers a press that lands on the current step)
  el.querySelector(".bt-scrubber-track")?.addEventListener("pointerdown", stop);
  go(N - 1, { silent: true });
}

const shortMonth = (m: string) => new Date(`${m}-15T12:00:00Z`).toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
