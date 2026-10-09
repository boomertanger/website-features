// Small remembered choices for a board page, all in localStorage and all wrapped in try/catch (private browsing, blocked storage: the page just
// forgets). "Seen once" lists a moment already shown (Feature Lab's "Your idea shipped", Bug Zapper's "Your bug was confirmed"); the view pref is the
// List / Board (Roadmap) switch.

/** A capped list of ids remembered under a key: has(id), add(id). */
export function seenOnce(key: string, max = 100) {
  const read = (): string[] => { try { const v = JSON.parse(localStorage.getItem(key) || "[]"); return Array.isArray(v) ? v : []; } catch { return []; } };
  return {
    has: (id: string) => read().includes(id),
    add: (id: string) => { try { localStorage.setItem(key, JSON.stringify([...read().filter((x) => x !== id), id].slice(-max))); } catch { /* it just shows again next time */ } },
  };
}

/** The remembered view of a two-view switch: get() returns `alt` when that is what was saved, else `dflt`. */
export function viewPref(key: string, dflt: string, alt: string) {
  return {
    get: (): string => { try { return localStorage.getItem(key) === alt ? alt : dflt; } catch { return dflt; } },
    set: (v: string) => { try { localStorage.setItem(key, v); } catch { /* not remembered */ } },
  };
}
