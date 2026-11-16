/* =====================================================================
   CATEGORIZATION: plain keyword rules, no AI and no internet.
   1. Clean the bank description into a "merchant key"
      ("SQ *JAVA HOUSE 4471" -> "java house").
   2. If the user corrected this merchant before, use their category.
   3. Otherwise find keywords from PW.CONFIG.categories in the key.
      The longest matching keyword wins.
   ===================================================================== */
window.PW = window.PW || {};

PW.cat = (function () {
  const C = PW.CONFIG;

  /* Lower case, turn punctuation into spaces, drop words that contain digits
     (store numbers, order codes like "2K3LM9"), squeeze spaces. Keeps "&". */
  function cleanText(s) {
    return String(s || "").toLowerCase()
      .replace(/\.com\b/g, " ")
      .replace(/'/g, "")                       // joe's -> joes
      .replace(/[^a-z0-9&\s]/g, " ")
      .split(/\s+/).filter(w => w && !/\d/.test(w)).join(" ")
      .trim();
  }

  /* Remove bank prefixes such as "SQ *", "TST*", "POS ", "DEBIT CARD PURCHASE", "ACH". */
  function stripPrefixes(lower) {
    let s = lower.trim(), changed = true;
    while (changed) {
      changed = false;
      for (const p of C.descriptionPrefixes) {
        if (s.startsWith(p) && (p.endsWith("*") || s.length === p.length || /[\s*]/.test(s[p.length]))) {
          s = s.slice(p.length).replace(/^[\s*]+/, "");
          changed = true;
        }
      }
    }
    return s;
  }

  /* The merchant key: the same merchant always gets the same key. */
  function merchantKey(description) {
    return cleanText(stripPrefixes(String(description || "").toLowerCase())) || cleanText(description);
  }

  /* A friendlier name for tables: "hulu hulu bill" -> "Hulu", "uber eats help uber" -> "Uber Eats".
     Drops bank filler words and repeated words. The merchant key itself is not changed. */
  const FILLER = new Set(["bill", "pay", "payment", "pmt", "web", "ppd", "help", "usa", "us", "inc", "llc", "co",
    "des", "id", "conf", "com", "www", "online", "purchase", "debit", "credit", "card"]);
  function merchantName(key) {
    const seen = new Set();
    const words = String(key || "").split(" ").filter(w => {
      if (!w || FILLER.has(w) || seen.has(w)) return false;
      seen.add(w); return true;
    });
    return PW.util.titleCase((words.length ? words.join(" ") : key) || "(no name)");
  }

  // Build the keyword list once: [{ kw: "uber eats", cat: "Dining & coffee" }, ...], longest first.
  let KEYWORDS = null;
  function keywordList() {
    if (KEYWORDS) return KEYWORDS;
    KEYWORDS = [];
    C.categories.forEach((c, order) => c.keywords.forEach(k => {
      const kw = cleanText(k);
      if (kw) KEYWORDS.push({ kw, cat: c.name, order });
    }));
    KEYWORDS.sort((a, b) => b.kw.length - a.kw.length || a.order - b.order);
    return KEYWORDS;
  }

  /* A keyword matches when it starts at the beginning of a word in the key. */
  function matches(key, kw) {
    const at = (" " + key).indexOf(" " + kw);
    return at !== -1;
  }

  /* Built-in rule only (no user corrections). Returns a category name. */
  function builtInCategory(key) {
    for (const { kw, cat } of keywordList()) if (matches(key, kw)) return cat;
    return "Uncategorized";
  }

  /* The category Pocketwise shows for a transaction. Order of priority:
     1) a one-off correction on this transaction, 2) the user's rule for this merchant,
     3) the built-in keyword rules. */
  function categoryOf(tx, userRules) {
    if (tx.categoryOverride) return tx.categoryOverride;
    const key = tx.key || merchantKey(tx.description);
    if (userRules && userRules[key]) return userRules[key];
    return builtInCategory(key);
  }

  function isSpendingCategory(cat) { return !C.notSpending.includes(cat); }

  /* Need / Want / null (Income, Transfers, Uncategorized) */
  function needOrWant(cat) {
    const n = C.needOf[cat];
    return n === true ? "Need" : n === false ? "Want" : null;
  }

  return { cleanText, stripPrefixes, merchantKey, merchantName, builtInCategory, categoryOf,
    isSpendingCategory, needOrWant, _resetCache: () => { KEYWORDS = null; } };
})();
