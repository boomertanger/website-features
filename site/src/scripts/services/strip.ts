// The page strip's wiring (docs/specs/service-hub.md §8a; TalkBackNote.astro; the compact strip, V5 + S1, Oct 14, 2026): once auth is known, the
// three rating buttons become the visitor's Join free buttons (data-signin="join"), or the member's buttons with their rating pressed. Like it and
// Love it save in one tap; Not for me opens the rating dialog for its required comment; either way the toast says "Thanks! Only Boomer and the admins
// see ratings." Tapping the rating you already gave opens the rating dialog (Keep or change on a newer version). The member's rating is read from
// my/{uid} after sign-in; visitors cost no read. The Talk pill ([data-talk="question"]) calls window.btTalkBack.open (Hotline Boom part 2).
// Light on purpose: everything else loads only on a page that has a strip.
import { whenReady } from "../../lib/auth";

const zone = document.querySelector<HTMLElement>("[data-sv-strip]");
const strip = zone?.querySelector<HTMLElement>(".bt-talkback");
if (zone && strip) void init(zone, strip);

async function init(zone: HTMLElement, strip: HTMLElement) {
  const id = strip.dataset.service || "";
  const name = zone.dataset.name || id;
  const rateOn = strip.dataset.rate !== "off", talkOn = zone.hasAttribute("data-talk-on");
  const [s, D, { talkbackHtml }] = await Promise.all([whenReady(), import("./data"), import("../../../../shared/ui/talkback.js")]);
  const audience = zone.dataset.audience || "everyone";
  const who = D.whoOf(s);
  const preview = D.gate.isPreview(s);
  const visitor = !preview && s.status === "signedOut";
  // crew-only services: the buttons are for the people who can rate them
  const open = visitor ? ["everyone", "members"].includes(audience) : D.audienceOpen(audience, who);
  if (!open && !talkOn) { zone.hidden = true; return; }
  zone.hidden = false;
  const now = zone.dataset.version;

  /** Redraw the row for a state, from the kit's own markup (the section and its attributes stay). */
  const draw = (state: "new" | "rated" | "visitor", rating?: { value: string; version: string; date: string }) => {
    const t = document.createElement("template");
    t.innerHTML = talkbackHtml({ service: id, name, state, rating, rate: rateOn && open, talk: talkOn });
    strip.innerHTML = t.content.querySelector(".bt-talkback")?.innerHTML || "";
    // a rating on an older version: the pressed button says so (tapping it opens Keep or change)
    const mine = strip.querySelector<HTMLElement>('[data-rate-v][aria-pressed="true"]');
    if (mine && rating && now && rating.version !== now) mine.title = `Rated v${rating.version}. ${name} is on v${now} now: tap to keep or change.`;
  };
  const day = (ms: number | null) => (ms ? new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "");
  const showMine = async () => {
    const m = await D.my();
    const r = m.rated[id];
    if (!r) { draw("new"); return; }
    const doc = await D.ratingOf(id);
    draw("rated", { value: D.toPick(r.value), version: r.version, date: day(doc?.at ?? null) });
  };

  if (!rateOn || !open) draw("new");
  else if (visitor) draw("visitor");
  else await showMine().catch(() => draw("new"));

  document.addEventListener("sv:rated", (e) => {
    const d = (e as CustomEvent).detail;
    if (d?.id === id) draw("rated", { value: D.toPick(d.value), version: d.version, date: day(Date.now()) });
  });
  strip.addEventListener("click", async (e) => {
    const t = e.target as HTMLElement;
    const v = t.closest<HTMLButtonElement>("[data-rate-v]");
    if (v) {
      const { quickRate, openRate } = await import("./dialogs");
      if (v.getAttribute("aria-pressed") === "true") { void openRate({ serviceId: id, thanks: true }); return; }
      const btns = strip.querySelectorAll<HTMLButtonElement>("[data-rate-v]");
      const was = [...btns].map((b) => b.getAttribute("aria-pressed"));
      if (v.dataset.rateV !== "nope") btns.forEach((b) => { b.disabled = true; b.setAttribute("aria-pressed", String(b === v)); });
      const ok = await quickRate(id, v.dataset.rateV as "nope" | "like" | "love");
      if (!ok) btns.forEach((b, i) => { b.disabled = false; b.setAttribute("aria-pressed", was[i] || "false"); });
      return;
    }
    if (t.closest("[data-talk]")) (window as any).btTalkBack?.open?.({ serviceId: id, mode: "question" });
  });
}
