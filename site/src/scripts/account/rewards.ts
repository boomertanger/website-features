// /account#rewards, the Rewards tab (docs/specs/rewards.md §11). Loads the first time the tab
// opens: the member's level (lib/rewards.js, the mirror of the functions' maths), their trophy case
// (setShowcase: pin up to 3, 6 for Sub Club and crew; drag or the arrow buttons reorder, and the
// first pin is the featured badge), their persona (setPersona; Liker and Gifter stay locked) and
// their history (myRewardHistory, 25 at a time). No badges yet: "Your first badge is one game
// away", with Play Tap the Splat cueing the footer game like the Arcade's Play now.
import { medalHtml, RARITY } from "../../../../shared/ui/medal.js";
import { escapeHtml as esc } from "../../../../shared/ui/dom.js";
import { call } from "../../lib/call";
import { messageFor } from "../../lib/errors";
import { refresh, type AuthState } from "../../lib/auth";
import { isProduction } from "../../lib/env.js";
import { progress, showcaseLimit, PERSONAS, LOCKED_PERSONAS, PERSONA_ICONS } from "../../lib/rewards.js";
import { meStripHtml, earnedLine, type BadgeDoc, type Held } from "../trophies/card";
import { loadCatalog, loadHeld, ownProfile, onMember } from "../trophies/data";
import { playNow } from "../arcade/play-now";

const pane = document.querySelector<HTMLElement>("[data-rw]");
const $ = <T extends HTMLElement = HTMLElement>(s: string) => pane!.querySelector<T>(s)!;

interface HistItem { id: string; kind: string; amount: number; badgeId: string | null; badge: { name: string; rarity: number; emoji: string | null } | null; trophyId: string | null; feature: string; reason: string; createdAt: number | null }

function say(kind: "ok" | "err", text: string) {
  const el = document.querySelector<HTMLElement>(kind === "ok" ? "[data-page-ok]" : "[data-page-err]");
  const other = document.querySelector<HTMLElement>(kind === "ok" ? "[data-page-err]" : "[data-page-ok]");
  if (other) other.hidden = true;
  if (!el) return;
  el.textContent = text;
  el.hidden = false;
  el.scrollIntoView({ block: "nearest" });
}

if (pane) {
  pane.addEventListener("click", (e) => { if ((e.target as Element).closest("[data-play-now]")) playNow(); });
  let started = false;
  onMember((s) => {
    const go = () => { if (!started && !pane.hidden) { started = true; void load(s); } };
    new MutationObserver(go).observe(pane, { attributes: true, attributeFilter: ["hidden"] });
    go();
  });
}

async function load(s: AuthState) {
  const uid = s.user!.uid;
  try {
    const [{ badges }, held] = await Promise.all([loadCatalog(), loadHeld(uid)]);
    const profile = ownProfile(s);
    const byId = new Map(badges.map((b) => [b.id, b]));
    $("[data-rw-loading]").hidden = true;

    // Level
    const xp = profile?.xp ?? 0, p = progress(xp);
    const total = badges.filter((b) => !b.crewOnly || held.has(b.id) || s.isAdmin || s.roles.includes("mod")).length;
    $("[data-rw-me]").innerHTML = meStripHtml(xp, held.size, total, false);
    $("[data-rw-next]").textContent = `${(p.nextXp - p.xp).toLocaleString("en-US")} XP to level ${p.level + 1}.`;
    $("[data-rw-level]").hidden = false;

    if (!held.size) {
      $("[data-rw-empty-art]").innerHTML = medalHtml({ emoji: byId.get("splat-finisher")?.emoji ?? "🩸", rarity: 1, size: 72, secret: false });
      $("[data-rw-empty]").hidden = false;
    } else {
      initCase(byId, held, profile?.showcase ?? [], showcaseLimit({ roles: s.roles, isOwner: false, staging: !isProduction }));
    }
    initPersona(profile?.persona ?? null);
    void initHistory();
  } catch (err) {
    console.error(err);
    $("[data-rw-loading]").hidden = true;
    say("err", "Your rewards didn't load. Check your connection and refresh the page.");
  }
}

