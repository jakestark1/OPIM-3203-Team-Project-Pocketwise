/* =====================================================================
   STORAGE: everything is saved in this browser's localStorage only.
   Nothing is ever sent anywhere.
   ===================================================================== */
window.PW = window.PW || {};

PW.store = (function () {
  // Read the key each time so the test page can use its own key and never touch your real data.
  const KEY = () => PW.CONFIG.storageKey;

  /* A brand-new, empty Pocketwise. */
  function blank() {
    return {
      version: 1,
      transactions: [],     // { id, date, description, amount, source, key, categoryOverride? }
      imports: [],          // short history of files read
      isSample: false,      // true while the made-up sample statement is loaded
      income: { status: null, sources: [], variable: false, lowMonth: null, planWith: "entered", isSample: false },
      userRules: {},        // merchant key -> category (from "Apply to all" corrections)
      budgets: {},          // category -> monthly budget in dollars
      budgetsSet: false,    // false until suggested budgets were created once
      goals: [],            // { name, amount, targetDate }
      currentSavings: null,
      habitAnswers: {},     // merchant key -> "habit" | "subscription"
      selectedMonth: null,
      nextId: 1
    };
  }

  /* Fill in anything missing (for data saved by an older version). */
  function normalize(s) {
    const b = blank();
    const out = Object.assign(b, s || {});
    out.income = Object.assign(blank().income, (s && s.income) || {});
    ["userRules", "budgets", "habitAnswers"].forEach(k => { if (!out[k] || typeof out[k] !== "object") out[k] = {}; });
    ["transactions", "imports", "goals"].forEach(k => { if (!Array.isArray(out[k])) out[k] = []; });
    out.transactions.forEach(t => { if (!t.key) t.key = PW.cat.merchantKey(t.description); });
    return out;
  }

  function load() {
    try {
      const raw = window.localStorage.getItem(KEY());
      return raw ? normalize(JSON.parse(raw)) : blank();
    } catch (e) {
      return blank(); // storage blocked or data unreadable: start fresh instead of crashing
    }
  }
  function save(state) {
    try { window.localStorage.setItem(KEY(), JSON.stringify(state)); return true; }
    catch (e) { return false; }
  }
  function clearAll() {
    try { window.localStorage.removeItem(KEY()); } catch (e) { /* nothing to clear */ }
    return blank();
  }

  /* Export = the saved data as a JSON text file. */
  function exportJson(state) {
    return JSON.stringify({ app: "Pocketwise", exportedAt: new Date().toISOString(), data: state }, null, 2);
  }
  /* Import = read an exported file. Returns { state } or { error }. */
  function importJson(text) {
    let obj;
    try { obj = JSON.parse(text); } catch (e) { return { error: "This file is not a Pocketwise export (it is not valid JSON)." }; }
    const data = obj && obj.app === "Pocketwise" ? obj.data : null;
    if (!data || !Array.isArray(data.transactions)) return { error: "This file is not a Pocketwise export." };
    const bad = data.transactions.find(t => !t || !PW.util.parseDate(t.date) || typeof t.amount !== "number");
    if (bad) return { error: "This export file is damaged: a transaction has a bad date or amount." };
    return { state: normalize(data) };
  }

  return { blank, normalize, load, save, clearAll, exportJson, importJson, key: KEY };
})();
