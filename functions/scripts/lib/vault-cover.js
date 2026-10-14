// functions/scripts/lib/vault-cover.js: the scripts' shared way to give a Game Vault game a cover through the approved
// cover-override path (docs/specs/game-vault.md §6): the image is uploaded to Cloudinary under game-vault/covers (never
// hotlinked), framed to 3:4 on the way in, then lib/vault/edit.js applyEdit's cover "replace" checks it, records it with
// recordAssetCreated(), swaps the cover in one transaction, writes adminLog and rebuilds public/vault.
// Used by vault-link-covers.js and import-vault.js (by-hand rows).

const admin = require("firebase-admin");

/** 3:4 at 600x800, the middle of the image (the card's frame); smaller images are scaled up. */
const CENTER_3x4 = "c_fill,g_center,w_600,h_800";

/** CLOUDINARY_* from the shell, or (secretManager) the project's Secret Manager. The values are never printed. */
async function cloudinaryCreds(projectId, { secretManager = false } = {}) {
  const names = ["CLOUDINARY_CLOUD_NAME", "CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET"];
  let vals = names.map((n) => process.env[n] || "");
  if (secretManager) {
    const { access_token: token } = await admin.credential.applicationDefault().getAccessToken();
    vals = await Promise.all(names.map(async (n) => {
      const res = await fetch(`https://secretmanager.googleapis.com/v1/projects/${projectId}/secrets/${n}/versions/latest:access`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error(`Couldn't read ${n} from Secret Manager on ${projectId} (${res.status}).`);
      return Buffer.from((await res.json()).payload.data, "base64").toString("utf8").trim();
    }));
  }
  const missing = names.filter((_, i) => !vals[i]);
  if (missing.length) throw new Error(`Missing ${missing.join(", ")}. Set them in your shell, or pass --from-secret-manager.`);
  return { cloudName: vals[0], apiKey: vals[1], apiSecret: vals[2] };
}

/** The og:image of a page (either attribute order), as an absolute URL, or null. */
function ogImageFromHtml(html, pageUrl) {
  const tags = String(html || "").match(/<meta\b[^>]*>/gi) || [];
  for (const t of tags) {
    if (!/\b(property|name)\s*=\s*["']og:image(:url|:secure_url)?["']/i.test(t)) continue;
    const m = t.match(/\bcontent\s*=\s*["']([^"']+)["']/i);
    if (m) { try { return new URL(m[1].replace(/&amp;/g, "&"), pageUrl).href; } catch { /* not a URL */ } }
  }
  return null;
}

/**
 * The cover image a store page offers: its og:image. Game Jolt builds its pages in the browser, so its HTML has none;
 * there the page's own data (site-api) gives the game's thumbnail, the image its og:image is made from.
 * -> { url, from } | { url: null, why }
 */
async function pageCoverImage(link) {
  let u;
  try { u = new URL(link); } catch { return { url: null, why: "not a link" }; }
  const gj = /(^|\.)gamejolt\.com$/i.test(u.hostname) && u.pathname.match(/\/games\/[^/]+\/(\d+)/);
  if (gj) {
    try {
      const r = await fetch(`https://gamejolt.com/site-api/web/discover/games/${gj[1]}`, { headers: { "User-Agent": "Mozilla/5.0" } });
      const g = (await r.json())?.payload?.game;
      const url = g?.thumbnail_media_item?.img_url || g?.header_media_item?.img_url || null;
      return url ? { url, from: "Game Jolt thumbnail" } : { url: null, why: "Game Jolt has no thumbnail" };
    } catch (err) { return { url: null, why: `Game Jolt: ${err.message}` }; }
  }
  try {
    const r = await fetch(link, { headers: { "User-Agent": "Mozilla/5.0" }, redirect: "follow" });
    if (!r.ok) return { url: null, why: `page HTTP ${r.status}` };
    const url = ogImageFromHtml(await r.text(), r.url || link);
    return url ? { url, from: "og:image" } : { url: null, why: "no og:image on the page" };
  } catch (err) { return { url: null, why: err.message }; }
}

/** Uploads an image (by URL; Cloudinary fetches it) to publicId, framed by transformation; never overwrites. */
async function uploadCover(creds, { imageUrl, publicId, transformation = CENTER_3x4 }) {
  const { signParams } = require("../../lib/cloudinary");
  const params = { timestamp: Math.floor(Date.now() / 1000), public_id: publicId, overwrite: "false", transformation };
  const form = new FormData();
  for (const [k, v] of Object.entries({ ...params, file: imageUrl, api_key: creds.apiKey, signature: signParams(params, creds.apiSecret) })) form.append(k, String(v));
  const res = await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(creds.cloudName)}/image/upload`, { method: "POST", body: form });
  const info = await res.json().catch(() => ({}));
  if (!res.ok || !info.public_id) throw new Error(`upload failed (${res.status}): ${info.error?.message || "no details"}`);
  return info;
}

/** An applyEdit-capable editor for scripts (recordAssetCreated is real; deleting assets is left to Cloud Stash). */
function scriptEditor(store, creds) {
  const { recordAssetCreated } = require("../../lib/externalAssets");
  return require("../../lib/vault/edit")({ store, deps: {
    cloudCreds: () => creds, recordAssetCreated,
    performAssetDeletion: async () => { throw new Error("scripts can't delete assets; remove it from Cloud Stash"); },
  } });
}

/** Upload + the cover-override edit for one game (g: the game doc's data with its slug). -> the upload info. */
async function setCoverFromUrl({ store, creds, editor, g, imageUrl, publicId, transformation = CENTER_3x4, actor, reason }) {
  const E = require("../../lib/vault/edit");
  const info = await uploadCover(creds, { imageUrl, publicId, transformation });
  await (editor || scriptEditor(store, creds)).applyEdit({ uid: null, name: actor }, { id: g.slug, changes: { cover: { action: "replace", publicId: info.public_id } }, before: { cover: E.currentValue("cover", g) }, reason });
  return info;
}

module.exports = { CENTER_3x4, cloudinaryCreds, ogImageFromHtml, pageCoverImage, uploadCover, scriptEditor, setCoverFromUrl };