// ---------- trophy case ----------
function initCase(byId: Map<string, BadgeDoc>, held: Map<string, Held>, saved: string[], limit: number) {
  const list = $("[data-rw-pins]"), pick = $("[data-rw-pick]");
  const save = $<HTMLButtonElement>("[data-rw-save]"), reset = $<HTMLButtonElement>("[data-rw-reset]");
  let savedIds = saved.filter((id) => held.has(id)).slice(0, limit);
  let pins = [...savedIds];
  // Held badges, rarest and newest first.
  const mine = [...held.entries()].map(([id, h]) => ({ b: byId.get(id), h })).filter((x): x is { b: BadgeDoc; h: Held } => !!x.b)
    .sort((a, b) => b.b.rarity - a.b.rarity || (b.h.earnedAt?.getTime() ?? 0) - (a.h.earnedAt?.getTime() ?? 0));
  $("[data-rw-limit]").textContent = `${limit} pins${limit > 3 ? " (Sub Club and crew)" : ""}`;
  $("[data-rw-case]").hidden = false;

  const medal = (b: BadgeDoc, size: number) => medalHtml({ emoji: b.emoji ?? "", art: b.art ?? "", rarity: b.rarity, size });
  const dirty = () => pins.join() !== savedIds.join();
  function draw() {
    list.innerHTML = pins.map((id, i) => {
      const b = byId.get(id)!, name = esc(b.name);
      return `<li class="tr-pinrow" draggable="true" data-id="${esc(id)}">
        <span class="tr-grip" aria-hidden="true"><i></i><i></i><i></i></span>${medal(b, 40)}
        <span class="tr-pinrow-main"><b>${name}</b><small>${i === 0 ? `<span class="bt-badge bt-badge--gold">Featured</span> ` : ""}${esc(RARITY[b.rarity]?.name ?? "")} · ${esc(earnedLine(held.get(id)!))}</small></span>
        <span class="tr-pinrow-acts">
          <button type="button" class="bt-btn bt-btn--ghost bt-btn--sm tr-icon-btn" data-move="-1" aria-label="Move ${name} up"${i === 0 ? " disabled" : ""}><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 3l5 6H3z"/></svg></button>
          <button type="button" class="bt-btn bt-btn--ghost bt-btn--sm tr-icon-btn" data-move="1" aria-label="Move ${name} down"${i === pins.length - 1 ? " disabled" : ""}><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 13l5-6H3z"/></svg></button>
          <button type="button" class="bt-btn bt-btn--ghost bt-btn--sm" data-unpin aria-label="Unpin ${name}">Unpin</button>
        </span></li>`;
    }).join("") + Array.from({ length: Math.max(0, limit - pins.length) }, (_, i) => `<li class="tr-pinrow tr-pinrow--empty" aria-label="Empty slot"><span class="tr-slot" aria-hidden="true">+</span><small>${pins.length + i === 0 ? "Your featured badge goes here" : "Empty slot"}</small></li>`).join("");
    pick.innerHTML = mine.map(({ b, h }) => {
      const on = pins.includes(b.id), full = !on && pins.length >= limit;
      return `<button type="button" class="tr-pick" data-id="${esc(b.id)}" aria-pressed="${on}"${full ? ` aria-disabled="true"` : ""} title="${esc(`${b.name} · ${earnedLine(h)}`)}">${medal(b, 48)}<span>${esc(b.name)}</span></button>`;
    }).join("");
    save.disabled = reset.disabled = !dirty();
  }
  const move = (id: string, d: number) => {
    const i = pins.indexOf(id), j = i + d;
    if (i < 0 || j < 0 || j >= pins.length) return;
    [pins[i], pins[j]] = [pins[j], pins[i]];
    draw();
    // Keep focus on the moved badge: the same arrow if it can still move that way, else the other.
    const r = list.querySelector(`[data-id="${CSS.escape(id)}"]`);
    (r?.querySelector<HTMLElement>(`[data-move="${d}"]:not([disabled])`) ?? r?.querySelector<HTMLElement>("[data-move]:not([disabled])"))?.focus();
  };
  list.addEventListener("click", (e) => {
    const t = e.target as Element, row = t.closest<HTMLElement>(".tr-pinrow[data-id]");
    if (!row) return;
    const m = t.closest<HTMLElement>("[data-move]");
    if (m) return move(row.dataset.id!, Number(m.dataset.move));
    if (t.closest("[data-unpin]")) { pins = pins.filter((x) => x !== row.dataset.id); draw(); }
  });
  pick.addEventListener("click", (e) => {
    const btn = (e.target as Element).closest<HTMLElement>(".tr-pick");
    if (!btn) return;
    const id = btn.dataset.id!;
    if (pins.includes(id)) pins = pins.filter((x) => x !== id);
    else if (pins.length < limit) pins.push(id);
    else return say("err", `You can pin ${limit} badges. Unpin one first.`);
    draw();
    pick.querySelector<HTMLElement>(`[data-id="${CSS.escape(id)}"]`)?.focus();
  });
  // Drag to reorder (mouse and pen; touch uses the arrows).
  let dragId = "";
  list.addEventListener("dragstart", (e) => {
    const row = (e.target as Element).closest<HTMLElement>(".tr-pinrow[data-id]");
    if (!row) return;
    dragId = row.dataset.id!;
    row.classList.add("is-dragging");
    e.dataTransfer?.setData("text/plain", dragId);
    if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
  });
  list.addEventListener("dragover", (e) => {
    if (!dragId) return;
    e.preventDefault();
    const over = (e.target as Element).closest<HTMLElement>(".tr-pinrow[data-id]");
    if (!over || over.dataset.id === dragId) return;
    const from = pins.indexOf(dragId), to = pins.indexOf(over.dataset.id!);
    pins.splice(from, 1); pins.splice(to, 0, dragId);
    draw();
    list.querySelector(`[data-id="${CSS.escape(dragId)}"]`)?.classList.add("is-dragging");
  });
  const endDrag = () => { dragId = ""; list.querySelectorAll(".is-dragging").forEach((r) => r.classList.remove("is-dragging")); };
  list.addEventListener("drop", (e) => { e.preventDefault(); endDrag(); });
  list.addEventListener("dragend", endDrag);
  reset.addEventListener("click", () => { pins = [...savedIds]; draw(); });
  save.addEventListener("click", async () => {
    save.disabled = true;
    try {
      const r = await call<{ showcase: string[] }>("setShowcase", { badgeIds: pins });
      savedIds = [...r.showcase]; pins = [...r.showcase];
      draw();
      say("ok", pins.length ? `Trophy case saved. ${byId.get(pins[0])?.name ?? "Your first pin"} is your featured badge.` : "Trophy case cleared.");
      void refresh();
    } catch (err) {
      save.disabled = false;
      say("err", messageFor(err));
    }
  });
  draw();
}

