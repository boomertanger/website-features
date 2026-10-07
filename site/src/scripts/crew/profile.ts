// /crew/profile (docs/specs/mod-machina.md §3c, §7). Your chat preferences, availability, device and Going dark.
// Saves through crewSaveProfile (each card saves on its own) and crewSetStatus. Display only: the server checks.
import { onAccess } from "./layout";
import { loadCtx, act, previewData, esc, fmtDate, DAYS, DAY_LABEL, DEVICE_LABEL, previewNote, emptyState, statusChip, type Ctx } from "./data";
import { crewMe, CHATS, CHAT_NAME, type Chat, type Pref, type Prefs } from "./api";
import { messageFor } from "../../lib/errors";
import { prefHtml, initPrefs, initRadioGroup } from "../../../../shared/ui/pref.js";
import { platformIconHtml } from "../../../../shared/ui/crew.js";
import { confirmAction } from "../../../../shared/ui/confirm.js";
import { toast } from "../../../../shared/ui/toast.js";

const root = document.querySelector<HTMLElement>("[data-hq]")!;
const DEVICES = ["phone", "desktop", "both"];
let ctx: Ctx;

const busy = (b: HTMLButtonElement, on: boolean, label: string) => { b.disabled = on; b.innerHTML = on ? `<span class="bt-spinner" aria-hidden="true"></span>Saving…` : esc(label); };

