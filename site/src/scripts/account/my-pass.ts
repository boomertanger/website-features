// My pass, the account page's first tab (docs/specs/club-pass.md §11; mockup docs/design/mockups/club-pass-my-pass.html, H1).
// Fills [data-mp] for the signed-in member: the hanging pass and hero, then the cards (Where your gold comes from, Payments,
// Twitch, Gifts, plus What Sub Club adds for Fan Club and the thank-you card for crew).
//   Data: the member's own sites/{siteId}/members/{uid}.club summary (server-written only) when it exists. Until billing and
//   Twitch counting write it, the plan comes from the auth roles ("sub" = Sub Club), crew from the crew grade claim, owner from
//   isOwner, and Twitch linked or not ALWAYS from users/{uid}.linked.twitch, the same field Linked accounts reads (lib/club-twitch.js:
//   club.twitch only adds the sub result). Nothing here writes.
//   Payments off (site.json clubPass.payments false): every buy and gift button is a disabled Opening soon, Payments and Gifts
//   show their empty states, and no renewal dates, receipts or gift rows.
//   Twitch (docs/specs/club-pass.md §12): once the broadcaster token is connected (public/clubPass.twitchCounting), the Twitch card shows
//   the sub result (tier, gifted, checked time) with Check again (clubLinkTwitch); before that, linked or not and "Twitch subs start
//   counting soon." After a check the ID token is refreshed, so a pass that turned gold (or back) updates without a reload.
//   The gold moment: the first time the tab is open while the pass is gold, the pass pops, confetti falls and the Welcome stamp
//   lands (reduced motion: the stamp only); remembered per viewer in localStorage bt.club.goldSeen.<uid>.
//   Off production, signed out, ?as=member previews Fan Club, ?as=sub Sub Club and ?as=crew (or a crew or admin role) the crew pass.
import { onAuth, refresh, getAuthState, type AuthState } from "../../lib/auth";
import { twitchView } from "../../lib/club-twitch.js";
import { messageFor } from "../../lib/errors";
import { isProduction } from "../../lib/env";
import { SITE_ID } from "../../lib/firebase";
import { escapeHtml as esc } from "../../../../shared/ui/dom.js";
import data from "../../data/club-pass.json";
import previewMember from "../../data/preview-member.json";

type Source = "fan" | "sub" | "twitch" | "stripe" | "gift" | "grant" | "crew" | "owner";
interface Club {
  plan?: "fan" | "sub";
  sources?: { stripe?: unknown; twitch?: unknown; gift?: unknown; grant?: unknown; crew?: unknown; owner?: unknown };
  twitch?: { linked?: boolean; login?: string; own?: boolean; sub?: boolean; tier?: string | number | null; gifted?: boolean; checkedAt?: number };
}
interface TwitchView { linked: boolean; login: string; own: boolean; tier: string; sub: boolean | null; gifted: boolean; checkedAt: number | null }
interface View { uid: string; handle: string; joined: Date | null; gold: boolean; crew: boolean; sources: Source[]; twitch: TwitchView; counting: boolean; preview: boolean }

const root = document.querySelector<HTMLElement>("[data-mp]");
if (root) init(root);

