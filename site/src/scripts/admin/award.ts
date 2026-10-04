// /admin, Award a badge (docs/specs/rewards.md §10): admins only (display only; awardBadge and
// revokeBadge check on the server). The handle resolves through handles/{handle} to the uid the
// callables take; the badge list is the catalog grouped by collection, each badge saying who can
// award it (awardableBy), with earned-only badges disabled. Revoke asks first (confirmAction).
// Results show as a toast.
import { whenReady } from "../../lib/auth";
import { call } from "../../lib/call";
import { messageFor } from "../../lib/errors";
import { confirmAction } from "../../../../shared/ui/confirm.js";
import { toast } from "../../../../shared/ui/toast.js";
import { RARITY } from "../../../../shared/ui/medal.js";
import { escapeHtml as esc } from "../../../../shared/ui/dom.js";
import { loadCatalog, loadHeld, loadProfile, uidForHandle } from "../trophies/data";
import type { BadgeDoc } from "../trophies/card";

const box = document.querySelector<HTMLElement>("[data-award]");
const WHO: Record<string, string> = { mod: "mods and admins", admin: "admins", owner: "the owner only" };

if (box) whenReady().then(async (s) => {
  if (!s.user || !s.isAdmin) return;
  box.hidden = false;
  const form = box.querySelector<HTMLFormElement>("[data-award-form]")!;
  const handleIn = form.querySelector<HTMLInputElement>("#aw-handle")!;
  const select = form.querySelector<HTMLSelectElement>("#aw-badge")!;
  const reasonIn = form.querySelector<HTMLTextAreaElement>("#aw-reason")!;
  const who = form.querySelector<HTMLElement>("[data-aw-who]")!, note = form.querySelector<HTMLElement>("[data-aw-note]")!, count = form.querySelector<HTMLElement>("[data-aw-count]")!;
  const awardBtn = form.querySelector<HTMLButtonElement>("[data-aw-award]")!, revokeBtn = form.querySelector<HTMLButtonElement>("[data-aw-revoke]")!;

  let byId = new Map<string, BadgeDoc>();
  try {
    const { collections, badges } = await loadCatalog();
    byId = new Map(badges.map((b) => [b.id, b]));
    select.innerHTML = `<option value="">Pick a badge</option>` + collections.map((c) => {
      const list = badges.filter((b) => b.collection === c.id);
      return list.length ? `<optgroup label="${esc(`${c.icon} ${c.name}`)}">${list.map((b) => {
        const ok = !!b.awardableBy && b.status === "active";
        const by = b.awardableBy ? `awarded by ${WHO[b.awardableBy] ?? b.awardableBy}` : "earned, not awarded";
        return `<option value="${esc(b.id)}"${ok ? "" : " disabled"}>${esc(b.name)} · ${RARITY[b.rarity]?.name ?? ""} · ${esc(b.status === "active" ? by : b.status ?? "")}</option>`;
      }).join("")}</optgroup>` : "";
    }).join("");
    select.disabled = false;
  } catch (err) {
    console.error(err);
    select.innerHTML = `<option value="">The badges didn't load</option>`;
  }

  // The member: resolved when the handle field settles; their held badges mark Award or Revoke.
  let target: { uid: string; handle: string; held: Set<string> } | null = null, seq = 0;
  async function lookUp() {
    const raw = handleIn.value.trim().replace(/^@/, "").toLowerCase();
    const n = ++seq;
    target = null;
    if (!raw) { who.textContent = ""; return update(); }
    who.textContent = "Looking…";
    try {
      const uid = await uidForHandle(raw);
      const [p, held] = uid ? await Promise.all([loadProfile(uid), loadHeld(uid)]) : [null, new Map()];
      if (n !== seq) return;
      if (!uid || !p) { who.textContent = `No member called @${raw}.`; return update(); }
      target = { uid, handle: p.handle || raw, held: new Set(held.keys()) };
      who.textContent = uid === s.user!.uid ? "That's you. You can't award yourself a badge." : `${p.displayName || p.handle} (@${p.handle}) · ${held.size} badge${held.size === 1 ? "" : "s"}.`;
    } catch (err) {
      if (n === seq) who.textContent = messageFor(err, "Couldn't look that member up. Try again.");
    }
    update();
  }
  let t = 0;
  handleIn.addEventListener("input", () => { clearTimeout(t); t = window.setTimeout(lookUp, 400); });
  handleIn.addEventListener("change", () => { clearTimeout(t); void lookUp(); });

  const reason = () => reasonIn.value.replace(/\s+/g, " ").trim();
  function update() {
    const b = byId.get(select.value), r = reason().length, holds = !!(target && b && target.held.has(b.id));
    count.textContent = r < 10 ? `${r} of at least 10 characters.` : `${r} / 300 characters.`;
    note.textContent = !b ? "Each badge says who can award it. Badges members earn on their own can't be awarded."
      : `${b.name}: ${b.how}${target ? (holds ? ` @${target.handle} holds it.` : ` @${target.handle} doesn't hold it yet.`) : ""}`;
    const ready = !!target && !!b && r >= 10 && r <= 300 && target.uid !== s.user!.uid;
    awardBtn.disabled = !ready || holds;
    revokeBtn.disabled = !ready || !holds;
  }
  select.addEventListener("change", update);
  reasonIn.addEventListener("input", update);
  update();

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const b = byId.get(select.value);
    if (!target || !b || awardBtn.disabled) return;
    awardBtn.disabled = true;
    try {
      const r = await call<{ serial: number; xp: number }>("awardBadge", { uid: target.uid, badgeId: b.id, reason: reason() });
      toast(`${b.name} awarded to @${target.handle}: #${r.serial} to earn it, +${r.xp} XP.`);
      target.held.add(b.id);
      reasonIn.value = "";
    } catch (err) {
      toast(messageFor(err), { kind: "error", ms: 7000 });
    }
    update();
  });
  revokeBtn.addEventListener("click", async () => {
    const b = byId.get(select.value), tg = target;
    if (!tg || !b || revokeBtn.disabled) return;
    const why = reason();
    const done = await confirmAction({
      title: "Revoke this badge?",
      message: `${b.name} comes off @${tg.handle}'s profile and its XP is taken back. Your reason is logged.`,
      confirmLabel: "Revoke badge", busyLabel: "Revoking…",
      onConfirm: async () => { await call("revokeBadge", { uid: tg.uid, badgeId: b.id, reason: why }).catch((err) => { throw new Error(messageFor(err)); }); },
    });
    if (!done) return;
    toast(`${b.name} revoked from @${tg.handle}.`);
    tg.held.delete(b.id);
    reasonIn.value = "";
    update();
  });
});