function render() {
  const c = ctx.me.crew!;
  const prefs = c.platforms as Partial<Prefs>;
  const rows = CHATS.map((chat) => ({ chat, name: CHAT_NAME[chat], iconHtml: platformIconHtml(chat), value: prefs[chat] || "no" }));
  const days = DAYS.map((d) => `<button type="button" class="bt-chip${c.availability.days.includes(d) ? " is-active" : ""}" data-day="${d}" aria-pressed="${c.availability.days.includes(d)}">${DAY_LABEL[d]}</button>`).join("");
  const dev = DEVICES.map((d, i) => `<button type="button" role="radio" aria-checked="${c.device === d}" tabindex="${c.device === d || (!DEVICES.includes(c.device) && i === 0) ? 0 : -1}" data-value="${d}">${esc(DEVICE_LABEL[d])}</button>`).join("");
  const canBreak = c.status === "active" || c.status === "checkIn";
  const dark = c.status === "goingDark"
    ? `<p class="hq-note">You're on a planned break${c.breakUntil ? ` until about <b>${esc(fmtDate(c.breakUntil, { month: "long", day: "numeric" }))}</b>` : ""}. No warnings, and your perks carry on for the first month. Ready sooner? One tap and you're back.</p><div><button type="button" class="bt-btn bt-btn--primary" data-back>Back to Active</button></div>`
    : canBreak
      ? `<p class="hq-note">Life comes first. Take up to <b>2 months a year</b> away, with <b>no warnings</b>. Your perks continue for the first month and pause after that, and your grade, badges and Hall of Fame spots stay put. Come back whenever you're ready.</p>
         <div class="hq-acts"><button type="button" class="bt-btn bt-btn--secondary" data-dark="1">Go dark for 1 month</button><button type="button" class="bt-btn bt-btn--secondary" data-dark="2">Go dark for 2 months</button></div>`
      : `<p class="hq-note">Your status is ${esc(c.status === "reserve" ? "Reserve" : c.status)}, so a planned break isn't needed. ${c.status === "reserve" ? "Taking a duty when stream duty opens brings you back." : "The owner will be in touch."}</p>`;

  root.innerHTML = `${previewNote(ctx)}
    <div class="hq-head"><div><h1 class="bt-title">Your crew profile</h1><p class="bt-subtitle">Tell us where you like to help and when. The people planning streams use this, and you can change it any time.</p></div><a class="bt-btn bt-btn--ghost" href="/crew/hq">Back to HQ</a></div>
    <div class="hq-prof-grid">
      <div class="bt-card hq-card" data-card="prefs"><div class="bt-card-head"><span class="bt-card-title">Chat preferences</span></div>
        <p class="hq-note">How do you feel about each chat? Favourites get your name first. "Only if needed" means we'll ask when a chat is short on help. YouTube's two chats are the ones we need most.</p>
        ${prefHtml({ rows })}
        <p class="bt-error" hidden></p><div><button type="button" class="bt-btn bt-btn--primary" data-save="prefs">Save preferences</button></div></div>
      <div class="bt-card hq-card" data-card="avail"><div class="bt-card-head"><span class="bt-card-title">Availability and device</span></div>
        <div class="bt-field"><span class="bt-label" id="hq-days-l">Days you can usually help</span><div class="hq-chips" role="group" aria-labelledby="hq-days-l">${days}</div></div>
        <div class="bt-field"><label class="bt-label" for="hq-av-note">Anything to add? <span class="bt-meta">optional</span></label><textarea class="bt-textarea" id="hq-av-note" rows="3" maxlength="300" placeholder="Evenings Central, back by 7 pm.">${esc(c.availability.note)}</textarea></div>
        <div class="bt-field"><span class="bt-label" id="hq-dev-l">Your device</span><span class="bt-pref-seg hq-dev" role="radiogroup" aria-labelledby="hq-dev-l" data-dev>${dev}</span>
          <span class="bt-fineprint">A phone matters for YouTube vertical: that chat is easiest to watch and moderate from the YouTube app on a phone. Desktop is great for everything else.</span></div>
        <p class="bt-error" hidden></p><div><button type="button" class="bt-btn bt-btn--primary" data-save="avail">Save availability</button></div></div>
      <div class="bt-card hq-card hq-dark" id="going-dark" data-card="dark"><div class="bt-card-head"><span class="bt-card-title">Going dark</span>${statusChip(c.status)}</div>${dark}</div>
    </div>`;
  root.setAttribute("aria-busy", "false");

  const chosen: Partial<Prefs> = { ...prefs };
  initPrefs(root, { onChange: (chat: string, v: string) => { chosen[chat as Chat] = v as Pref; } });
  const dayOn = new Set(c.availability.days);
  root.querySelector(".hq-chips")!.addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>("[data-day]"); if (!b) return;
    const d = b.dataset.day!, on = !dayOn.has(d);
    if (on) dayOn.add(d); else dayOn.delete(d);
    b.classList.toggle("is-active", on); b.setAttribute("aria-pressed", String(on));
  });
  const device = initRadioGroup(root.querySelector("[data-dev]")!, {});

  const save = (card: string, build: () => Record<string, unknown>, local: () => void, msg: string, label: string) =>
    root.querySelector<HTMLButtonElement>(`[data-save="${card}"]`)!.addEventListener("click", async (e) => {
      const b = e.currentTarget as HTMLButtonElement, err = root.querySelector<HTMLElement>(`[data-card="${card}"] .bt-error`)!;
      err.hidden = true; busy(b, true, label);
      try { await act(ctx, "crewSaveProfile", build(), local); toast(msg); }
      catch (x) { err.textContent = messageFor(x, "That didn't save. Try again."); err.hidden = false; }
      busy(b, false, label);
    });
  save("prefs", () => ({ preferences: Object.fromEntries(CHATS.map((k) => [k, chosen[k] || "no"])) }), () => { previewData().me.crew.platforms = { ...chosen }; c.platforms = { ...chosen }; }, "Preferences saved.", "Save preferences");
  const availBody = () => ({ availability: { days: DAYS.filter((d) => dayOn.has(d)), note: (root.querySelector("#hq-av-note") as HTMLTextAreaElement).value.trim() }, device: device.get() || c.device });
  save("avail", availBody, () => { const b = availBody(); Object.assign(previewData().me.crew, b); Object.assign(c, b); }, "Availability saved.", "Save availability");

  const setStatus = async (status: "goingDark" | "active", months?: number) => {
    await act(ctx, "crewSetStatus", months ? { status, months } : { status }, () => {
      c.status = status; c.breakUntil = status === "goingDark" ? Date.now() + (months || 1) * 30 * 86400000 : null;
    });
    if (!ctx.preview) ctx.me = await crewMe();
    render();
    root.querySelector<HTMLElement>("#going-dark")?.scrollIntoView({ block: "center" });
  };
  root.querySelectorAll<HTMLElement>("[data-dark]").forEach((b) => b.addEventListener("click", () => {
    const m = Number(b.dataset.dark);
    void confirmAction({
      feature: "crew", title: `Go dark for ${m} month${m === 1 ? "" : "s"}?`, confirmLabel: "Go dark", busyLabel: "Saving…", danger: false,
      message: "No warnings and nothing to do. Your perks continue for the first month and pause after that. You can come back early whenever you like.",
      onConfirm: async () => { try { await setStatus("goingDark", m); } catch (x) { throw new Error(messageFor(x, "That didn't work. Try again.")); } toast("Enjoy the break. We'll be here."); },
    });
  }));
  root.querySelector<HTMLButtonElement>("[data-back]")?.addEventListener("click", async (e) => {
    const b = e.currentTarget as HTMLButtonElement; b.disabled = true;
    try { await setStatus("active"); toast("Welcome back!"); } catch (x) { toast(messageFor(x, "That didn't work. Try again."), { kind: "error" }); b.disabled = false; }
  });
}

onAccess(async (s) => {
  try {
    ctx = await loadCtx(s);
    if (!ctx.me.crew || !ctx.crewMember) {
      root.innerHTML = emptyState("This page is for crew members", "Once you've joined the crew you can set your chats, days and breaks here.", `<a class="bt-btn bt-btn--primary" href="/crew/join">Apply to join</a>`);
      root.setAttribute("aria-busy", "false");
      return;
    }
    render();
  } catch (err) {
    root.innerHTML = emptyState("Your profile didn't load", messageFor(err, "Something went wrong. Try again in a moment."), `<a class="bt-btn bt-btn--primary" href="/crew/profile">Reload</a>`);
    root.setAttribute("aria-busy", "false");
  }
});