function init(root: HTMLElement) {
  const body = root.querySelector<HTMLElement>("[data-mp-body]")!;
  const PAY = root.dataset.pay === "on";
  const PRICE = root.dataset.price || "$5.99";
  const TWITCH_URL = root.dataset.twitch || "https://www.twitch.tv/";
  const CHANNEL = root.dataset.channel || "boomertanger";
  const PERKS = (data as { perks: { icon: string; label: string; plan: string }[] }).perks;
  const TOTAL = PERKS.length, FAN = PERKS.filter((p) => p.plan !== "sub").length;
  const M = root.querySelector<HTMLTemplateElement>("[data-mp-mascot]")!.innerHTML.trim();
  const TW = '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false"><path d="M4 3 3 6.5V20h4.5v2.5H10l2.5-2.5H16l5-5V3H4Zm15 11-3 3h-4l-2.5 2.5V17H6.5V5H19v9Zm-3-6h-2v5h2V8Zm-5 0H9v5h2V8Z"/></svg>';
  const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
  const month = (d: Date) => d.toLocaleDateString(undefined, { month: "short", year: "numeric" });
  let view: View | null = null;
  let note = "";   // the Twitch card's last Check again message

  // ---------- the viewer ----------
  const members = new Map<string, Promise<{ club: Club | null; joined: Date | null; counting: boolean }>>();
  function memberDoc(uid: string) {
    if (!members.has(uid)) members.set(uid, (async () => {
      try {
        const { db, doc, getDoc } = await import("../../lib/db");
        const snap = await getDoc(doc(db, "sites", SITE_ID, "members", uid));
        const d = snap.exists() ? snap.data() : {};
        const pub = await getDoc(doc(db, "sites", SITE_ID, "public", "clubPass")).catch(() => null);
        return { club: (d.club as Club | undefined) ?? null, joined: (d.joinedAt as { toDate?(): Date } | undefined)?.toDate?.() ?? null, counting: !!pub?.get("twitchCounting") };
      } catch (err) {
        console.error("my pass: couldn't read the member summary", err);
        return { club: null, joined: null, counting: false };
      }
    })());
    return members.get(uid)!;
  }

  function sourcesOf(club: Club | null, sub: boolean, crew: boolean, owner: boolean): Source[] {
    const from = club?.sources ? (["owner", "twitch", "stripe", "gift", "grant", "crew"] as const).filter((k) => club.sources![k]) : [];
    if (from.length) return [...from];
    const out: Source[] = [];
    if (owner) out.push("owner");
    if (sub && !owner) out.push("sub");
    if (crew) out.push("crew");
    return out.length ? out : ["fan"];
  }

  async function viewOf(s: AuthState): Promise<View | null> {
    const member = !!s.user && (s.status === "verified" || s.status === "unverified");
    if (member) {
      const uid = s.user!.uid, m = await memberDoc(uid);
      const crew = s.crewGrade != null && !["paused", "alumni"].includes(String(s.crewStatus || ""));
      const owner = !!s.isOwner;
      const sub = m.club?.plan ? m.club.plan === "sub" : s.roles.includes("sub");
      const sources = sourcesOf(m.club, sub, crew, owner);
      return {
        uid, handle: s.profile?.handle ? `@${s.profile.handle}` : "", joined: m.joined ?? s.profile?.joinedAt?.toDate?.() ?? null,
        gold: !sources.includes("fan"), crew: sources.includes("crew"), sources,
        twitch: twitchView(s.account?.linked?.twitch ?? null, m.club?.twitch ?? null, CHANNEL),
        counting: m.counting, preview: false,
      };
    }
    if (isProduction || s.status !== "signedOut") return null;
    const as = new URLSearchParams(location.search).get("as") || "";
    const kind = as === "member" || as === "fan" ? "fan" : as === "sub" ? "sub" : as === "owner" || as === "admin" ? "owner" : ["crew", "mod", "captain", "lead", "deckhand", "a2"].includes(as) ? "crew" : null;
    if (!kind) return null;
    const sources: Source[] = kind === "fan" ? ["fan"] : kind === "sub" ? ["sub"] : kind === "owner" ? ["owner"] : ["crew"];
    // ?twitch=linked | sub | nosub | own previews the Twitch card (sub and nosub as if counting were on).
    const tw = new URLSearchParams(location.search).get("twitch") || "";
    const twitch: TwitchView = twitchView(tw ? { id: "1", login: tw === "own" ? CHANNEL : "gbo_tv" } : null, tw && tw !== "linked" && tw !== "own" ? { linked: true, sub: tw === "sub", tier: "1", checkedAt: Date.now() } : null, CHANNEL);
    if (tw === "sub" && kind === "fan") sources.splice(0, 1, "twitch");
    return { uid: `preview-${kind}`, handle: `@${previewMember.name.toLowerCase()}`, joined: new Date(), gold: kind !== "fan" || tw === "sub", crew: kind === "crew", sources, twitch, counting: tw === "sub" || tw === "nosub" || tw === "own", preview: true };
  }

  // ---------- the pieces ----------
  const subBtn = (label = "Get Sub Club") => PAY
    ? `<button class="bt-btn bt-btn--primary" type="button" data-mp-buy data-pulse="my-pass-get-sub-club">${esc(label)}</button>`
    : '<button class="bt-btn bt-btn--secondary" type="button" disabled>Sub Club opening soon</button>';
  // Gifts are a later part: "Gifts open soon" even with payments on.
  const giftBtn = () => '<button class="bt-btn bt-btn--secondary" type="button" disabled>Gifts open soon</button>';
  // The perk board on /club-pass (it starts on the viewer's own pass). Fan Club: "See what Sub Club adds", same place.
  const perksBtn = (kind = "primary", fan = false) => `<a class="bt-btn bt-btn--${kind}" href="/club-pass#ch-perks" data-pulse="my-pass-see-perks">${fan ? "See what Sub Club adds" : "See your perks"}</a>`;
  const head = (t: string) => `<div class="bt-card-head"><h3 class="bt-card-title">${t}</h3></div>`;
  const empty = (title: string, text: string) => `<div class="bt-empty bt-empty--compact"><span class="bt-empty-title">${title}</span><span>${text}</span></div>`;
  const lead = (v: View): Source => (["owner", "crew", "twitch", "stripe", "gift", "grant", "sub"] as Source[]).find((k) => v.sources.includes(k)) || "fan";
  const clock = (ms: number) => {
    const d = new Date(ms), today = new Date().toDateString() === d.toDateString();
    return `${today ? "today" : d.toLocaleDateString(undefined, { month: "short", day: "numeric" })} ${d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`;
  };

  function hero(v: View) {
    const k = lead(v);
    const [status, line] = ({
      fan: ["Your free pass. It never expires.", v.counting && v.twitch.sub === false ? "Your Twitch is linked, but no sub to Boomertanger was found."
        : PAY ? `Sub Club adds ${TOTAL - FAN} more perks and everything coming soon.` : v.counting ? "Sub Club opens soon. Got a Twitch sub? It already counts." : "Sub Club opens soon, and Twitch subs will count too."],
      sub: ["Gold. Every perk is yours.", "Your pass stays gold for as long as your Sub Club lasts."],
      twitch: ["Gold through your Twitch sub.", "It stays gold for as long as your Twitch sub lasts."],
      stripe: ["Gold, paid here.", `${PRICE} a month. Cancel any time.`],
      gift: ["Gold, a gift.", "A gift month keeps your pass gold. Get Sub Club before it ends to stay gold."],
      grant: ["Gold, from Boomertanger.", "Your pass was turned gold by the channel."],
      owner: ["Gold, it's your channel.", "The owner's pass is always Sub Club."],
      crew: ["Gold, on the crew.", "Crew get Sub Club free for as long as they're on the crew."],
    } as Record<Source, [string, string]>)[k];
    const cta = k === "fan" ? subBtn() + perksBtn("secondary", true) + (v.twitch.linked
        ? `<a class="bt-btn bt-btn--secondary" href="${esc(TWITCH_URL)}" target="_blank" rel="noopener" data-pulse="my-pass-sub-on-twitch">Sub on Twitch ↗</a>`
        : '<a class="bt-btn bt-btn--secondary" href="#linked" data-pulse="my-pass-link-twitch">Link Twitch</a>')
      : k === "crew" ? perksBtn() + '<a class="bt-btn bt-btn--secondary" href="/crew/hq">Crew HQ</a>'
      : k === "owner" ? perksBtn() + '<a class="bt-btn bt-btn--secondary" href="/admin">Admin tools</a>'
      : k === "gift" ? subBtn("Keep it gold") + perksBtn("secondary")
      : perksBtn() + giftBtn();
    const plan = v.gold ? "Sub Club" : "Fan Club";
    const facts = [v.joined ? `Member since ${month(v.joined)}` : "", v.handle, `${v.gold ? TOTAL : FAN} of ${TOTAL} perks`].filter(Boolean);
    return `<div class="mp-hero${v.gold ? " is-gold" : ""}" data-mp-hero>
      <div class="mp-hero-scene"><div class="mp-hang"><span class="mp-strap"></span><span class="mp-clip"></span>
        <div class="bt-pass${v.gold ? " bt-pass--sub" : ""}" role="img" aria-label="Your ${plan} pass"><span class="bt-pass-top" aria-hidden="true">CLUB PASS</span>${M}<span class="bt-pass-plan" aria-hidden="true">${plan.toUpperCase()}</span><span class="bt-pass-price" aria-hidden="true">${v.gold ? "ALL ACCESS" : "FREE"}</span>${v.handle ? `<span class="bt-pass-name" aria-hidden="true">${esc(v.handle)}</span>` : ""}<span class="bt-pass-code"></span></div>
      </div></div>
      <div><p class="mp-kick">My pass</p><h2 class="mp-plan">${plan}</h2><p class="mp-status">${status}<small>${line}</small></p>
        <div class="mp-facts">${facts.map((f) => `<span class="mp-chip">${esc(f)}</span>`).join("")}</div>
        <div class="mp-cta">${cta}</div></div>
    </div>`;
  }

  function sources(v: View) {
    const SRC: Record<Source, [string, string, string, boolean]> = {
      fan: ["🎟️", "Fan Club pass", "Free, no end date", false],
      sub: ["🎟️", "Sub Club pass", "Gold on your account", true],
      twitch: [TW, "Twitch sub", `${v.twitch.tier ? `Tier ${esc(v.twitch.tier)} · ` : ""}lasts as long as your Twitch sub${v.twitch.checkedAt ? ` · checked ${clock(v.twitch.checkedAt)}` : ""}`, true],
      stripe: ["💳", "Paid here", `${PRICE} a month`, true],
      gift: ["🎁", "Gift", "One month, never renews", true],
      grant: ["🎟️", "From Boomertanger", "Turned gold by the channel", true],
      owner: ["🎬", "Owner", "It's your channel, so it's always gold", true],
      crew: ["🛡️", "Crew pass", "Free while you're on the crew", true],
    };
    return `<div class="bt-card">${head(`Where your ${v.gold ? "gold" : "pass"} comes from`)}${v.sources.map((k) => {
      const [ic, t, d, g] = SRC[k];
      return `<div class="mp-src"><span class="mp-src-ic${g ? " is-gold" : ""}${k === "twitch" ? " is-twitch" : ""}" aria-hidden="true">${ic}</span><div><b>${t}</b><small>${d}</small></div><span class="bt-pill-ok">Active</span></div>`;
    }).join("")}${v.sources.length > 1 ? '<p class="bt-fine bt-fine--left mp-note">Any one of these keeps you gold.</p>' : ""}</div>`;
  }

  function payments(v: View) {
    const k = lead(v);
    return `<div class="bt-card">${head("Payments")}${k === "owner" ? empty("Nothing to pay", "It's your channel.") : k === "crew" ? empty("Nothing to pay", "Crew passes are on the house.")
      : k === "twitch" && !v.sources.includes("stripe") ? empty("Nothing to pay here", "Your Twitch sub covers Sub Club.")
      : empty("No payments yet", "Receipts for Sub Club, gifts and tips show up here.")}</div>`;
  }

  function twitch(v: View) {
    const icon = `<span class="bt-platform-icon bt-platform-icon--twitch" aria-hidden="true">${TW}</span>`;
    const t = v.twitch, name = esc(t.login || "Twitch");
    const checkBtn = '<button class="bt-btn bt-btn--ghost" type="button" data-mp-check data-pulse="my-pass-check-again">Check again</button>';
    const accounts = '<a class="bt-btn bt-btn--ghost" href="#linked">Linked accounts</a>';
    const subLink = `<a class="bt-btn bt-btn--secondary" href="${esc(TWITCH_URL)}" target="_blank" rel="noopener" data-pulse="my-pass-sub-on-twitch">Sub on Twitch ↗</a>`;
    const when = t.checkedAt ? ` · checked ${clock(t.checkedAt)}` : "";
    let rows: string;
    if (!t.linked) rows = `<div class="bt-set-row">${icon}<div class="bt-set-row-main"><b>Not linked</b><small>${v.counting ? "Sub to Boomertanger on Twitch? Link it and your pass turns gold." : "Sub to Boomertanger on Twitch? Link it here so your sub can count."}</small></div><a class="bt-btn bt-btn--secondary" href="#linked" data-pulse="my-pass-link-twitch">Link Twitch</a></div>`;
    else if (t.own) rows = `<div class="bt-set-row">${icon}<div class="bt-set-row-main"><b>${name}</b><small>This is the channel's own Twitch account.</small></div><span class="bt-pill-ok">Linked</span></div><div class="mp-row-actions">${accounts}</div>`;
    else if (!v.counting || t.sub === null) rows = `<div class="bt-set-row">${icon}<div class="bt-set-row-main"><b>${name}</b><small>Linked to your account${v.counting ? " · not checked yet" : ""}</small></div><span class="bt-pill-ok">Linked</span></div><div class="mp-row-actions">${v.counting ? checkBtn : ""}${accounts}</div>`;
    else if (t.sub) rows = `<div class="bt-set-row">${icon}<div class="bt-set-row-main"><b>${name}</b><small>Tier ${esc(t.tier || "1")}${t.gifted ? " gifted" : ""} sub to Boomertanger${when}</small></div><span class="bt-pill-ok">Sub found</span></div><div class="mp-row-actions">${checkBtn}${accounts}</div>`;
    else rows = `<div class="bt-set-row">${icon}<div class="bt-set-row-main"><b>${name}</b><small>No sub to Boomertanger found${when}</small></div><span class="bt-pill-warn">No sub</span></div><div class="mp-row-actions">${subLink}${checkBtn}</div>`;
    const fine = t.own ? "The channel's own account isn't checked for a sub." : v.counting ? "Prime and gifted subs count too." : "Twitch subs start counting soon.";
    return `<div class="bt-card">${head("Twitch")}${rows}<p class="bt-fine bt-fine--left mp-note" data-mp-note role="status">${esc(note || fine)}</p></div>`;
  }

  const gifts = () => `<div class="bt-card">${head("Gifts")}${empty("No gifts yet", "Give someone a month of Sub Club. It never renews.")}<div class="mp-row-actions">${giftBtn()}</div></div>`;

  function upgrade() {
    const tiles = PERKS.map((p, i) => `<i style="--i:${i}" class="${p.plan === "sub" ? "is-off" : ""}" title="${esc(p.label)}">${p.icon}</i>`).join("");
    return `<div class="bt-card mp-wide"><div class="mp-board" data-mp-board>
      <div class="mp-board-main" role="button" tabindex="0" aria-pressed="false" aria-label="Show the board with Sub Club's ${TOTAL} perks">${head("What Sub Club adds")}<p class="bt-fine bt-fine--left" style="margin:0">Hover or tap the board to see it go gold.</p><div class="mp-tiles" aria-hidden="true">${tiles}</div></div>
      <div class="mp-board-side"><div class="mp-count" data-mp-count>${FAN} <small>of ${TOTAL} perks</small></div>${subBtn()}<span class="bt-fine bt-fine--left" style="margin:0">${PRICE} a month · cancel any time<br>Under 18? A parent or guardian says yes at checkout.</span></div>
    </div></div>`;
  }

  const crewCard = () => `<div class="bt-card mp-wide"><div class="mp-crew">${M}<div><b>Thanks for keeping chat a good place.</b><p class="bt-fine bt-fine--left" style="margin:4px 0 0">Your crew pass gives you every Sub Club perk. If you ever step down, your pass goes back to Fan Club and everything you earned stays yours.</p></div></div></div>`;

  function bindBoard() {
    const board = body.querySelector<HTMLElement>("[data-mp-board]");
    if (!board) return;
    const main = board.querySelector<HTMLElement>(".mp-board-main")!, count = board.querySelector<HTMLElement>("[data-mp-count]")!;
    const set = (on: boolean) => {
      board.classList.toggle("is-preview", on);
      main.setAttribute("aria-pressed", String(on));
      count.innerHTML = `${on ? TOTAL : FAN} <small>of ${TOTAL} perks</small>`;
    };
    board.addEventListener("mouseenter", () => set(true));
    board.addEventListener("mouseleave", () => set(false));
    main.addEventListener("click", () => set(!board.classList.contains("is-preview")));
    main.addEventListener("keydown", (ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); set(!board.classList.contains("is-preview")); } });
  }

  // ---------- the gold moment ----------
  const seenKey = (uid: string) => `bt.club.goldSeen.${uid}`;
  function goldMoment() {
    if (!view?.gold || root.hidden) return;
    const key = seenKey(view.uid);
    try { if (localStorage.getItem(key)) return; localStorage.setItem(key, String(Date.now())); } catch { /* no storage: it plays each visit */ }
    const hero = body.querySelector<HTMLElement>("[data-mp-hero]");
    if (!hero) return;
    hero.classList.remove("is-flash"); void hero.offsetWidth; hero.classList.add("is-flash");
    const st = document.createElement("span");
    st.className = "bt-stamp bt-stamp--sm mp-welcome"; st.setAttribute("role", "img"); st.setAttribute("aria-label", "Welcome to Sub Club");
    st.innerHTML = '<span aria-hidden="true">Welcome<small>to Sub Club</small></span>';
    hero.appendChild(st);
    if (reduced()) return;
    const w = hero.clientWidth, cols = ["var(--bt-title)", "var(--bt-lamp)", "var(--bt-pass-fan)", "var(--bt-fuse)"];
    for (let i = 0; i < 70; i++) {
      const c = document.createElement("span"); c.className = "mp-confetti";
      c.style.left = `${Math.random() * w}px`; c.style.background = cols[i % cols.length];
      c.style.setProperty("--dx", `${Math.random() * 120 - 60}px`); c.style.setProperty("--r", `${Math.random() * 720 - 360}deg`); c.style.setProperty("--d", `${1.2 + Math.random() * 1.2}s`);
      c.style.animationDelay = `${Math.random() * 0.3}s`;
      hero.appendChild(c); setTimeout(() => c.remove(), 3000);
    }
  }
  // the tab opening (page.ts toggles the pane's hidden)
  new MutationObserver(() => goldMoment()).observe(root, { attributes: true, attributeFilter: ["hidden"] });

  // ---------- Check again (clubLinkTwitch, 1 a minute) ----------
  function bindCheck() {
    const btn = body.querySelector<HTMLButtonElement>("[data-mp-check]");
    if (!btn) return;
    btn.addEventListener("click", async () => {
      const line = body.querySelector<HTMLElement>("[data-mp-note]");
      if (view?.preview) { if (line) line.textContent = "Preview: nothing checked."; return; }
      btn.disabled = true; btn.textContent = "Checking…";
      try {
        const { call } = await import("../../lib/call");
        const r = await call<{ sub?: boolean; counting?: boolean }>("clubLinkTwitch");
        note = r.counting === false ? "" : r.sub ? "Sub found. Your pass is gold." : "Checked: no sub to Boomertanger found.";
      } catch (err) { note = messageFor(err, "Couldn't check Twitch. Try again in a minute."); }
      const uid = getAuthState().user?.uid;
      if (uid) members.delete(uid);
      last = "";
      await refresh({ forceToken: true }).catch(() => {});   // the new claims: the pass (and every page) updates without a reload
      await render(getAuthState());
    });
  }

  // ---------- render ----------
  let seq = 0, last = "";
  async function render(s: AuthState) {
    const n = ++seq;
    const v = await viewOf(s);
    if (n !== seq) return;
    const key = JSON.stringify(v);
    if (key === last) return;
    last = key; view = v;
    if (!v) { body.innerHTML = ""; return; }
    body.innerHTML = hero(v) + `<div class="mp-grid">${sources(v)}${payments(v)}${twitch(v)}${gifts()}${v.gold ? "" : upgrade()}${v.crew ? crewCard() : ""}</div>`;
    bindBoard();
    bindCheck();
    body.querySelectorAll<HTMLButtonElement>("[data-mp-buy]").forEach((b) => b.addEventListener("click", () => {
      if (view?.preview) { b.textContent = "Preview: no checkout"; return; }
      void import("../../lib/checkout").then((m) => m.startCheckout("sub"));
    }));
    goldMoment();
  }
  onAuth((s) => { void render(s); });
}
