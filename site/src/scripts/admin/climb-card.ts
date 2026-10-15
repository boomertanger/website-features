// /admin: the Creator Climb card (docs/specs/creator-climb.md §7). Site admins (climbAdmin checks again on the server). Reads climb/main (settings,
// lastRebuild, left-out accounts), the corrections, the latest growthDaily reading and public/climb + public/socials; every change goes through
// climbAdmin { action: notes | eras | goals | exclude | correctionAdd | correctionRemove | rebuildAll }, which logs it and rebuilds. Green admin
// controls only, nothing red. Preview (non-production, signed out, ?as=admin) reads public/climb and saves nothing.
import { whenReady } from "../../lib/auth";
import { isAdmin, isPreview } from "../stash/gate";
import { messageFor } from "../../lib/errors";
import { toast } from "../../../../shared/ui/toast.js";
import { confirmAction } from "../../../../shared/ui/confirm.js";
import { NAME, type Key, type Public, fmt, monthLabel, dayLabel, escapeHtml as esc, iconHtml } from "../climb/data";

type Era = { id: string | null; label: string; from: string | null; to: string | null; note?: string };
type Main = {
  eras?: Era[]; import?: { eras?: Era[] }; goals?: Partial<Record<Key, number>>; likes?: Record<string, number>; highlights?: Record<string, string[]>;
  excludeHandles?: { uid: string; handle: string }[]; lastRebuild?: { at: number | null; months: number; milestones: number } | null;
};
type Correction = { id: string; day: string; platform: string; value: number; before: number | null; reason: string; by: string; at: number | null };
type Reading = { day: string; at: number | null; twitch: number | null; youtube: number | null; tiktok: number | null; tiktokSource: string | null; members: number | null };
type Result = { ok: boolean; months?: number; milestones?: number; excluded?: { uid: string; handle: string }[] };

const card = document.querySelector<HTMLElement>("[data-climb-card]");
const $ = <T extends Element = HTMLElement>(sel: string) => card!.querySelector<T>(sel)!;
const msOf = (v: any): number | null => (v == null ? null : typeof v === "number" ? v : typeof v.toMillis === "function" ? v.toMillis() : null);

const laTime = (t: number) => new Date(t).toLocaleTimeString("en-US", { timeZone: "America/Los_Angeles", hour: "2-digit", minute: "2-digit", hour12: false });
const laDay = (t: number) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles" }).format(new Date(t));
function when(t: number | null) {
  if (!t) return "never";
  const days = Math.round((Date.parse(laDay(Date.now())) - Date.parse(laDay(t))) / 864e5);
  return days <= 0 ? `today ${laTime(t)} Pacific` : days === 1 ? `yesterday ${laTime(t)} Pacific` : `${days} days ago`;
}

// ---------------------------------------------------------------------------------------------- reads
async function read(): Promise<{ main: Main; corrections: Correction[]; reading: Reading | null; pub: Public | null; tiktokAt: number | null }> {
  const { db, doc, getDoc, collection, getDocs, query, where, orderBy, limit, SITE_ID } = await import("../../lib/db");
  const pubSnap = await getDoc(doc(db, "sites", SITE_ID, "public", "climb")).catch(() => null);
  const pub = pubSnap?.exists() ? (pubSnap.data() as Public) : null;
  const socials = await getDoc(doc(db, "sites", SITE_ID, "public", "socials")).catch(() => null);
  const tiktokAt = msOf(socials?.exists() ? socials.get("tiktok.updatedAt") : null);
  if (isPreview()) {
    const t = pub?.totals || {};
    return {
      main: { eras: pub?.eras as Era[] | undefined, goals: pub?.goals || {}, excludeHandles: [{ uid: "preview", handle: "gbo" }], lastRebuild: { at: Date.now() - 3 * 3600e3, months: pub?.counts.months || 0, milestones: pub?.counts.milestones || 0 } },
      corrections: [],
      reading: pub?.lastReading ? { day: pub.lastReading.day, at: pub.lastReading.at, twitch: t.twitch ?? null, youtube: t.youtube ?? null, tiktok: t.tiktok ?? null, tiktokSource: "manual", members: pub.members.total } : null,
      pub, tiktokAt,
    };
  }
  const { documentId } = await import("firebase/firestore/lite");
  const [mainSnap, corrSnap, dailySnap] = await Promise.all([
    getDoc(doc(db, "sites", SITE_ID, "climb", "main")),
    getDocs(query(collection(db, "sites", SITE_ID, "climb", "main", "corrections"), orderBy("at", "desc"), limit(60))),
    // the last 31 days, ascending (a descending document-id query would need a composite index); the last one is the latest reading
    getDocs(query(collection(db, "sites", SITE_ID, "growthDaily"), where(documentId(), ">=", laDay(Date.now() - 31 * 864e5)))),
  ]);
  const m: any = mainSnap.exists() ? mainSnap.data() : {};
  const main: Main = { ...m, lastRebuild: m.lastRebuild ? { ...m.lastRebuild, at: msOf(m.lastRebuild.at) } : null };
  const corrections = corrSnap.docs.filter((d) => !d.get("removedAt")).map((d) => ({
    id: d.id, day: d.get("day"), platform: d.get("platform"), value: d.get("value"), before: d.get("before") ?? null, reason: d.get("reason") || "", by: d.get("by.name") || "", at: msOf(d.get("at")),
  }));
  const dd = dailySnap.docs.filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d.id)).pop();
  const num = (v: unknown) => (typeof v === "number" ? v : null);
  const reading = dd ? {
    day: dd.id, at: msOf(dd.get("collectedAt")), twitch: num(dd.get("twitch.followers")), youtube: num(dd.get("youtube.subscribers")),
    tiktok: num(dd.get("tiktok.followers")), tiktokSource: dd.get("tiktok.source") || null, members: num(dd.get("site.members")),
  } : null;
  return { main, corrections, reading, pub, tiktokAt };
}

