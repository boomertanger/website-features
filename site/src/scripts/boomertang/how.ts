// /boomertang/how-it-works (docs/specs/boomertang.md §6): the shared How it works behaviour (journey, stage-card spotlight, Ask BOOMBOT), a tap
// playing a stage card's scene on touch screens, the working tag example (tap a tag: its source, trust and checked note), the "publish the
// next issue" table (a pretend shelf: Nos. 2 to 4 are samples; No. 3 is one Boomer made free), and the real Paper / Ink switch (it sets the
// reader's mode: on the account when signed in). The hero's press plays once, in CSS (reduced motion: the finished stack).
import { initHowItWorks } from "../../../../shared/ui/how-it-works.js";
import { factagHtml } from "../../../../shared/ui/magazine.js";
import { toast } from "../../../../shared/ui/toast.js";
import { onAuth } from "../../lib/auth";
import { modeNow, setMode, onMode, followAccount, type Mode } from "./mode";

const root = document.getElementById("boomertang-hiw");
if (root) init(root);

function init(root: HTMLElement) {
  initHowItWorks(root);
  root.querySelectorAll<HTMLElement>(".ai-part").forEach((c) => c.addEventListener("click", () => c.classList.toggle("is-playing")));

  // ---- 03: the tag example ----
  const facts = JSON.parse(root.querySelector("[data-tang-example]")!.textContent || "[]") as { id: string; trust: string; source: string; title: string; note: string; href: string; version: string }[];
  const panel = root.querySelector<HTMLElement>("[data-tag-source]")!;
  const tags = Array.from(root.querySelectorAll<HTMLButtonElement>(".tgh-paper [data-factag-source]"));
  tags.forEach((b) => b.addEventListener("click", () => {
    const f = facts.find((x) => x.source === b.dataset.source);
    if (!f) return;
    tags.forEach((t) => t.setAttribute("aria-expanded", String(t === b)));
    panel.innerHTML = `<span class="bt-label">Source</span><b>${esc(f.title)}</b><div>${factagHtml({ trust: f.trust, version: f.version })}</div><p>${esc(f.note)}</p><a class="bt-link-btn" href="${esc(f.href)}">See it in The Index</a>`;
  }));

  // ---- 04: who reads what ----
  const rows = root.querySelector<HTMLElement>("[data-access-rows]")!, pubBtn = root.querySelector<HTMLButtonElement>("[data-publish]")!;
  let shown = 1, flash = 0;
  function paintTable() {
    const issues = Array.from({ length: shown }, (_, k) => k + 1);
    const newest = shown;
    rows.innerHTML = issues.slice().reverse().map((no) => {
      const isNew = no === newest;
      const pub = no === 1 || no === 3;   // No. 1 is free for everyone; No. 3 is one Boomer made free
      const fan = pub || !isNew;
      const label = no === 1 ? "Free for everyone" : pub ? "Made public by Boomer" : isNew ? "Newest issue" : "Back issue";
      const cell = (ok: boolean, no2 = "") => `<td class="${ok ? "y" : "n"}">${ok ? "Reads it" : no2 || "Locked"}</td>`;
      return `<tr class="${isNew ? "is-new" : ""}${flash === no ? " flash" : ""}"><td>No. ${no}${no > 1 ? ' <span class="tg-sample">Sample</span>' : ""}<small>${label}</small></td>${cell(pub)}${cell(fan, `When No. ${no + 1} is out`)}${cell(true)}</tr>`;
    }).join("");
    pubBtn.disabled = shown >= 4;
    pubBtn.textContent = shown >= 4 ? "That's the pretend shelf" : `Try it: publish No. ${shown + 1}`;
  }
  pubBtn.addEventListener("click", () => {
    if (shown >= 4) return;
    shown++; flash = shown; paintTable();
    toast(`No. ${shown} is out (pretend). No. ${shown - 1} is a back issue now.`, { kind: "ok", ms: 3600 });
  });
  root.querySelector("[data-publish-reset]")!.addEventListener("click", () => { shown = 1; flash = 0; paintTable(); });
  paintTable();

  // ---- 05: Paper or Ink, for real ----
  const sw = root.querySelector<HTMLElement>("[data-mode-switch]")!, mini = root.querySelector<HTMLElement>(".tgh-mini")!;
  const show = (m: Mode) => { sw.querySelectorAll<HTMLElement>("[data-mode]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.mode === m))); mini.dataset.mode = m; };
  show(modeNow());
  onMode(show);
  sw.addEventListener("click", (e) => {
    const b = (e.target as Element).closest<HTMLElement>("[data-mode]");
    if (!b || b.getAttribute("aria-pressed") === "true") return;
    const m = b.dataset.mode as Mode;
    void setMode(m).then((where) => toast(`${m === "ink" ? "Ink" : "Paper"}. ${where === "account" ? "Saved to your account." : "Remembered in this browser."}`, { kind: "ok", ms: 3200 }));
  });
  onAuth((s) => { if (s.status !== "loading") followAccount(s); });
}

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