// ---------- persona ----------
function initPersona(current: string | null) {
  const box = $("[data-rw-personas]");
  let value = current;
  const draw = () => {
    box.innerHTML = [null, ...PERSONAS].map((p) => {
      const locked = !!p && LOCKED_PERSONAS.includes(p), on = p === value;
      const label = p ? `${PERSONA_ICONS[p as keyof typeof PERSONA_ICONS]} ${p}` : "None";
      return `<button type="button" class="bt-chip bt-chip--small tr-persona${on ? " is-active" : ""}" role="radio" aria-checked="${on}" data-p="${p ?? ""}"${locked ? ` aria-disabled="true" title="Unlocks later"` : ""} tabindex="${on ? 0 : -1}">${esc(label)}${locked ? `<svg class="tr-lock" viewBox="0 0 16 16" aria-hidden="true"><path d="M5 7V5a3 3 0 0 1 6 0v2h1v7H4V7zm2 0h2V5a1 1 0 0 0-2 0z"/></svg><span class="bt-sr-only"> (unlocks later)</span>` : ""}</button>`;
    }).join("");
  };
  box.addEventListener("click", async (e) => {
    const btn = (e.target as Element).closest<HTMLButtonElement>("[data-p]");
    if (!btn) return;
    const p = btn.dataset.p || null;
    if (p && LOCKED_PERSONAS.includes(p)) return say("err", `${p} unlocks later.`);
    if (p === value) return;
    const before = value;
    value = p; draw();
    box.setAttribute("aria-busy", "true");
    try {
      await call("setPersona", { persona: p });
      say("ok", p ? `Your persona is ${p}.` : "Persona cleared.");
      void refresh();
    } catch (err) {
      value = before; draw();
      say("err", messageFor(err));
    } finally {
      box.removeAttribute("aria-busy");
      box.querySelector<HTMLElement>('[aria-checked="true"]')?.focus();
    }
  });
  box.addEventListener("keydown", (e) => {
    const keys: Record<string, number> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
    if (!(e.key in keys)) return;
    e.preventDefault();
    const all = [...box.querySelectorAll<HTMLElement>("[data-p]")];
    const i = all.indexOf(document.activeElement as HTMLElement);
    all[(i + keys[e.key] + all.length) % all.length]?.focus();
  });
  draw();
  $("[data-rw-persona]").hidden = false;
}