async function act(data: Record<string, unknown>): Promise<Result> {
  if (isPreview()) { await new Promise((r) => setTimeout(r, 500)); return { ok: true }; }
  const { call } = await import("../../lib/call");
  return call<Result>("climbAdmin", data);
}

// ---------------------------------------------------------------------------------------------- pieces
/** The small ridge: the combined month-ends, a dashed rope on from the last one and a lamp where the climb is now. */
function ridge(pub: Public | null) {
  const vals = (pub?.monthEnd || []).map((m) => m.all).filter((v): v is number => typeof v === "number");
  if (vals.length < 2) return "";
  const max = Math.max(...vals) * 1.1, x = (i: number) => 4 + (i / (vals.length - 1)) * 120, y = (v: number) => 60 - (v / max) * 52;
  const d = vals.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join("");
  const ly = y(vals[vals.length - 1]);
  return `<svg viewBox="0 0 160 64" aria-hidden="true" focusable="false"><defs><linearGradient id="cc-rock" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="cc-rock-0"/><stop offset="1" class="cc-rock-1"/></linearGradient></defs>`
    + `<path class="cc-ridge" d="${d} L140 ${Math.min(62, ly + 14).toFixed(1)} L160 62 L0 62Z"/><path class="cc-adm-rope" d="M124 ${ly.toFixed(1)} L156 ${(ly - 10).toFixed(1)}"/><circle class="cc-adm-lamp" cx="124" cy="${ly.toFixed(1)}" r="3"/></svg>`;
}

function readingsHtml(r: Reading | null, tiktokAt: number | null) {
  if (!r) return `<li><span class="bt-card-meta">No reading yet. The collector runs every morning at 5 am Pacific.</span></li>`;
  const row = (k: Key, label: string, v: number | null, at: string, tag: string) =>
    `<li>${iconHtml(k)}<span class="cc-src-t">${esc(label)} <b>${v == null ? "—" : fmt(v)}</b><span>${esc(at)}</span></span><span class="bt-tag">${esc(tag)}</span></li>`;
  const auto = when(r.at);
  const manual = r.tiktokSource === "manual";
  return row("twitch", "Twitch", r.twitch, r.twitch == null ? "no reading" : auto, "Automatic")
    + row("youtube", "YouTube", r.youtube, r.youtube == null ? "no reading" : auto, "Automatic")
    + row("tiktok", "TikTok", r.tiktok, r.tiktok == null ? "no reading" : manual ? `entered ${when(tiktokAt)}` : auto, manual ? "By hand" : "Automatic")
    + row("members", "Site members", r.members, r.members == null ? "counted from launch" : auto, "Automatic");
}

const eraRow = (e: Partial<Era>) => `<div class="cc-era-row" data-id="${esc(e.id || "")}">
  <input class="bt-input" name="label" value="${esc(e.label || "")}" maxlength="40" aria-label="Era name" placeholder="Era name" />
  <input class="bt-input" type="date" name="from" value="${esc(e.from || "")}" aria-label="Starts" />
  <input class="bt-input" type="date" name="to" value="${esc(e.to || "")}" aria-label="Ends (empty: until the next era, or now)" />
  <button type="button" class="bt-btn bt-btn--secondary bt-btn--sm" data-cca-era-del aria-label="Remove this era">×</button>
</div>`;

