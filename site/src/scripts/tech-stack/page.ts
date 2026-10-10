// site/src/scripts/tech-stack/page.ts — /tech-stack (docs/specs/tech-stack.md). Wires the built page: the shared How it works behaviour (journey,
// stage-card spotlight, BOOMBOT's chat), chapter 1's power-on (the scenes flicker on one by one when the chapter comes into view, each plays once, then
// idles; hover, focus or tap plays a card; none of it under reduced motion), the wiring diagram (rig.ts) with its view switch and deep links
// (?device= ?tour= ?view=), Inside the mixer (mixer.ts), the hardware filters and Fan Club specs, the setup history, the internet gauge, and the
// Fan Club lock cards (a visitor's Join free puts the deep link in the address first, so signing up comes back to what they clicked).
// Writes nothing; the only read is the member doc (member.ts), and only for members.
import { initHowItWorks } from "../../../../shared/ui/how-it-works.js";
import { toast } from "../../../../shared/ui/toast.js";
import { Rig } from "./rig";
import { mountMixer } from "./mixer";
import { startMember, onMember, retry, type MemberState } from "./member";
import { DEV, TOURS } from "./data";
import { iconSvg, esc } from "./art";
import { lockCard, RM } from "./ui";

const page = document.querySelector<HTMLElement>("[data-ts-page]");
if (page) init(page);

