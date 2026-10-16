// shared/ui/admit.js — .bt-admit, the gold "Admit one" tear-off ticket (docs/design-system.md §5 "Club Pass pieces"; docs/specs/club-pass.md §3).
// bindAdmit(root): every [data-admit-tear] inside a .bt-admit tears the stub off (it falls away, then grows back after a moment), and the
// button still does its own job (it's usually Join free). Reduced motion: the CSS just fades the stub. Safe to call more than once.
export function tearAdmit(ticket) {
  if (!ticket) return;
  ticket.classList.remove("is-torn");
  void ticket.offsetWidth;
  ticket.classList.add("is-torn");
  clearTimeout(ticket._btAdmit);
  ticket._btAdmit = setTimeout(() => ticket.classList.remove("is-torn"), 2600);
}

export function bindAdmit(root = document) {
  root.querySelectorAll(".bt-admit").forEach((t) => {
    if (t.dataset.btAdmit) return;
    t.dataset.btAdmit = "1";
    t.addEventListener("click", (e) => { if (e.target.closest("[data-admit-tear]")) tearAdmit(t); });
  });
}
