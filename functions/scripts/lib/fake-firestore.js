// functions/scripts/lib/fake-firestore.js: the checks' tiny in-memory Firestore and Auth (check-club.js, check-billing.js).
// doc get / set (merge) / update (dotted paths, FieldValue.delete()) / delete / create, collection add / where (==, >=, <, in) / get,
// runTransaction. ALL_DBS holds every fake made, so a check can scan everything that was written.
const admin = require("firebase-admin");

const FV = admin.firestore.FieldValue;
function fakeAuth() {
  const users = new Map();
  return { users, async getUser(uid) { if (!users.has(uid)) throw Object.assign(new Error("no"), { code: "auth/user-not-found" }); return { customClaims: users.get(uid) }; }, async setCustomUserClaims(uid, c) { users.set(uid, JSON.parse(JSON.stringify(c))); } };
}

// ---------- a tiny in-memory Firestore (doc get / set (merge) / update / delete, runTransaction) ----------
const ALL_DBS = [];   // every fake Firestore the checks used: none may ever get an activityLog write (Club Pass logs to adminLog only)
function fakeDb() {
  const docs = new Map();
  ALL_DBS.push(docs);
  const snap = (path) => { const d = docs.get(path); return { exists: d !== undefined, id: path.split("/").pop(), ref: doc(path), data: () => (d ? JSON.parse(JSON.stringify(d)) : undefined), get: (k) => k.split(".").reduce((o, p) => (o == null ? undefined : o[p]), d) }; };
  const merge = (a, b) => { const out = { ...(a || {}) }; for (const [k, v] of Object.entries(b)) out[k] = v && typeof v === "object" && !Array.isArray(v) && out[k] && typeof out[k] === "object" && !Array.isArray(out[k]) ? merge(out[k], v) : v; return out; };
  function doc(path) {
    return {
      path, id: path.split("/").pop(),
      async get() { return snap(path); },
      async set(v, o = {}) { docs.set(path, o.merge ? merge(docs.get(path), v) : JSON.parse(JSON.stringify(v))); },
      async update(v) {
        if (!docs.has(path)) throw new Error(`no doc ${path}`);
        const d = JSON.parse(JSON.stringify(docs.get(path)));
        for (const [k, val] of Object.entries(v)) {              // dotted field paths; FieldValue.delete() removes
          const parts = k.split("."), last = parts.pop();
          let o = d; for (const p of parts) { if (!o[p] || typeof o[p] !== "object") o[p] = {}; o = o[p]; }
          if (val && typeof val.isEqual === "function" && val.isEqual(FV.delete())) delete o[last];
          else if (val && typeof val.isEqual === "function") o[last] = "(server time)";
          else o[last] = JSON.parse(JSON.stringify(val));
        }
        docs.set(path, d);
      },
      async delete() { docs.delete(path); },
      async create(v) { if (docs.has(path)) throw Object.assign(new Error("already exists"), { code: 6 }); docs.set(path, JSON.parse(JSON.stringify(v))); },
    };
  }
  return {
    docs, doc,
    collection(name) {
      const filters = [];
      const q = {
        async add(v) { const p = `${name}/${docs.size + 1}`; docs.set(p, v); return doc(p); },
        where(f, op, val) { filters.push([f, op, val]); return q; },
        async get() {
          const rows = [...docs.keys()].filter((p) => p.startsWith(`${name}/`) && p.split("/").length === name.split("/").length + 1).map(snap)
            .filter((s) => filters.every(([f, op, val]) => { const x = typeof f === "string" ? s.get(f) : s.id; return op === ">=" ? x >= val : op === "<" ? x < val : op === "==" ? x === val : op === "in" ? val.includes(x) : true; }));
          return { docs: rows, size: rows.length };
        },
      };
      return q;
    },
    async runTransaction(fn) { return fn({ get: (r) => r.get(), set: (r, v, o) => r.set(v, o), update: (r, v) => r.update(v), delete: (r) => r.delete() }); },
  };
}

// ---------- a fake Twitch ----------

module.exports = { fakeDb, fakeAuth, ALL_DBS, FV };
