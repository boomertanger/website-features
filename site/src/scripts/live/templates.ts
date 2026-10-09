// /live/control/checklist (docs/specs/control-room.md §5): the owner's four checklist templates. OWNER ONLY: LiveLayout's ownerOnly gate shows the
// no-access state to everyone else before this runs, and this file asks for nothing unless the role is "owner". The editor itself comes next.
import { onAccess } from "./layout";
import { esc, mascotHtml } from "./ui";

onAccess((_s, role) => {
  if (role !== "owner") return;   // the gate already kept everyone else out; this is the second lock
  const root = document.querySelector<HTMLElement>("[data-lt]")!;
  root.innerHTML = `<h1 class="bt-title lc-title">${esc("Checklist templates")}</h1><div class="lc-empty">${mascotHtml()}<p>Your four lists (Start, Break 1, Break 2, End) will be edited here.</p></div>`;
});