const correctionsHtml = (list: Correction[]) => `<div class="bt-table-wrap"><table class="bt-table cc-corr">
  <thead><tr><th scope="col">Day</th><th scope="col">Platform</th><th scope="col">Was</th><th scope="col">Now</th><th scope="col">Reason</th><th scope="col">By</th><th scope="col" aria-label="Remove"></th></tr></thead>
  <tbody>${list.map((c) => `<tr data-id="${esc(c.id)}"><td class="cc-num">${esc(dayLabel(c.day))}</td><td>${esc(NAME[c.platform as Key] || c.platform)}</td><td class="cc-num">${fmt(c.before)}</td><td class="cc-num"><b>${fmt(c.value)}</b></td><td class="cc-why">${esc(c.reason)}</td><td>${esc(c.by)}<br><span class="bt-fine">${c.at ? esc(dayLabel(laDay(c.at))) : ""}</span></td><td><button type="button" class="bt-btn bt-btn--secondary bt-btn--sm" data-cca-corr-del>Remove</button></td></tr>`).join("")}</tbody></table></div>`;

/** Runs one save: busy button, the call, a toast, a green pulse on the panel. */
async function save(btn: HTMLButtonElement, data: Record<string, unknown>, ok: (r: Result) => string): Promise<Result | null> {
  const label = btn.textContent || "";
  btn.disabled = true; btn.innerHTML = '<span class="bt-spinner" aria-hidden="true"></span>Saving…';
  try {
    const r = await act(data);
    toast(ok(r));
    const panel = btn.closest<HTMLElement>(".bt-admin-panel");
    if (panel) { panel.classList.remove("cc-saved"); void panel.offsetWidth; panel.classList.add("cc-saved"); }
    return r;
  } catch (err) {
    toast(messageFor(err, "Couldn't save that. Try again."), { kind: "error" });
    return null;
  } finally { btn.disabled = false; btn.textContent = label; }
}
const rebuilt = (r: Result) => (r.months != null ? ` Rebuilt: ${r.months} months, ${r.milestones} milestones.` : "");