// ---------- history ----------
async function initHistory() {
  const list = $("[data-rw-hist]"), more = $<HTMLButtonElement>("[data-rw-more]");
  $("[data-rw-history]").hidden = false;
  let cursor: string | null = null;
  const fmt = (ms: number | null) => (ms ? new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "");
  const row = (it: HistItem) => {
    const b = it.badge;
    const what = it.kind === "badge" ? `Earned ${b ? esc(b.name) : "a badge"}` : it.kind === "badge-revoke" ? `Removed ${b ? esc(b.name) : "a badge"}` : it.kind === "trophy" ? `Won ${esc(it.reason || "a trophy")}` : esc(it.reason || "XP");
    const art = b ? medalHtml({ emoji: b.emoji ?? "", rarity: b.rarity, size: 32 }) : `<span class="tr-hist-ic" aria-hidden="true">${it.kind === "trophy" ? "🏆" : "⚡"}</span>`;
    const why = (it.kind === "badge" || it.kind === "badge-revoke") && it.reason ? `<small>${esc(it.reason)}</small>` : "";
    const amt = it.amount ? `<b class="tr-hist-xp${it.amount < 0 ? " is-minus" : ""}">${it.amount > 0 ? "+" : ""}${it.amount.toLocaleString("en-US")} XP</b>` : "";
    return `<li>${art}<span class="tr-hist-main"><span>${what}</span>${why}<time>${fmt(it.createdAt)}</time></span>${amt}</li>`;
  };
  async function page() {
    more.disabled = true;
    try {
      const r = await call<{ items: HistItem[]; cursor: string | null }>("myRewardHistory", cursor ? { cursor } : {});
      list.insertAdjacentHTML("beforeend", r.items.map(row).join(""));
      cursor = r.cursor;
      more.hidden = !cursor;
      $("[data-rw-hist-empty]").hidden = list.children.length > 0;
    } catch (err) {
      say("err", messageFor(err, "Your history didn't load. Try again."));
      more.hidden = false;   // Show more tries again
    } finally {
      more.disabled = false;
    }
  }
  more.addEventListener("click", () => void page());
  await page();
}