function init(root: HTMLElement) {
  startMember();
  initHowItWorks(root as unknown as Document);   // the helper takes any root; its JS default (document) types it as Document
  const smooth = (): ScrollBehavior => (RM() ? "auto" : "smooth");

  // ---- a photo that can't load becomes the drawing ----
  root.addEventListener("error", (e) => {
    const img = e.target as HTMLElement;
    if (!(img instanceof HTMLImageElement) || !img.dataset.fallback) return;
    const d = DEV[img.dataset.fallback];
    if (d) img.outerHTML = iconSvg(d, img.className.replace("ts-pic", "").trim()); else img.remove();
  }, true);

  // ---- Fan Club lock cards: come back to what was clicked; Try again ----
  root.addEventListener("click", (e) => {
    const t = (e.target as Element).closest<HTMLElement>("[data-return], [data-ts-retry]");
    if (!t) return;
    if (t.matches("[data-ts-retry]")) { retry(); return; }
    const ret = t.dataset.return || "";
    const url = new URL(location.href);
    if (ret.startsWith("?")) { url.search = ""; new URLSearchParams(location.search).forEach((v, k) => { if (!["device", "tour", "view"].includes(k)) url.searchParams.set(k, v); }); new URLSearchParams(ret).forEach((v, k) => url.searchParams.set(k, v)); url.hash = ""; }
    else if (ret.startsWith("#")) url.hash = ret;
    history.replaceState(history.state, "", url);   // the sign-in dialog opens next (account/ui.ts, [data-signin]) and remembers this address
  }, true);

  // ---- chapter 1: power-on, play ----
  const why = root.querySelector<HTMLElement>("#ts-why"), cards = why ? [...why.querySelectorAll<HTMLElement>(".ts-sc-card")] : [];
  if (why && !RM()) {
    why.classList.add("ts-sc-ready");
    const io = new IntersectionObserver((es) => {
      if (!es.some((x) => x.isIntersecting)) return;
      io.disconnect();
      cards.forEach((c, i) => setTimeout(() => c.classList.add("is-on"), i * 260));
      cards.forEach((c, i) => setTimeout(() => { if (c.matches(":hover")) return; c.classList.add("is-demo"); setTimeout(() => c.classList.remove("is-demo"), 1700); }, cards.length * 260 + 500 + i * 900));
    }, { threshold: 0.25 });
    io.observe(why.querySelector(".ai-stage")!);
  } else cards.forEach((c) => c.classList.add("is-on"));
  cards.forEach((c) => {
    c.addEventListener("click", () => c.classList.toggle("is-play"));
    c.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); c.classList.toggle("is-play"); } });
  });

  // ---- the diagram ----
  const tsEl = root.querySelector<HTMLElement>(".ts")!;
  const rig = new Rig(tsEl, {
    toast: (m) => toast(m),
    showMixer: () => root.querySelector("#ts-mixer")?.scrollIntoView({ behavior: smooth(), block: "start" }),
    showHardware: (id) => showHardware(id),
  });
  const q = new URLSearchParams(location.search);
  const startView = Rig.startView(), dev = q.get("device"), tour = q.get("tour");
  rig.setView((dev || tour) && startView === "list" ? "photo" : startView, false);
  if (dev && DEV[dev]) requestAnimationFrame(() => { rig.select(dev, false); rig.flyToDev(dev, rig.narrow ? 700 : 900); tsEl.scrollIntoView({ block: "center" }); });
  else if (tour && TOURS.some((t) => t.id === tour)) requestAnimationFrame(() => { rig.startTour(tour); tsEl.scrollIntoView({ block: "center" }); });
  root.querySelectorAll<HTMLElement>("[data-tourjump]").forEach((b) => b.addEventListener("click", () => {
    if (rig.view === "list") rig.setView(rig.look);
    rig.frame.scrollIntoView({ behavior: smooth(), block: "center" });
    if (!rig.s.tour || rig.s.tour.id !== b.dataset.tourjump) rig.startTour(b.dataset.tourjump!);
  }));

  // ---- Inside the mixer ----
  const mixer = root.querySelector<HTMLElement>("#ts-mixer");
  if (mixer) mountMixer(mixer);

  // ---- hardware: filters, Show in diagram, Full specs ----
  const hwCards = [...root.querySelectorAll<HTMLElement>(".ts-hwc")];
  root.querySelectorAll<HTMLElement>("[data-hwf]").forEach((b) => b.addEventListener("click", () => {
    root.querySelectorAll<HTMLElement>("[data-hwf]").forEach((x) => { x.classList.toggle("is-active", x === b); x.setAttribute("aria-pressed", String(x === b)); });
    hwCards.forEach((c) => { c.hidden = !(b.dataset.hwf === "all" || c.dataset.cat === b.dataset.hwf); });
  }));
  function showHardware(id: string) {
    const c = hwCards.find((x) => x.dataset.hwid!.split(" ").includes(id)); if (!c) return;
    root.querySelector<HTMLElement>('[data-hwf="all"]')?.click();
    c.scrollIntoView({ behavior: smooth(), block: "center" });
    if (!RM()) { c.classList.remove("is-flash"); void c.offsetWidth; c.classList.add("is-flash"); }
  }
  root.addEventListener("click", (e) => {
    const t = (e.target as Element).closest<HTMLElement>("[data-hwshow], [data-specs]"); if (!t) return;
    if (t.dataset.hwshow) {
      if (rig.view === "list") rig.setView(rig.look);
      rig.frame.scrollIntoView({ behavior: smooth(), block: "center" });
      rig.select(t.dataset.hwshow, false); rig.flyToDev(t.dataset.hwshow, rig.narrow ? 700 : 900);
    } else if ("specs" in t.dataset) {
      const c = t.closest<HTMLElement>(".ts-hwc")!, open = !c.classList.contains("is-open");
      c.classList.toggle("is-open", open); t.setAttribute("aria-expanded", String(open));
    }
  });

  // ---- Fan Club parts that follow the member state: specs on the hardware cards, the setup history ----
  const hist = root.querySelector<HTMLElement>("[data-ts-history]"), histLock = root.querySelector<HTMLElement>("[data-ts-history-lock]");
  onMember((m: MemberState) => {
    const member = m.status === "member";
    root.dataset.tsMember = member ? "1" : "0";
    hwCards.forEach((c) => {
      const box = c.querySelector<HTMLElement>(".ts-specs")!, id = c.dataset.hwid!.split(" ")[0], n = m.doc?.devices?.[id];
      box.innerHTML = member
        ? (n ? `${n.specs ? Object.entries(n.specs).map(([k, v]) => `${esc(k)}: ${esc(v)}`).join(" · ") : ""}${n.whyPicked ? `<br><i>${esc(n.whyPicked)}</i>` : ""}` : "Boomer's notes on this one are on the way.")
        : lockCard(m, "Full specs and Boomer's notes", "Free with Fan Club.", `#hw-${id}`);
    });
    if (hist && histLock) {
      const list = member ? (m.doc?.history || []) : [];
      hist.classList.toggle("is-locked", !member);
      if (member) hist.querySelector("ol")!.innerHTML = list.length ? list.map((h) => `<li><time>${esc(h.date)}</time><span>${esc(h.text)}</span></li>`).join("") : "<li><span>Nothing logged yet.</span></li>";
      histLock.innerHTML = member ? "" : lockCard(m, "Follow every change", "The setup history is free with Fan Club.", "#ts-history");
    }
  });

  // ---- the internet gauge fills when it's seen ----
  const sp = root.querySelector<HTMLElement>(".ts-speed");
  if (sp) new IntersectionObserver((es) => es.forEach((x) => x.isIntersecting && sp.classList.add("is-in")), { threshold: 0.4 }).observe(sp);
}
