// /brain-dump/how-it-works (docs/specs/brain-dump.md §5): the shared How it works behaviour (journey, stage-card spotlight, Ask BOOMBOT),
// the stage cards' scenes (hover or focus plays them in CSS; a tap toggles .is-playing for touch), the role switch (the kit's pill switch),
// the practice board (the real engine with no store: nothing is saved) with its Try this list and stamp, and the buttons by viewer:
// access (has Brain Dump) | member (signed in, no Brain Dump) | visitor. Off production, signed out, ?as= previews a viewer like /brain-dump.
import { onAuth, type AuthState } from "../../lib/auth";
import { hasBrainDump } from "../../lib/brain-dump-access";
import { isProduction } from "../../lib/env.js";
import { mount, type BoardState } from "./engine";
import { initHowItWorks } from "../../../../shared/ui/how-it-works.js";
import { initPillSwitch } from "../../../../shared/ui/pill-switch.js";
import { stampHtml } from "../../../../shared/ui/stamp.js";

const root = document.getElementById("brain-dump-hiw");
if (root) init(root);

function init(root: HTMLElement) {
  const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
  initHowItWorks(root);

  // Stage cards: a tap plays the scene on touch screens.
  root.querySelectorAll<HTMLElement>(".ai-part").forEach((c) => c.addEventListener("click", () => c.classList.toggle("is-playing")));

  // ---- Made for your role: the pill switch shows one panel ----
  const host = root.querySelector<HTMLElement>(".bdh-role-host")!;
  let roleTouched = false, first = true;
  const pills = initPillSwitch(root.querySelector<HTMLElement>(".bdh-roles-switch")!, {
    target: host,
    onChange: (id) => {
      host.querySelectorAll<HTMLElement>("[data-role-panel]").forEach((p) => {
        const on = p.dataset.rolePanel === id;
        p.hidden = !on;
        if (on && !first && !reduced()) { p.classList.remove("is-in"); void p.offsetWidth; p.classList.add("is-in"); }
      });
      first = false;
    },
  });
  root.querySelector(".bdh-roles-switch")!.addEventListener("click", () => { roleTouched = true; });

  // ---- Try it: the practice board ----
  const practiceEl = root.querySelector<HTMLElement>("[data-bd-practice]")!;
  const mascot = root.querySelector<HTMLTemplateElement>("[data-bd-mascot]")?.innerHTML.trim() || "";
  const slot = root.querySelector<HTMLElement>(".bdh-stamp-slot")!;
  let quest: Record<string, boolean> = {};
  const onPractice = (ev: string) => {
    const li = root.querySelector<HTMLElement>(`.bdh-quest li[data-q="${ev}"]`);
    if (quest[ev] || !li) return;
    quest[ev] = true;
    li.classList.add("is-done");
    if (quest.capture && quest.move && quest.check && !slot.firstChild) slot.innerHTML = stampHtml({ kicker: "Practice", label: "✓", sub: "You’ve got it", tone: "lime" });
  };
  const board = mount(practiceEl, { initial: practice, on: onPractice, mascot });
  root.querySelector("[data-try-reset]")!.addEventListener("click", () => {
    board.replace(practice());
    quest = {};
    root.querySelectorAll(".bdh-quest li").forEach((li) => li.classList.remove("is-done"));
    slot.innerHTML = "";
  });

  // ---- Buttons by viewer ----
  root.querySelectorAll<HTMLElement>("[data-bd-buy]").forEach((b) => b.addEventListener("click", () => void import("../../lib/checkout").then((m) => m.startCheckout("sub"))));
  const setViewer = (v: "access" | "member" | "visitor", role: "mod" | "admin" | "sub") => {
    root.dataset.viewer = v;
    root.querySelectorAll<HTMLElement>("[data-for]").forEach((el) => { el.hidden = el.dataset.for !== v; });
    if (!roleTouched) pills.set(role);
  };
  const roleFor = (s: AuthState) => {
    const crew = s.crewGrade != null && !["paused", "alumni"].includes(String(s.crewStatus || ""));
    if (s.isAdmin || s.isOwner || (crew && String(s.crewGrade).startsWith("A"))) return "admin" as const;
    return crew || s.roles.includes("mod") ? "mod" as const : "sub" as const;
  };
  const PREVIEW: Record<string, ["access" | "member", "mod" | "admin" | "sub"]> = {
    sub: ["access", "sub"], crew: ["access", "mod"], mod: ["access", "mod"], captain: ["access", "mod"], lead: ["access", "mod"], deckhand: ["access", "mod"],
    admin: ["access", "admin"], owner: ["access", "admin"], a2: ["access", "admin"], member: ["member", "sub"],
  };
  onAuth((s) => {
    if (s.status === "loading") return;
    const signedIn = !!s.user && (s.status === "verified" || s.status === "unverified");
    if (!signedIn) {
      const p = isProduction ? undefined : PREVIEW[new URLSearchParams(location.search).get("as") || ""];
      if (p) setViewer(p[0], p[1]); else setViewer("visitor", "sub");
      return;
    }
    setViewer(hasBrainDump(s) ? "access" : "member", roleFor(s));
  });
}

// The practice board (the mockup's example data). A new copy each time, so Start over begins fresh.
function practice(): BoardState {
  const rid = () => Math.random().toString(36).slice(2, 8);
  const cat = (title: string, color: BoardState["categories"][number]["color"], size: BoardState["categories"][number]["size"], placeholder: string, items: [string, (0 | 1)?, (0 | 1)?][]) =>
    ({ id: "p-" + rid(), title, color, size, placeholder, items: items.map(([text, d, s]) => ({ id: "i-" + rid(), text, done: !!d, starred: !!s })) });
  return {
    goal: "Example: get my week under control", goalDone: false, startDate: "",
    inbox: { items: [{ id: "x1", text: "Example · Look into a better mic arm" }, { id: "x2", text: "Example · Ask about Sunday’s duty" }] },
    categories: [
      cat("I need to call", "ember", "sm", "Add someone to call…", [["Example · The vet, before Friday"]]),
      cat("I need to email", "gold", "sm", "Add an email to send…", [["Example · Reply to the sponsor", 1], ["Example · Send the overlay invoice"]]),
      cat("Top priorities", "blue", "sm", "Add a top priority…", [["Example · Finish the stream schedule", 0, 1]]),
      cat("I want to make / create", "lime", "wide", "Add something to make…", [["Example · A Hot Seat question for Friday"]]),
    ],
  };
}
