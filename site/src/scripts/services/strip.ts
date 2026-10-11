// The page strip's wiring (docs/specs/service-hub.md §8a; TalkBackNote.astro): once auth is known, the Rate half shows the visitor's "Join free to
// rate", the member's three buttons, or their rating ("You love it · Change", the version and date). Like it and Love it save in one tap with the
// toast; Not for me and Change open the rating dialog. The member's rating is read from my/{uid} (and the rating doc for its date) after sign-in;
// visitors cost no read. Talk back's buttons call window.btTalkBack.open (Hotline Boom part 2) when that half is on.
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
  // crew-only services: the strip is for the people who can rate them
  const open = visitor ? ["everyone", "members"].includes(audience) : D.audienceOpen(audience, who);
  if (!open && !talkOn) { zone.hidden = true; return; }
  zone.hidden = false;

  const rateHalf = strip.querySelector<HTMLElement>(".bt-talkback-rate");
  const talkHalf = strip.querySelector<HTMLElement>(".bt-talkback-talk");
  const day = (ms: number | null) => (ms ? new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "");
  /** Redraw the halves for a state, from the kit's own markup (the head and foot don't change). */
  const draw = (state: "new" | "rated" | "visitor", rating?: { value: string; version: string; date: string }) => {
    const t = document.createElement("template");
    t.innerHTML = talkbackHtml({ service: id, name, state, rating, rate: rateOn, talk: talkOn });
    if (rateHalf) rateHalf.innerHTML = t.content.querySelector(".bt-talkback-rate")?.innerHTML || "";
    if (talkHalf) talkHalf.innerHTML = t.content.querySelector(".bt-talkback-talk")?.innerHTML || "";
  };
  const showMine = async () => {
    const m = await D.my();
    const r = m.rated[id];
    if (!r) { draw("new"); return; }
    const doc = await D.ratingOf(id);
    draw("rated", { value: D.toPick(r.value), version: r.version, date: day(doc?.at ?? null) });
    // a rating on an older version: say so (Change opens Keep or change)
    const now = zone.dataset.version;
    const small = rateHalf?.querySelector("small");
    if (small && now && r.version !== now) small.textContent = `Rated v${r.version}. ${name} is on v${now} now: tap Change to keep or update your rating.`;
  };

  if (!rateOn || !open) { if (rateHalf) rateHalf.hidden = true; }
  else if (visitor) draw("visitor");
  else await showMine().catch(() => draw("new"));

  document.addEventListener("sv:rated", (e) => {
    const d = (e as CustomEvent).detail;
    if (d?.id === id) draw("rated", { value: D.toPick(d.value), version: d.version, date: day(Date.now()) });
  });
  strip.addEventListener("click", async (e) => {
    const t = e.target as HTMLElement;
    const v = t.closest<HTMLElement>("[data-rate-v]");
    if (v) {
      const btns = strip.querySelectorAll<HTMLButtonElement>("[data-rate-v]");
      if (v.dataset.rateV !== "nope") btns.forEach((b) => { b.disabled = true; b.setAttribute("aria-pressed", String(b === v)); });
      const { quickRate } = await import("./dialogs");
      const ok = await quickRate(id, v.dataset.rateV as "nope" | "like" | "love");
      if (!ok) btns.forEach((b) => { b.disabled = false; b.setAttribute("aria-pressed", "false"); });
      return;
    }
    if (t.closest("[data-rate-change]")) { const { openRate } = await import("./dialogs"); void openRate({ serviceId: id }); return; }
    const talk = t.closest<HTMLElement>("[data-talk]");
    if (talk) (window as any).btTalkBack?.open?.({ serviceId: id, mode: talk.dataset.talk });
  });
}
