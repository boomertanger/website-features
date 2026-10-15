// The page strip's wiring (docs/specs/service-hub.md §8a; TalkBackNote.astro; the compact strip, V5 + S1, Oct 14, 2026): once auth is known, the
// three rating buttons become the visitor's Join free buttons (data-signin="join"), or the member's buttons with their rating pressed. Like it and
// Love it save in one tap; Not for me opens the rating dialog for its required comment; either way the toast names the service ("Thanks! That's your rating for all of {name}. Only Boomer and the admins
// see ratings."). Tapping the rating you already gave opens the rating dialog (Keep or change on a newer version). The member's rating is read from
// my/{uid} after sign-in; visitors cost no read. The Talk pill ([data-talk="question"]) calls window.btTalkBack.open (Hotline Boom part 2).
// A page whose service is only known in the browser rates something else than its manifest: one route serves many items (the game pages,
// /games/{slug} → vault-<slug>, docs/specs/game-page-votes.md §2). It calls retargetStrip({ id, name, version, rate }) (or sets
// window.svStripTarget before this loads); the rating buttons then rate that item, always shown unless rate is false (a hidden game). The Talk
// pill keeps the page's own service (its manifest gives Talk Back its name and BOOMBOT).
// Light on purpose: everything else loads only on a page that has a strip.
import { whenReady } from "../../lib/auth";

export interface StripTarget { id: string; name: string; version?: string; rate?: boolean }
declare global { interface Window { svStripTarget?: StripTarget | null } }
/** Rate another item from this page's strip (null: back to the page's own service). */
export function retargetStrip(t: StripTarget | null) {
  window.svStripTarget = t;
  document.dispatchEvent(new CustomEvent("sv:strip-target", { detail: t }));
}

const zone = document.querySelector<HTMLElement>("[data-sv-strip]");
const strip = zone?.querySelector<HTMLElement>(".bt-talkback");
if (zone && strip) void init(zone, strip);

async function init(zone: HTMLElement, strip: HTMLElement) {
  const pageId = strip.dataset.service || "";
  const talkOn = zone.hasAttribute("data-talk-on");
  const [s, D, { talkbackHtml }] = await Promise.all([whenReady(), import("./data"), import("../../../../shared/ui/talkback.js")]);
  const audience = zone.dataset.audience || "everyone";
  const who = D.whoOf(s);
  const preview = D.gate.isPreview(s);
  const visitor = !preview && s.status === "signedOut";
  // crew-only services: the buttons are for the people who can rate them
  const open = visitor ? ["everyone", "members"].includes(audience) : D.audienceOpen(audience, who);
  if (!open && !talkOn) { zone.hidden = true; return; }
  zone.hidden = false;

  /** What the rating buttons rate right now: the page's service, or a target the page set. */
  const cur = () => {
    const t = window.svStripTarget;
    if (t && t.id) return { id: t.id, name: t.name || t.id, version: t.version || "", rateOn: t.rate !== false && open };
    return { id: pageId, name: zone.dataset.name || pageId, version: zone.dataset.version || "", rateOn: strip.dataset.rate !== "off" && open };
  };

  /** Redraw the row for a state, from the kit's own markup (the section and its attributes stay). */
  const draw = (state: "new" | "rated" | "visitor", rating?: { value: string; version: string; date: string }) => {
    const c = cur();
    const t = document.createElement("template");
    t.innerHTML = talkbackHtml({ service: pageId, name: c.name, state, rating, rate: c.rateOn, talk: talkOn });
    strip.innerHTML = t.content.querySelector(".bt-talkback")?.innerHTML || "";
    strip.dataset.rateId = c.id;
    // a rating on an older version: the pressed button says so (tapping it opens Keep or change)
    const mine = strip.querySelector<HTMLElement>('[data-rate-v][aria-pressed="true"]');
    if (mine && rating && c.version && rating.version !== c.version) mine.title = `Rated v${rating.version}. ${c.name} is on v${c.version} now: tap to keep or change.`;
  };
  const day = (ms: number | null) => (ms ? new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "");
  const showMine = async () => {
    const id = cur().id;
    const m = await D.my();
    const r = m.rated[id];
    if (cur().id !== id) return;   // moved on to another game meanwhile
    if (!r) { draw("new"); return; }
    const doc = await D.ratingOf(id);
    if (cur().id === id) draw("rated", { value: D.toPick(r.value), version: r.version, date: day(doc?.at ?? null) });
  };
  const show = async () => {
    if (!cur().rateOn) draw("new");
    else if (visitor) draw("visitor");
    else await showMine().catch(() => draw("new"));
  };

  await show();
  document.addEventListener("sv:strip-target", () => void show());
  document.addEventListener("sv:rated", (e) => {
    const d = (e as CustomEvent).detail;
    if (d?.id === cur().id) draw("rated", { value: D.toPick(d.value), version: d.version, date: day(Date.now()) });
  });
  strip.addEventListener("click", async (e) => {
    const t = e.target as HTMLElement;
    const v = t.closest<HTMLButtonElement>("[data-rate-v]");
    if (v) {
      const id = cur().id;
      const { quickRate, openRate } = await import("./dialogs");
      if (v.getAttribute("aria-pressed") === "true") { void openRate({ serviceId: id, thanks: true }); return; }
      const btns = strip.querySelectorAll<HTMLButtonElement>("[data-rate-v]");
      const was = [...btns].map((b) => b.getAttribute("aria-pressed"));
      if (v.dataset.rateV !== "nope") btns.forEach((b) => { b.disabled = true; b.setAttribute("aria-pressed", String(b === v)); });
      const ok = await quickRate(id, v.dataset.rateV as "nope" | "like" | "love");
      if (!ok) btns.forEach((b, i) => { b.disabled = false; b.setAttribute("aria-pressed", was[i] || "false"); });
      return;
    }
    if (t.closest("[data-talk]")) (window as any).btTalkBack?.open?.({ serviceId: pageId, mode: "question" });
  });
}
