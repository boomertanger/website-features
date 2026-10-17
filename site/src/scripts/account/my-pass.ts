// My pass, the account page's first tab (docs/specs/club-pass.md §11; mockup docs/design/mockups/club-pass-my-pass.html, H1).
// Fills [data-mp] for the signed-in member: the hanging pass and hero, then the cards (Where your gold comes from, Payments,
// Twitch, Gifts, plus What Sub Club adds for Fan Club and the thank-you card for crew).
//   Data: the member's own sites/{siteId}/members/{uid}.club summary (server-written only) when it exists. Until billing and
//   Twitch counting write it, the plan comes from the auth roles ("sub" = Sub Club), crew from the crew grade claim, owner from
//   isOwner, and Twitch linked or not ALWAYS from users/{uid}.linked.twitch, the same field Linked accounts reads (lib/club-twitch.js:
//   club.twitch only adds the sub result). Nothing here writes.
//   Payments off (site.json clubPass.payments false): every buy and gift button is a disabled Opening soon, Payments and Gifts
//   show their empty states, and no renewal dates, receipts or gift rows.
//   Billing (docs/specs/club-pass.md §13; payments on for staging only): club.sources.stripe gives the state (paid here, cancelled, payment
//   failed with its grace date, a one-month pass, or paying twice with a Twitch sub); clubStatus gives the receipts and the next charge;
//   Manage payment, Resume, Fix my card and Cancel the site subscription open Stripe's customer portal (clubPortal). Back from Checkout
//   (?checkout=success) the page waits for the webhook, refreshes the ID token and redraws, so the gold moment plays.
//   Twitch (docs/specs/club-pass.md §12): once the broadcaster token is connected (public/clubPass.twitchCounting), the Twitch card shows
//   the sub result (tier, gifted, checked time) with Check again (clubLinkTwitch); before that, linked or not and "Twitch subs start
//   counting soon." After a check the ID token is refreshed, so a pass that turned gold (or back) updates without a reload.
//   The gold moment: the first time the tab is open while the pass is gold, the pass pops, confetti falls and the Welcome stamp
//   lands (reduced motion: the stamp only); remembered per viewer in localStorage bt.club.goldSeen.<uid>.
//   Off production, signed out, ?as=member previews Fan Club, ?as=sub Sub Club and ?as=crew (or a crew or admin role) the crew pass.
import { onAuth, refresh, getAuthState, whenReady, type AuthState } from "../../lib/auth";
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
  sources?: { stripe?: StripeSrc; twitch?: unknown; gift?: unknown; grant?: unknown; crew?: unknown; owner?: unknown };
  twitch?: { linked?: boolean; login?: string; own?: boolean; sub?: boolean; tier?: string | number | null; gifted?: boolean; checkedAt?: number };
}
interface StripeSrc { kind: "sub" | "month"; status?: string; renewsAt?: number; endsAt?: number; cancelAt?: number; graceUntil?: number; monthEndsAt?: number }
interface Receipt { at: number; amount: number; currency: string; description: string; receiptUrl: string | null; refunded: boolean }
interface Billing { receipts: Receipt[]; subscription: { status: string; renewsAt: number | null; cancelAt: number | null; amount: number | null; currency: string } | null }
type Bill = "active" | "cancelled" | "failed" | "month" | "twice" | null;
interface TwitchView { linked: boolean; login: string; own: boolean; tier: string; sub: boolean | null; gifted: boolean; checkedAt: number | null }
type BillingState = "off" | "loading" | "error" | "ok";
interface View { uid: string; handle: string; joined: Date | null; gold: boolean; crew: boolean; sources: Source[]; twitch: TwitchView; counting: boolean; preview: boolean; stripe: StripeSrc | null; bill: Bill; billing: Billing | null; billingState: BillingState }

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

  const bills = new Map<string, Billing | null>(), billsLoading = new Set<string>();
  /** clubStatus for this member, fetched once in the background; "loading" until it answers, "error" if it couldn't. */
  function billingFor(uid: string): { billing: Billing | null; state: BillingState } {
    if (!PAY) return { billing: null, state: "off" };
    if (bills.has(uid)) { const b = bills.get(uid)!; return { billing: b, state: b ? "ok" : "error" }; }
    if (!billsLoading.has(uid)) {
      billsLoading.add(uid);
      void import("../../lib/call").then(({ call }) => call<Billing>("clubStatus")).then((b) => b, (err) => { console.error("my pass: clubStatus", err); return null; })
        .then((b) => { bills.set(uid, b); billsLoading.delete(uid); last = ""; void render(getAuthState()); });
    }
    return { billing: null, state: "loading" };
  }
  /** The billing state from the Stripe source: failed (past_due), cancelled, paying twice (with a Twitch sub), active, or a month pass. */
  function billOf(st: StripeSrc | null, sources: Source[]): Bill {
    if (!st || !sources.includes("stripe")) return null;
    if (st.kind === "month") return "month";
    if (st.status === "past_due") return "failed";
    if (st.cancelAt) return "cancelled";
    return sources.includes("twitch") ? "twice" : "active";
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
        stripe: m.club?.sources?.stripe ?? null, bill: billOf(m.club?.sources?.stripe ?? null, sources), ...((b) => ({ billing: b.billing, billingState: b.state }))(billingFor(uid)),
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
    // ?bill=active | cancelled | failed | month | twice previews the billing states (sample dates and receipts).
    const bq = new URLSearchParams(location.search).get("bill") || "";
    const D = 86400000, t0 = Date.now();
    const stripe: StripeSrc | null = ({ active: { kind: "sub", status: "active", renewsAt: t0 + 20 * D }, twice: { kind: "sub", status: "active", renewsAt: t0 + 20 * D },
      cancelled: { kind: "sub", status: "active", cancelAt: t0 + 20 * D }, failed: { kind: "sub", status: "past_due", graceUntil: t0 + 6 * D }, month: { kind: "month", status: "paid", endsAt: t0 + 25 * D } } as Record<string, StripeSrc>)[bq] ?? null;
    if (stripe) { if (kind === "fan") sources.splice(0, 1); sources.push("stripe"); if (bq === "twice" && !sources.includes("twitch")) sources.unshift("twitch"); }
    const billing: Billing | null = stripe ? { receipts: [{ at: t0 - 10 * D, amount: 599, currency: "usd", description: bq === "month" ? "Sub Club, one month" : "Sub Club", receiptUrl: "#", refunded: false }, { at: t0 - 40 * D, amount: 599, currency: "usd", description: "Sub Club", receiptUrl: "#", refunded: false }],
      subscription: stripe.kind === "sub" ? { status: stripe.status || "active", renewsAt: stripe.renewsAt ?? null, cancelAt: stripe.cancelAt ?? null, amount: 599, currency: "usd" } : null } : null;
    return { uid: `preview-${kind}`, handle: `@${previewMember.name.toLowerCase()}`, joined: new Date(), gold: kind !== "fan" || tw === "sub" || !!stripe, crew: kind === "crew", sources, twitch, counting: tw === "sub" || tw === "nosub" || tw === "own", preview: true,
      stripe, bill: billOf(stripe, sources), billing, billingState: PAY ? "ok" : "off" };
  }

  // ---------- the pieces ----------
  const subBtn = (label = "Get Sub Club") => PAY
    ? `<button class="bt-btn bt-btn--primary" type="button" data-mp-buy data-pulse="my-pass-get-sub-club">${esc(label)}</button>`
    : '<button class="bt-btn bt-btn--secondary" type="button" disabled>Sub Club opening soon</button>';
  // Gifts are a later part: "Gifts open soon" even with payments on.
  const giftBtn = () => '<button class="bt-btn bt-btn--secondary" type="button" disabled>Gifts open soon</button>';
  // The perk board on /club-pass (it starts on the viewer's own pass). Fan Club: "See what Sub Club adds", same place.
  const perksBtn = (kind = "primary", fan = false) => `<a class="bt-btn bt-btn--${kind}" href="/club-pass#ch-perks" data-pulse="my-pass-see-perks">${fan ? "See what Sub Club adds" : "See your perks"}</a>`;
  const portalBtn = (label: string, kind = "primary") => `<button class="bt-btn bt-btn--${kind}" type="button" data-mp-portal data-pulse="my-pass-portal">${esc(label)}</button>`;
  const day = (ms?: number | null) => (ms ? new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "");
  const money = (cents: number | null | undefined, cur = "usd") => (cents == null ? PRICE : new Intl.NumberFormat(undefined, { style: "currency", currency: cur.toUpperCase() }).format(cents / 100));
  const head = (t: string) => `<div class="bt-card-head"><h3 class="bt-card-title">${t}</h3></div>`;
  const empty = (title: string, text: string) => `<div class="bt-empty bt-empty--compact"><span class="bt-empty-title">${title}</span><span>${text}</span></div>`;
  const lead = (v: View): Source => (["owner", "crew", "twitch", "stripe", "gift", "grant", "sub"] as Source[]).find((k) => v.sources.includes(k)) || "fan";
  const clock = (ms: number) => {
    const d = new Date(ms), today = new Date().toDateString() === d.toDateString();
    return `${today ? "today" : d.toLocaleDateString(undefined, { month: "short", day: "numeric" })} ${d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`;
  };

  /** The banner over the hero: a failed payment or paying twice. Both gold (warning); red is only for actions that destroy data. */
  function banner(v: View) {
    if (v.bill === "failed") return `<div class="mp-banner" role="status"><span aria-hidden="true">⚠️</span><div><b>Your payment didn't go through</b><small>Your pass stays gold until ${day(v.stripe?.graceUntil)}. Update your card to keep it.</small></div>${portalBtn("Fix my card")}</div>`;
    if (v.bill === "twice") return `<div class="mp-banner" role="status"><span aria-hidden="true">💡</span><div><b>You're paying twice</b><small>Your Twitch sub already gives you Sub Club. Cancel the ${money(v.billing?.subscription?.amount)} here and your pass stays gold through Twitch.</small></div>${portalBtn("Cancel the site subscription", "secondary")}</div>`;
    return "";
  }

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
    let [st2, line2, cta2] = [status, line, cta];
    const S = v.stripe, amt = money(v.billing?.subscription?.amount, v.billing?.subscription?.currency);
    if (v.bill && (k === "stripe" || (k === "twitch" && v.bill === "twice"))) {
      [st2, line2, cta2] = ({
        active: [`Gold, paid here. Renews ${day(S?.renewsAt)}.`, `${amt} a month. Cancel any time and keep gold until ${day(S?.renewsAt)}.`, portalBtn("Manage payment") + perksBtn("secondary")],
        cancelled: [`Gold until ${day(S?.cancelAt)}, then Fan Club.`, `You cancelled. Nothing more will be charged. Changed your mind? Resume any time before ${day(S?.cancelAt)}.`, portalBtn("Resume Sub Club")],
        failed: ["Still gold, but your payment didn't go through.", `Fix your card by ${day(S?.graceUntil)} to stay gold.`, portalBtn("Fix my card")],
        month: ["Gold for one month.", `Your month ends ${day(S?.endsAt)}. Get Sub Club before then to stay gold.`, subBtn("Keep it gold") + perksBtn("secondary")],
        twice: ["Gold, twice over.", "Your Twitch sub already covers Sub Club, and you also pay here.", portalBtn("Cancel the site subscription") + perksBtn("secondary")],
      } as Record<NonNullable<Bill>, [string, string, string]>)[v.bill];
    }
    const plan = v.gold ? "Sub Club" : "Fan Club";
    const facts = [v.joined ? `Member since ${month(v.joined)}` : "", v.handle, `${v.gold ? TOTAL : FAN} of ${TOTAL} perks`].filter(Boolean);
    return banner(v) + `<div class="mp-hero${v.gold ? " is-gold" : ""}" data-mp-hero>
      <div class="mp-hero-scene"><div class="mp-hang"><span class="mp-strap"></span><span class="mp-clip"></span>
        <div class="bt-pass${v.gold ? " bt-pass--sub" : ""}" role="img" aria-label="Your ${plan} pass"><span class="bt-pass-top" aria-hidden="true">CLUB PASS</span>${M}<span class="bt-pass-plan" aria-hidden="true">${plan.toUpperCase()}</span><span class="bt-pass-price" aria-hidden="true">${v.gold ? "ALL ACCESS" : "FREE"}</span>${v.handle ? `<span class="bt-pass-name" aria-hidden="true">${esc(v.handle)}</span>` : ""}<span class="bt-pass-code"></span></div>
      </div></div>
      <div><p class="mp-kick">My pass</p><h2 class="mp-plan">${plan}</h2><p class="mp-status">${esc(st2)}<small>${esc(line2)}</small></p>
        <div class="mp-facts">${facts.map((f) => `<span class="mp-chip">${esc(f)}</span>`).join("")}</div>
        <div class="mp-cta">${cta2}</div></div>
    </div>`;
  }

  function sources(v: View) {
    const SRC: Record<Source, [string, string, string, boolean]> = {
      fan: ["🎟️", "Fan Club pass", "Free, no end date", false],
      sub: ["🎟️", "Sub Club pass", "Gold on your account", true],
      twitch: [TW, "Twitch sub", `${v.twitch.tier ? `Tier ${esc(v.twitch.tier)} · ` : ""}lasts as long as your Twitch sub${v.twitch.checkedAt ? ` · checked ${clock(v.twitch.checkedAt)}` : ""}`, true],
      stripe: ["💳", v.bill === "cancelled" ? "Paid here, cancelled" : v.bill === "month" ? "Paid here, one month" : "Paid here",
        v.bill === "cancelled" ? `Gold until ${day(v.stripe?.cancelAt)} · no more charges` : v.bill === "failed" ? `Payment failed · fix by ${day(v.stripe?.graceUntil)}`
        : v.bill === "month" ? `One month · ends ${day(v.stripe?.endsAt)}` : `${money(v.billing?.subscription?.amount)} a month${v.stripe?.renewsAt ? ` · renews ${day(v.stripe.renewsAt)}` : ""}`, true],
      gift: ["🎁", "Gift", "One month, never renews", true],
      grant: ["🎟️", "From Boomertanger", "Turned gold by the channel", true],
      owner: ["🎬", "Owner", "It's your channel, so it's always gold", true],
      crew: ["🛡️", "Crew pass", "Free while you're on the crew", true],
    };
    return `<div class="bt-card">${head(`Where your ${v.gold ? "gold" : "pass"} comes from`)}${v.sources.map((k) => {
      const [ic, t, d, g] = SRC[k];
      const pill = k !== "stripe" ? '<span class="bt-pill-ok">Active</span>' : v.bill === "failed" ? '<span class="bt-pill-warn">Needs a new card</span>'
        : v.bill === "cancelled" ? `<span class="bt-pill-warn">Ends ${day(v.stripe?.cancelAt)}</span>` : v.bill === "month" ? `<span class="bt-pill-warn">Ends ${day(v.stripe?.endsAt)}</span>` : '<span class="bt-pill-ok">Active</span>';
      return `<div class="mp-src"><span class="mp-src-ic${g ? " is-gold" : ""}${k === "twitch" ? " is-twitch" : ""}" aria-hidden="true">${ic}</span><div><b>${t}</b><small>${d}</small></div>${pill}</div>`;
    }).join("")}${v.sources.length > 1 ? '<p class="bt-fine bt-fine--left mp-note">Any one of these keeps you gold.</p>' : ""}</div>`;
  }

  function payments(v: View) {
    const k = lead(v);
    const B = v.billing, S = v.stripe;
    // Anyone with a Stripe customer sees their receipts whatever their plan, so never say "No payments yet" before clubStatus has
    // answered (a cold start takes a few seconds), and never when it couldn't.
    if (v.billingState === "loading") return `<div class="bt-card">${head("Payments")}<p class="bt-fine bt-fine--left mp-note">Loading your receipts…</p></div>`;
    const failed = v.billingState === "error";
    if (B && (B.receipts.length || B.subscription) || S || failed) {
      const amt = money(B?.subscription?.amount, B?.subscription?.currency);
      const next = v.bill === "active" || v.bill === "twice" ? `<div class="mp-next"><b>${amt}</b><span>next charge ${day(B?.subscription?.renewsAt ?? S?.renewsAt)}</span></div><div class="mp-row-actions">${portalBtn("Manage payment", "secondary")}</div>`
        : v.bill === "cancelled" ? `<div class="mp-next"><b>No more charges</b><span>you cancelled · gold until ${day(S?.cancelAt)}</span></div><div class="mp-row-actions">${portalBtn("Resume Sub Club", "secondary")}</div>`
        : v.bill === "failed" ? `<div class="mp-next"><b>${amt}</b><span>didn't go through · fix by ${day(S?.graceUntil)}</span></div><div class="mp-row-actions">${portalBtn("Fix my card")}</div>`
        : v.bill === "month" ? `<div class="mp-next"><b>One month</b><span>gold until ${day(S?.endsAt)} · doesn't renew</span></div>` : "";
      const rows = failed || !B ? '<p class="bt-fine bt-fine--left mp-note">Couldn't load your receipts right now. Refresh to try again.</p>' : B.receipts.length
        ? `<span class="bt-label mp-receipts-label">Receipts</span><div class="mp-receipts">${B.receipts.map((r) => `<div class="mp-receipt"><span>${day(r.at)}</span><span>${esc(r.description)}${r.refunded ? " · refunded" : ""}</span><b>${money(r.amount, r.currency)}</b>${r.receiptUrl ? `<a href="${esc(r.receiptUrl)}" target="_blank" rel="noopener">Receipt ↗</a>` : "<span></span>"}</div>`).join("")}</div>` : "";
      return `<div class="bt-card">${head("Payments")}${next}${rows}<p class="bt-fine bt-fine--left mp-note">Manage payment opens Stripe's secure page. Your card never touches this site.</p></div>`;
    }
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
    body.querySelectorAll<HTMLButtonElement>("[data-mp-portal]").forEach((b) => b.addEventListener("click", async () => {
      if (view?.preview) { b.textContent = "Preview: no portal"; return; }
      const was = b.textContent; b.disabled = true; b.textContent = "Opening Stripe…";
      try { const { openPortal } = await import("../../lib/checkout"); await openPortal(); }
      catch (err) { b.disabled = false; b.textContent = was; const ok = document.querySelector<HTMLElement>("[data-page-err]"); if (ok) { ok.textContent = messageFor(err, "Couldn't open Stripe. Try again in a minute."); ok.hidden = false; } }
    }));
    body.querySelectorAll<HTMLButtonElement>("[data-mp-buy]").forEach((b) => b.addEventListener("click", () => {
      if (view?.preview) { b.textContent = "Preview: no checkout"; return; }
      void import("../../lib/checkout").then((m) => m.startCheckout("sub"));
    }));
    goldMoment();
  }
  onAuth((s) => { void render(s); });

  // ---------- back from Stripe Checkout (/account/club?checkout=success) ----------
  // The webhook turns the pass gold a few seconds after payment: wait for members/{uid}.club.plan to say so (up to ~40 s), then refresh
  // the ID token (the "sub" role) and redraw, so the gold moment plays here.
  if (new URLSearchParams(location.search).get("checkout") === "success") {
    history.replaceState(null, "", location.pathname + location.hash);
    void (async () => {
      const s = await whenReady();
      if (!s.user) return;
      const okEl = document.querySelector<HTMLElement>("[data-page-ok]");
      const say = (t: string) => { if (okEl) { okEl.textContent = t; okEl.hidden = false; } };
      say("Payment received. Turning your pass gold…");
      const { db, doc, getDoc } = await import("../../lib/db");
      let gold = false;
      for (let i = 0; i < 20 && !gold; i++) {
        try { gold = (await getDoc(doc(db, "sites", SITE_ID, "members", s.user.uid))).get("club.plan") === "sub"; } catch { /* try again */ }
        if (!gold) await new Promise((r) => setTimeout(r, 2000));
      }
      members.delete(s.user.uid); bills.delete(s.user.uid); last = "";
      await refresh({ forceToken: true }).catch(() => {});
      await render(getAuthState());
      say(gold ? "You're in Sub Club. Welcome!" : "Your payment went through. Your pass turns gold in a minute or two: reload this page then.");
    })();
  }
}
