// A tiny in-memory stand-in for the Admin SDK's Firestore, for engine checks that can't use the
// emulator (scripts/check-factory-engine.js). Supports what lib/factory uses: doc / collection
// paths, get, create (fails if it exists), set (with merge), update (dotted keys), delete,
// where "==" / "<" / ">" / "in", orderBy, limit, count(), getAll, runTransaction (run straight
// through), and the FieldValue sentinels increment, serverTimestamp, delete and arrayUnion.
const admin = require("firebase-admin");

const clone = (v) => (v && typeof v === "object" && !isSentinel(v) && !(v instanceof admin.firestore.Timestamp) ? (Array.isArray(v) ? v.map(clone) : Object.fromEntries(Object.entries(v).map(([k, x]) => [k, clone(x)]))) : v);
function isSentinel(v) { return v && typeof v === "object" && v.constructor && /Transform|FieldValue|Sentinel/.test(v.constructor.name); }
function sentinelKind(v) {
  const n = v.constructor.name;
  if (/Increment/.test(n)) return "increment";
  if (/ServerTimestamp/.test(n)) return "serverTimestamp";
  if (/Delete/.test(n)) return "delete";
  if (/ArrayUnion/.test(n)) return "arrayUnion";
  return n;
}
const operand = (v) => v.operand ?? v._operand ?? v.incrementBy ?? Object.values(v).find((x) => typeof x === "number");

function applyValue(cur, v) {
  if (!isSentinel(v)) return clone(v);
  const k = sentinelKind(v);
  if (k === "increment") return (typeof cur === "number" ? cur : 0) + operand(v);
  if (k === "serverTimestamp") return admin.firestore.Timestamp.now();
  if (k === "delete") return undefined;
  if (k === "arrayUnion") return [...new Set([...(Array.isArray(cur) ? cur : []), ...v.elements])];
  throw new Error(`fake-firestore: unsupported sentinel ${k}`);
}
function merge(target, patch) {
  for (const [k, v] of Object.entries(patch)) {
    if (v && typeof v === "object" && !Array.isArray(v) && !isSentinel(v) && !(v instanceof admin.firestore.Timestamp)) {
      target[k] = merge(target[k] && typeof target[k] === "object" ? target[k] : {}, v);
    } else {
      const nv = applyValue(target[k], v);
      if (nv === undefined) delete target[k]; else target[k] = nv;
    }
  }
  return target;
}
const getPath = (o, p) => p.split(".").reduce((x, k) => (x == null ? undefined : x[k]), o);
const cmp = (a, b) => {
  const va = a instanceof admin.firestore.Timestamp ? a.toMillis() : a, vb = b instanceof admin.firestore.Timestamp ? b.toMillis() : b;
  return va < vb ? -1 : va > vb ? 1 : 0;
};

function makeDb() {
  const store = new Map();   // path -> data
  class Snap {
    constructor(ref, data) { this.ref = ref; this.id = ref.id; this._d = data; this.exists = data !== undefined; }
    data() { return this.exists ? clone(this._d) : undefined; }
    get(f) { return this.exists ? getPath(this._d, f) : undefined; }
  }
  class DocRef {
    constructor(path) { this.path = path; this.id = path.split("/").pop(); }
    collection(id) { return new Query(`${this.path}/${id}`); }
    async get() { return new Snap(this, store.get(this.path)); }
    async create(d) { if (store.has(this.path)) { const e = new Error("6 ALREADY_EXISTS: already exists"); e.code = 6; throw e; } store.set(this.path, merge({}, d)); }
    async set(d, opt = {}) { store.set(this.path, merge(opt.merge && store.has(this.path) ? store.get(this.path) : {}, d)); }
    async update(d) {
      if (!store.has(this.path)) { const e = new Error("5 NOT_FOUND"); e.code = 5; throw e; }
      const cur = store.get(this.path);
      for (const [k, v] of Object.entries(d)) {
        const parts = k.split("."), last = parts.pop();
        let t = cur; for (const p of parts) t = t[p] = t[p] && typeof t[p] === "object" ? t[p] : {};
        const nv = applyValue(t[last], v);
        if (nv === undefined) delete t[last]; else t[last] = nv;
      }
    }
    async delete() { store.delete(this.path); }
  }
  class Query {
    constructor(path, filters = [], order = null, lim = null) { this.path = path; this.filters = filters; this.order = order; this.lim = lim; }
    doc(id) { return new DocRef(`${this.path}/${id ?? Math.random().toString(36).slice(2, 12)}`); }
    where(f, op, v) { return new Query(this.path, [...this.filters, [f, op, v]], this.order, this.lim); }
    orderBy(f, dir = "asc") { return new Query(this.path, this.filters, [f, dir], this.lim); }
    limit(n) { return new Query(this.path, this.filters, this.order, n); }
    select() { return this; }
    async add(d) { const r = this.doc(); await r.set(d); return r; }
    _docs() {
      const depth = this.path.split("/").length + 1;
      let out = [...store.entries()].filter(([p]) => p.startsWith(`${this.path}/`) && p.split("/").length === depth).map(([p, d]) => new Snap(new DocRef(p), d));
      for (const [f, op, v] of this.filters) {
        out = out.filter((s) => {
          const x = s.get(f);
          if (op === "==") return cmp(x, v) === 0 && x !== undefined;
          if (op === "<") return x != null && cmp(x, v) < 0;
          if (op === "<=") return x != null && cmp(x, v) <= 0;
          if (op === ">") return x != null && cmp(x, v) > 0;
          if (op === ">=") return x != null && cmp(x, v) >= 0;
          if (op === "in") return x !== undefined && v.some((y) => cmp(x, y) === 0);
          throw new Error(`fake-firestore: op ${op}`);
        });
      }
      if (this.order) { const [f, dir] = this.order; out.sort((a, b) => (dir === "desc" ? -1 : 1) * cmp(a.get(f) ?? -Infinity, b.get(f) ?? -Infinity)); }
      if (this.lim != null) out = out.slice(0, this.lim);
      return out;
    }
    async get() { const docs = this._docs(); return { docs, empty: !docs.length, size: docs.length, forEach: (fn) => docs.forEach(fn) }; }
    count() { return { get: async () => ({ data: () => ({ count: this._docs().length }) }) }; }
  }
  const db = {
    doc: (p) => new DocRef(p),
    collection: (p) => new Query(p),
    getAll: async (...refs) => Promise.all(refs.map((r) => r.get())),
    batch() { const ops = []; return { set: (r, d, o) => ops.push(() => r.set(d, o)), update: (r, d) => ops.push(() => r.update(d)), delete: (r) => ops.push(() => r.delete()), commit: async () => { for (const op of ops) await op(); } }; },
    runTransaction: async (fn) => fn({ get: (r) => r.get(), set: (r, d, o) => r.set(d, o), update: (r, d) => r.update(d), create: (r, d) => r.create(d), delete: (r) => r.delete(), getAll: (...rs) => Promise.all(rs.map((r) => r.get())) }),
    _store: store,
  };
  return db;
}

module.exports = { makeDb };