// ---------------------------------------------------------------------------------------------- the card
whenReady().then(async (s) => {
  if (!card || !isAdmin(s)) return;
  card.hidden = false;
  let data: Awaited<ReturnType<typeof read>>;
  try { data = await read(); }
  catch (err) {
    console.warn("climb card: couldn't read", err);
    $("[data-cca-srcs]").innerHTML = '<li><span class="bt-card-meta">Couldn\'t read the Creator Climb settings. Reload to try again.</span></li>';
    return;
  }
  const { main, pub } = data;
  let corrections = data.corrections;
  $("[data-cca-ridge]").innerHTML = ridge(pub);

  // readings + rebuild
  $("[data-cca-srcs]").innerHTML = readingsHtml(data.reading, data.tiktokAt);
  const lastLine = (lr: Main["lastRebuild"]) => {
    $("[data-cca-last]").textContent = (lr?.at ? `Last rebuild: ${when(lr.at)} (${lr.months} months, ${lr.milestones} milestones).` : "Not rebuilt yet.")
      + (data.reading?.tiktokSource === "manual" ? " TikTok's count is entered on the TikTok followers card." : "");
  };
  lastLine(main.lastRebuild);
  const rb = $<HTMLButtonElement>("[data-cca-rebuild]");
  rb.addEventListener("click", async () => {
    rb.disabled = true; rb.innerHTML = '<span class="bt-spinner" aria-hidden="true"></span>Rebuilding…';
    try {
      const r = await act({ action: "rebuildAll" });
      toast(r.months != null ? `Rebuilt: ${r.months} months, ${r.milestones} milestones` : "Rebuilt (preview: nothing saved)");
      lastLine({ at: Date.now(), months: r.months ?? 0, milestones: r.milestones ?? 0 });
    } catch (err) { toast(messageFor(err, "Couldn't rebuild. Try again."), { kind: "error" }); }
    finally { rb.disabled = false; rb.textContent = "Rebuild now"; }
  });

  // month notes
  const likes = { ...(main.likes || {}) }, highlights = { ...(main.highlights || {}) };
  const monthSel = $<HTMLSelectElement>("#cca-month"), likesIn = $<HTMLInputElement>("#cca-likes"), hlIn = $<HTMLTextAreaElement>("#cca-hl");
  const keys = [...new Set([...(pub?.monthEnd || []).map((m) => m.month), ...Object.keys(likes), ...Object.keys(highlights)])].sort().reverse();
  monthSel.innerHTML = keys.map((k) => `<option value="${esc(k)}">${esc(monthLabel(k, true))}</option>`).join("");
  const fillNote = () => { const k = monthSel.value; likesIn.value = likes[k] != null ? String(likes[k]) : ""; hlIn.value = (highlights[k] || []).join("\n"); };
  fillNote();
  monthSel.addEventListener("change", fillNote);
  $<HTMLFormElement>("[data-cca-notes]").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const k = monthSel.value;
    if (!k) return;
    const raw = likesIn.value.replace(/[,\s]/g, "");
    if (raw && !/^\d+$/.test(raw)) { toast("Live likes is a whole number, or leave it empty.", { kind: "error" }); likesIn.focus(); return; }
    const hl = hlIn.value.split("\n").map((x) => x.trim()).filter(Boolean);
    const r = await save((ev.submitter as HTMLButtonElement) || $("[data-cca-notes] [type=submit]"), { action: "notes", month: k, likes: raw === "" ? null : Number(raw), highlights: hl }, (r) => `${monthLabel(k, true)} notes saved.${rebuilt(r)}`);
    if (r) { if (raw === "") delete likes[k]; else likes[k] = Number(raw); if (hl.length) highlights[k] = hl; else delete highlights[k]; }
  });

  // eras
  const rows = $("[data-cca-era-rows]");
  const eras: Era[] = (main.eras?.length ? main.eras : main.import?.eras?.length ? main.import.eras : (pub?.eras as Era[]) || []);
  rows.innerHTML = eras.map(eraRow).join("");
  $("[data-cca-era-add]").addEventListener("click", () => {
    if (rows.children.length >= 8) { toast("Eight eras at most.", { kind: "error" }); return; }
    rows.insertAdjacentHTML("beforeend", eraRow({}));
    rows.querySelector<HTMLInputElement>(".cc-era-row:last-child input")?.focus();
  });
  rows.addEventListener("click", (e) => { const b = (e.target as HTMLElement).closest("[data-cca-era-del]"); if (b) b.closest(".cc-era-row")?.remove(); });
  $<HTMLFormElement>("[data-cca-eras]").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const list = [...rows.querySelectorAll<HTMLElement>(".cc-era-row")].map((r) => {
      const v = (n: string) => r.querySelector<HTMLInputElement>(`[name=${n}]`)!.value.trim();
      const label = v("label");
      const old = eras.find((e) => e.id && e.id === r.dataset.id);
      return { id: r.dataset.id || label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""), label, from: v("from") || null, to: v("to") || null, ...(old?.note ? { note: old.note } : {}) };
    });
    if (!list.length || list.some((e) => !e.label)) { toast("Every era needs a name.", { kind: "error" }); return; }
    if (list.some((e) => e.from && e.to && e.to < e.from)) { toast("An era ends before it starts.", { kind: "error" }); return; }
    const r = await save((ev.submitter as HTMLButtonElement) || $("[data-cca-eras] [type=submit]"), { action: "eras", eras: list }, (r) => `Eras saved.${rebuilt(r)}`);
    if (r) [...rows.querySelectorAll<HTMLElement>(".cc-era-row")].forEach((row, i) => (row.dataset.id = list[i].id));
  });

  // goals
  const goalsForm = $<HTMLFormElement>("[data-cca-goals]");
  for (const k of ["youtube", "twitch", "tiktok", "all", "members"] as const) {
    const v = main.goals?.[k];
    goalsForm.querySelector<HTMLInputElement>(`[name=${k}]`)!.value = typeof v === "number" ? String(v) : "";
  }
  goalsForm.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const goals: Record<string, number | null> = {};
    for (const inp of goalsForm.querySelectorAll<HTMLInputElement>("input")) {
      const raw = inp.value.replace(/[,\s]/g, "");
      if (raw && (!/^\d+$/.test(raw) || Number(raw) <= 0)) { toast("Goals are whole numbers above zero, or empty for no goal.", { kind: "error" }); inp.focus(); return; }
      goals[inp.name] = raw ? Number(raw) : null;
    }
    await save((ev.submitter as HTMLButtonElement) || goalsForm.querySelector("[type=submit]")!, { action: "goals", goals }, () => "Goals saved.");
  });

  // left out of member counts
  const leftList = $("[data-cca-left]");
  const drawLeft = (list: { uid: string; handle: string }[]) => {
    leftList.innerHTML = `<li class="cc-left-owner">The owner</li>` + list.map((x) => `<li>@${esc(x.handle)}<button type="button" data-cca-left-del="${esc(x.handle)}" aria-label="Count @${esc(x.handle)} again">×</button></li>`).join("");
  };
  drawLeft(main.excludeHandles || []);
  let left = main.excludeHandles || [];
  leftList.addEventListener("click", async (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-cca-left-del]");
    if (!b || b.disabled) return;
    const handle = b.dataset.ccaLeftDel!;
    b.disabled = true;
    try {
      const r = await act({ action: "exclude", handle, remove: true });
      left = r.excluded || left.filter((x) => x.handle !== handle);
      drawLeft(left);
      toast(`@${handle} counts again from the next reading.`);
    } catch (err) { b.disabled = false; toast(messageFor(err, "Couldn't change that. Try again."), { kind: "error" }); }
  });
  const leftForm = $<HTMLFormElement>("[data-cca-left-form]");
  leftForm.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const inp = leftForm.querySelector<HTMLInputElement>("input")!;
    const handle = inp.value.trim().replace(/^@/, "").toLowerCase();
    if (!handle) { inp.focus(); return; }
    const r = await save(leftForm.querySelector("[type=submit]")!, { action: "exclude", handle }, () => `@${handle} is left out from the next reading.`);
    if (r) { left = r.excluded || [...left.filter((x) => x.handle !== handle), { uid: handle, handle }]; drawLeft(left); inp.value = ""; }
  });

  // corrections
  const empty = $("[data-cca-corr-empty]"), listBox = $("[data-cca-corr-list]"), form = $<HTMLFormElement>("[data-cca-corr-form]"), addBtn = $<HTMLButtonElement>("[data-cca-corr-add]");
  const drawCorr = () => { listBox.innerHTML = corrections.length ? correctionsHtml(corrections) : ""; empty.hidden = !!corrections.length || !form.hidden; };
  const openForm = (on: boolean) => {
    form.hidden = !on; addBtn.hidden = on; addBtn.setAttribute("aria-expanded", String(on)); drawCorr();
    if (on) form.querySelector<HTMLInputElement>("[name=day]")!.focus(); else addBtn.focus();
  };
  const dayIn = form.querySelector<HTMLInputElement>("[name=day]")!;
  dayIn.max = laDay(Date.now());
  drawCorr();
  addBtn.addEventListener("click", () => openForm(true));
  $("[data-cca-corr-cancel]").addEventListener("click", () => openForm(false));
  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const f = new FormData(form);
    const day = String(f.get("day") || ""), platform = String(f.get("platform") || ""), raw = String(f.get("value") || "").replace(/[,\s]/g, ""), reason = String(f.get("reason") || "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) { toast("Pick a day.", { kind: "error" }); dayIn.focus(); return; }
    if (!/^\d+$/.test(raw)) { toast("The correct number is a whole number.", { kind: "error" }); form.querySelector<HTMLInputElement>("[name=value]")!.focus(); return; }
    if (reason.length < 3) { toast("Say why (a few words).", { kind: "error" }); form.querySelector<HTMLInputElement>("[name=reason]")!.focus(); return; }
    const r = await save(form.querySelector("[type=submit]")!, { action: "correctionAdd", day, platform, value: Number(raw), reason }, (r) => `Correction saved.${rebuilt(r)}`);
    if (!r) return;
    corrections = [{ id: (r as any).id || `local-${Date.now()}`, day, platform, value: Number(raw), before: null, reason, by: s.user?.displayName || "You", at: Date.now() }, ...corrections];
    form.reset();
    openForm(false);
  });
  listBox.addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-cca-corr-del]");
    if (!b) return;
    const id = b.closest<HTMLElement>("tr")!.dataset.id!;
    const c = corrections.find((x) => x.id === id);
    if (!c) return;
    void confirmAction({
      title: "Remove this correction?",
      message: `${NAME[c.platform as Key] || c.platform} on ${dayLabel(c.day)} goes back to the reading the platform reported. The correction stays in the log.`,
      confirmLabel: "Remove",
      busyLabel: "Removing…",
      danger: false,
      onConfirm: async () => {
        try { await act({ action: "correctionRemove", id }); } catch (err) { throw new Error(messageFor(err)); }
        corrections = corrections.filter((x) => x.id !== id);
        drawCorr();
        toast("Correction removed.");
      },
    });
  });
});
