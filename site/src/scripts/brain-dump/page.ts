// /brain-dump (docs/specs/brain-dump.md §1-§3): who sees what, then the board. [data-bd-when] sections: loading | visitor (a lock card
// that opens Join free) | locked (signed in without Brain Dump: "Brain Dump comes with Sub Club." with Get Sub Club) | board.
// With access the engine (scripts/brain-dump/engine.ts) mounts on the member's own Firestore document (scripts/brain-dump/store.ts).
// Losing access later shows the lock card and leaves the document alone. Off production, signed out, ?as=sub (or crew, admin, owner)
// previews the board in memory (nothing saved) and ?as=member the lock card.
import { onAuth, type AuthState } from "../../lib/auth";
import { hasBrainDump } from "../../lib/brain-dump-access";
import { isProduction } from "../../lib/env.js";
import { mount, type BoardApi } from "./engine";

const root = document.getElementById("brain-dump-root");
if (root) init(root);

function init(root: HTMLElement) {
  const board = root.querySelector<HTMLElement>("[data-bd-board]")!;
  const mascot = root.querySelector<HTMLTemplateElement>("[data-bd-mascot]")?.innerHTML.trim() || "";
  const show = (which: string) => root.querySelectorAll<HTMLElement>("[data-bd-when]").forEach((el) => { el.hidden = el.dataset.bdWhen !== which; });
  let mountedFor = "", api: BoardApi | null = null;

  root.querySelectorAll<HTMLElement>("[data-bd-buy]").forEach((b) => b.addEventListener("click", () => void import("../../lib/checkout").then((m) => m.startCheckout("sub"))));

  function previewKind(): "board" | "locked" | null {
    if (isProduction) return null;
    const as = new URLSearchParams(location.search).get("as") || "";
    if (["sub", "crew", "mod", "captain", "lead", "deckhand", "admin", "owner", "a2"].includes(as)) return "board";
    if (as === "member") return "locked";
    return null;
  }

  async function view(s: AuthState) {
    if (s.status === "loading") { show("loading"); return; }
    const signedIn = !!s.user && (s.status === "verified" || s.status === "unverified");
    if (!signedIn) {
      const p = previewKind();
      if (p === "board") {
        show("board");
        if (mountedFor !== "preview") {
          mountedFor = "preview";
          api = mount(root, { mascot });
          api.setSaved("Preview: nothing is saved");
        }
        return;
      }
      show(p === "locked" ? "locked" : "visitor");   // signed out, or signup not finished: Join free (it resumes the signup steps)
      return;
    }
    if (!hasBrainDump(s)) { show("locked"); return; }   // the board's document stays as it is
    show("board");
    const uid = s.user!.uid;
    if (mountedFor === uid) return;
    if (mountedFor) { location.reload(); return; }   // another account on the same tab: start clean
    mountedFor = uid;
    const saved = (t: string) => api?.setSaved(t);
    const { openStore } = await import("./store");
    const store = await openStore(uid, {
      status: (st) => saved(st === "saving" ? "Saving…" : st === "saved" ? "Saved" : st === "offline" ? "Saved on this device. It goes up when you're back online." : "Not saved yet. Trying again with your next change."),
    });
    api = mount(root, { initial: () => store.initial, store, mascot });
    store.listen(api, board);
  }
  onAuth((s) => { void view(s); });
}
