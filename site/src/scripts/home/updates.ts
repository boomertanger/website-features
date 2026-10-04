// The home Latest updates tile for signed-in members: the newest activityLog events (every
// feature writes them from functions; rules let signed-in members read). Game Vault events get
// their covers: the "games added" digest shows up to three as a stack that fans out on hover or
// focus (G4), and while the page is open it checks again every minute, so a digest that keeps
// counting slides its new cover in, ticks the count and glows gold for a moment (G3). Visitors
// keep the preview rows; whether they see the real feed is decided with the home tile.
import { collection, getDocs, getDoc, doc, query, orderBy, limit } from "firebase/firestore/lite";
import { coverHtml } from "../../../../shared/ui/cover.js";
import { escapeHtml as esc } from "../../../../shared/ui/dom.js";
import { onAuth } from "../../lib/auth";

const tile = document.querySelector<HTMLElement>("[data-updates]");
const POLL_MS = 60_000, ROWS = 5;
const ICON: Record<string, string> = { "now-playing": "🎮", finished: "🏁", "games-added": "🗝️" };
const reduce = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

interface Ev { id: string; feature?: string; type?: string; summary?: string; link?: string; createdAt?: { toMillis(): number }; count?: number; titles?: string[]; covers?: any[]; gameId?: string }
let covers: Map<string, any> | null = null;      // the Vault's covers, read once (public/vault) when an event needs one
let last: Map<string, Ev> = new Map();
let timer = 0;

function when(ms?: number) {
  if (!ms) return "";
  const min = Math.round((Date.now() - ms) / 60000);
  if (min < 1) return "Just now";
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} h ago`;
  if (h < 48) return "Yesterday";
  return new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

async function vaultCovers(db: any) {
  if (covers) return covers;
  covers = new Map();
  try {
    const snap = await getDoc(doc(db, "sites", "boomertanger", "public", "vault"));
    for (const g of (snap.data()?.games || []) as any[]) covers.set(g.slug, g.cover || null);
  } catch { /* no covers, then */ }
  return covers;
}

function row(e: Ev, prev: Ev | undefined) {
  const ms = e.createdAt?.toMillis?.();
  const href = e.link && e.link.startsWith("/") ? e.link : "";
  const open = (cls: string) => (href ? `<a class="${cls}" href="${esc(href)}" data-ev="${esc(e.id)}">` : `<div class="${cls}" data-ev="${esc(e.id)}">`);
  const close = href ? "</a>" : "</div>";
  if (e.feature === "game-vault" && e.type === "games-added") {
    const n = e.count || 0;
    const cs = (e.covers || []).slice(0, 3);
    const grew = !!prev && (prev.count || 0) < n;
    const stack = `<span class="gv-fan" aria-hidden="true">${cs.map((c, i) => coverHtml(c, { cls: i === 0 && grew && !reduce() ? "is-new" : "", size: "sm" }).replace("<span class=\"bt-cover", `<span style="--i:${i + 1}" class="bt-cover`)).join("")}</span>`;
    const names = (e.titles || []).slice(0, 2).map(esc).join(", ");
    const more = n > 2 ? ` and ${n - 2} more` : "";
    const head = n > 1 ? `<b class="gv-n">${n}</b> games added to the Vault` : esc(e.summary || "A game was added to the Vault");
    return `${open(`bt-upd gv-upd-live gv-fanrow${grew ? " is-flash" : ""}`)}${cs.length ? stack : `<span class="bt-upd-ic" aria-hidden="true">${ICON["games-added"]}</span>`}<div><strong>${head}</strong><span>${n > 1 ? `${names}${more}. ` : ""}${when(ms)}</span></div>${close}`;
  }
  const cover = e.feature === "game-vault" && e.gameId && covers?.has(e.gameId) ? covers.get(e.gameId) : undefined;
  const art = cover !== undefined ? `<span class="gv-fan" aria-hidden="true">${coverHtml(cover, { size: "sm" })}</span>` : `<span class="bt-upd-ic" aria-hidden="true">${ICON[e.type || ""] || "✨"}</span>`;
  return `${open("bt-upd")}${art}<div><strong>${esc(e.summary || "")}</strong><span>${when(ms)}</span></div>${close}`;
}

async function load() {
  const live = tile!.querySelector<HTMLElement>("[data-upd-live]")!;
  try {
    const { db } = await import("../../lib/db");
    const snap = await getDocs(query(collection(db, "activityLog"), orderBy("createdAt", "desc"), limit(ROWS)));
    const evs: Ev[] = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
    if (evs.some((e) => e.feature === "game-vault" && e.gameId)) await vaultCovers(db);
    live.innerHTML = evs.length ? evs.map((e) => row(e, last.get(e.id))).join("") : '<p class="bt-meta">Nothing new yet.</p>';
    last = new Map(evs.map((e) => [e.id, e]));
    // the gold glow fades back out
    live.querySelectorAll(".is-flash").forEach((el) => requestAnimationFrame(() => requestAnimationFrame(() => el.classList.remove("is-flash"))));
    live.hidden = false;
    tile!.querySelector<HTMLElement>("[data-upd-preview]")!.hidden = true;
    tile!.querySelector<HTMLElement>("[data-upd-tag]")!.hidden = true;
  } catch (err) {
    console.warn("updates: the feed didn't load", err);
  }
}

function stop() { clearInterval(timer); timer = 0; }
if (tile) {
  onAuth((s) => {
    if (s.status === "loading") return;
    const member = !!s.user && s.status !== "needsSignup";
    if (!member) {
      stop();
      tile.querySelector<HTMLElement>("[data-upd-live]")!.hidden = true;
      tile.querySelector<HTMLElement>("[data-upd-preview]")!.hidden = false;
      tile.querySelector<HTMLElement>("[data-upd-tag]")!.hidden = false;
      return;
    }
    load();
    if (!timer) timer = window.setInterval(() => { if (document.visibilityState === "visible") load(); }, POLL_MS);
  });
}
