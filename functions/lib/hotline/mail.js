// Hotline Boom email (docs/specs/hotline-boom.md §6): replies and the owner's copies through the Resend REST API, with the key Boom Alerts will
// use (Secret Manager RESEND_API_KEY). Email is ON only when functions/.env says HOTLINE_EMAIL=on (then index.js binds the secret) AND the key
// is there; otherwise every send answers { sent: false, reason: "email-off" } and the inbox offers "Open in my email" instead. Never logs the key
// or the message.
//
//   emailOn(key)                                   true when sending is configured
//   sendMail({ key, to, replyTo, subject, text, fetchFn })   -> { sent: true, id } | { sent: false, reason: "email-off" | "bad-address" | "provider" }
//   replyFrom(from) -> "fanmail@boomertanger.com" · signature · mailtoUrl({ to, subject, text })
const DOMAIN = "boomertanger.com";
const SENDER = `"Boomertanger" <hotline@mail.${DOMAIN}>`;
const SIGNATURE = "the Boomertanger crew";
const RESEND = "https://api.resend.com/emails";

const emailOn = (key) => process.env.HOTLINE_EMAIL === "on" && typeof key === "string" && key.length > 10;
const replyFrom = (from) => `${from}@${DOMAIN}`;
const signed = (text) => `${String(text).trim()}\n\n${SIGNATURE}`;

async function sendMail({ key, to, replyTo, subject, text, fetchFn = (...a) => fetch(...a) }) {
  if (!emailOn(key)) return { sent: false, reason: "email-off" };
  if (typeof to !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return { sent: false, reason: "bad-address" };
  try {
    const res = await fetchFn(RESEND, {
      method: "POST", headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({ from: SENDER, to: [to], reply_to: replyTo, subject, text }),
    });
    if (!res.ok) {
      // a domain that isn't verified yet is "email off" for us: the composer falls back to the person's own email app
      const body = await res.json().catch(() => ({}));
      const msg = String((body && (body.message || body.name)) || "");
      console.error("hotline: send failed", res.status, msg.slice(0, 120));
      return { sent: false, reason: /domain|verif/i.test(msg) ? "email-off" : "provider" };
    }
    const data = await res.json().catch(() => ({}));
    return { sent: true, id: data.id || null };
  } catch (err) {
    console.error("hotline: send error", String((err && err.message) || err).slice(0, 120));
    return { sent: false, reason: "provider" };
  }
}

/** The "Open in my email" link for the email-off composer. */
const mailtoUrl = ({ to, subject, text }) => `mailto:${encodeURIComponent(to || "")}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`;

module.exports = { DOMAIN, SENDER, SIGNATURE, emailOn, replyFrom, signed, sendMail, mailtoUrl };
