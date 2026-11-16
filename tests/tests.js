/* =====================================================================
   POCKETWISE AUTOMATED CHECKS.
   Each check compares what the code produces with an expected value
   worked out by hand. Results are shown on run-tests.html and stored in
   window.PW_TEST_RESULTS so the browser test script can save them.
   ===================================================================== */
(function () {
  const U = PW.util, F = window.PW_FIXTURES;
  const results = [];
  const close = (a, b, tol) => Math.abs(a - b) <= (tol == null ? 0.005 : tol);
  const fmt = v => typeof v === "string" ? v : JSON.stringify(v);

  /* Record one check. */
  function check(area, name, expected, actual, pass) {
    results.push({ area, name, expected: fmt(expected), actual: fmt(actual), pass: !!pass });
  }
  function safely(area, name, fn) {
    try { fn(); } catch (e) { check(area, name, "no error", "ERROR: " + e.message, false); }
  }

  const read = (name, file) => PW.importer.readStatement(F.text[name], file || name);
  const withKeys = txs => txs.map((t, i) => Object.assign({}, t, { id: "x" + i, key: PW.cat.merchantKey(t.description) }));
  const binary = name => { const b = atob(F.binary[name]); return Array.from(b, c => String.fromCharCode(c.charCodeAt(0))).join(""); };
  const sampleTxs = () => withKeys(read("sample-statement.csv").transactions);
  const makeState = (txs, extra) => Object.assign(PW.store.blank(), { transactions: txs }, extra || {});

  /* ---------------- Import ---------------- */
  safely("Import", "Simple layout", () => {
    const r = read("simple.csv"), t = r.transactions;
    check("Import", "Simple layout detected", "Simple", r.layout, r.layout === "Simple");
    check("Import", "Simple: positive-means-spending file is flipped (rent -1200, paycheck +2000)", "[-1200, 2000]",
      [t[0].amount, t[2].amount], t[0].amount === -1200 && t[2].amount === 2000);
    check("Import", "Quoted field with a comma is kept whole", "NETFLIX, INC", t[1].description, t[1].description === "NETFLIX, INC");
    check("Import", "\"$1,234.56\" is read as 1234.56 (spending)", -1234.56, t[3].amount, t[3].amount === -1234.56);
    check("Import", "Simple: total of all rows (-1200 - 15.49 + 2000 - 1234.56)", -450.05, U.sum(t.map(x => x.amount)), close(U.sum(t.map(x => x.amount)), -450.05));
  });
  safely("Import", "Chase layout", () => {
    const r = read("chase.csv"), t = r.transactions;
    check("Import", "Chase-style layout detected", "Chase-style", r.layout, r.layout === "Chase-style");
    check("Import", "MM/DD/YYYY date 08/03/2026 becomes 2026-08-03", "2026-08-03", t[0].date, t[0].date === "2026-08-03");
    check("Import", "Chase: signs kept (purchase -10.99, paycheck +1450, return +23.99)", "[-10.99,1450,23.99]",
      [t[0].amount, t[2].amount, t[3].amount], t[0].amount === -10.99 && t[2].amount === 1450 && t[3].amount === 23.99);
    check("Import", "Chase: total", 1450.6, U.sum(t.map(x => x.amount)), close(U.sum(t.map(x => x.amount)), 1450.6));
  });
  safely("Import", "Bank of America layout", () => {
    const r = read("boa.csv"), t = r.transactions;
    check("Import", "Bank of America-style detected below the summary block", "Bank of America-style", r.layout, r.layout === "Bank of America-style");
    check("Import", "BoA: 3 transactions read, balance line skipped and counted (1)", "3 read, 1 skipped",
      `${t.length} read, ${r.skippedTotal} skipped`, t.length === 3 && r.skippedTotal === 1 && r.skipped.badAmount === 1);
    check("Import", "BoA: quoted amount \"1,812.40\" and total", 1681.29, U.sum(t.map(x => x.amount)), close(U.sum(t.map(x => x.amount)), 1681.29));
  });
  safely("Import", "Capital One layout", () => {
    const r = read("capitalone.csv"), t = r.transactions;
    check("Import", "Capital One-style detected", "Capital One-style", r.layout, r.layout === "Capital One-style");
    check("Import", "Debit column = money out, Credit column = money in", "[-38.4, 250, -5.25, -1020.1]",
      t.map(x => x.amount), t[0].amount === -38.4 && t[1].amount === 250 && t[2].amount === -5.25 && t[3].amount === -1020.1);
    check("Import", "Capital One: YYYY-MM-DD dates", "2026-09-02", t[0].date, t[0].date === "2026-09-02");
  });
  safely("Import", "Bad rows", () => {
    const r = read("bad-rows.csv");
    check("Import", "Bad rows skipped and counted by reason", "2 read; 2 bad date, 1 bad amount, 1 no description",
      `${r.transactions.length} read; ${r.skipped.badDate} bad date, ${r.skipped.badAmount} bad amount, ${r.skipped.noDescription} no description`,
      r.transactions.length === 2 && r.skipped.badDate === 2 && r.skipped.badAmount === 1 && r.skipped.noDescription === 1);
    check("Import", "Impossible date 09/31/2026 is rejected", null, U.parseDate("09/31/2026"), U.parseDate("09/31/2026") === null);
  });
  safely("Import", "Duplicates", () => {
    const first = read("chase.csv").transactions;
    const m1 = PW.importer.merge([], first);
    const m2 = PW.importer.merge(m1.all, read("chase.csv").transactions);
    check("Import", "Re-uploading the same file adds 0 and removes 4 duplicates", "0 added, 4 duplicates",
      `${m2.added.length} added, ${m2.duplicates} duplicates`, m2.added.length === 0 && m2.duplicates === 4 && m2.all.length === 4);
    const m3 = PW.importer.merge(m1.all, read("chase-overlap.csv").transactions);
    check("Import", "Overlapping second file adds only the new row", "1 added, 2 duplicates",
      `${m3.added.length} added, ${m3.duplicates} duplicates`, m3.added.length === 1 && m3.duplicates === 2);
  });

  /* ---------------- Robustness ---------------- */
  safely("Robustness", "Bad files", () => {
    const e = PW.importer.readStatement(F.text["empty.csv"], "empty.csv");
    check("Robustness", "Empty file shows a clear message", "message mentions empty", e.error || "(none)", /empty/i.test(e.error || ""));
    const w = PW.importer.readStatement(F.text["wrong-columns.csv"], "wrong-columns.csv");
    check("Robustness", "Wrong columns: asks the user to match columns, with a message", "needsMapping + message",
      w.needsMapping ? "needsMapping: " + w.message : "no mapping", w.needsMapping === true && /could not find/i.test(w.message));
    const p = PW.importer.readStatement(binary("not-a-csv.pdf"), "statement.pdf");
    check("Robustness", "PDF file shows a clear message", "message mentions PDF", p.error || "(none)", /PDF/.test(p.error || ""));
    const b = PW.importer.readStatement(binary("not-a-csv.pdf"), "renamed.csv");
    check("Robustness", "Binary file renamed to .csv is still refused", "error", b.error || "(none)", !!b.error);
    const x = PW.importer.readStatement("PK\u0003\u0004 data", "export.xlsx");
    check("Robustness", "Excel file shows a clear message", "message mentions spreadsheet", x.error || "(none)", /spreadsheet/i.test(x.error || ""));
  });

  /* ---------------- Categorization accuracy ---------------- */
  function accuracy(statement, keyFile, fileName) {
    const txs = withKeys(read(statement, fileName).transactions);
    const key = PW.importer.parseCsv(F.text[keyFile]).slice(1).filter(r => r.length >= 4);
    const per = {}, misses = [];
    let ok = 0, compared = 0, misaligned = 0;
    txs.forEach((t, i) => {
      const k = key[i];
      if (!k || k[0] !== t.date || k[1].replace(/\s+/g, " ").trim() !== t.description) { misaligned++; return; } // the importer squeezes repeated spaces
      const want = k[3], got = PW.cat.categoryOf(t, {});
      per[want] = per[want] || { total: 0, correct: 0 };
      per[want].total++; compared++;
      if (got === want) { ok++; per[want].correct++; } else misses.push({ date: t.date, description: t.description, amount: t.amount, expected: want, got });
    });
    return { overall: compared ? ok / compared : 0, correct: ok, total: compared, misaligned, perCategory: per, misses };
  }
  const acc = { sample: null, holdout: null };
  safely("Categorization", "Sample accuracy", () => {
    acc.sample = accuracy("sample-statement.csv", "answer-key.csv");
    check("Categorization", "Sample statement accuracy (rules were written with this data) >= 85%", ">= 85%",
      `${U.pct(acc.sample.overall)} (${acc.sample.correct}/${acc.sample.total})`, acc.sample.overall >= 0.85 && acc.sample.misaligned === 0);
  });
  safely("Categorization", "Holdout accuracy", () => {
    acc.holdout = accuracy("holdout-boa.csv", "holdout-answer-key.csv");
    check("Categorization", "UNTUNED holdout statement (Bank of America layout) accuracy >= 85%", ">= 85%",
      `${U.pct(acc.holdout.overall)} (${acc.holdout.correct}/${acc.holdout.total})`, acc.holdout.overall >= 0.85 && acc.holdout.misaligned === 0);
  });
  safely("Categorization", "Merchant key", () => {
    const k = PW.cat.merchantKey("SQ *JAVA HOUSE 4471"), k2 = PW.cat.merchantKey("DEBIT CARD PURCHASE SHELL OIL 57442"), k3 = PW.cat.merchantKey("TST* CHIPOTLE 2210");
    check("Categorization", "Merchant cleaning removes prefixes and store numbers", "java house | shell oil | chipotle", `${k} | ${k2} | ${k3}`,
      k === "java house" && k2 === "shell oil" && k3 === "chipotle");
    check("Categorization", "Longest keyword wins (Uber Eats is dining, Uber trip is transportation)", "Dining & coffee | Transportation",
      PW.cat.builtInCategory("uber eats") + " | " + PW.cat.builtInCategory("uber trip"),
      PW.cat.builtInCategory("uber eats") === "Dining & coffee" && PW.cat.builtInCategory("uber trip") === "Transportation");
  });

  /* ---------------- Corrections ---------------- */
  safely("Corrections", "Corrections", () => {
    const oldKey = PW.CONFIG.storageKey;
    PW.CONFIG.storageKey = "pocketwise.automated-test";   // never touch the real saved data
    try {
      const st = makeState(sampleTxs());
      st.userRules["java house"] = "Groceries";             // "Apply to all Java House transactions"
      const java = st.transactions.filter(t => t.key === "java house");
      const allMoved = java.every(t => PW.cat.categoryOf(t, st.userRules) === "Groceries");
      check("Corrections", "Changing a merchant's category applies to all its transactions", `${java.length} moved`,
        `${java.filter(t => PW.cat.categoryOf(t, st.userRules) === "Groceries").length} moved`, allMoved && java.length === 43);
      PW.store.save(st);
      const back = PW.store.load();                         // what a page refresh does
      const kept = back.transactions.filter(t => t.key === "java house").every(t => PW.cat.categoryOf(t, back.userRules) === "Groceries");
      check("Corrections", "The correction survives saving and loading again (refresh)", "Groceries after reload", kept ? "Groceries after reload" : "lost", kept);
      const future = { date: "2026-11-02", description: "SQ *JAVA HOUSE 9999", amount: -5, key: PW.cat.merchantKey("SQ *JAVA HOUSE 9999") };
      check("Corrections", "The rule is used for future imports of the same merchant", "Groceries", PW.cat.categoryOf(future, back.userRules),
        PW.cat.categoryOf(future, back.userRules) === "Groceries");
      const one = Object.assign({}, java[0], { categoryOverride: "Entertainment" });
      check("Corrections", "\"Only this one\" changes just that transaction", "Entertainment / others Groceries",
        PW.cat.categoryOf(one, back.userRules) + " / others " + PW.cat.categoryOf(java[1], back.userRules),
        PW.cat.categoryOf(one, back.userRules) === "Entertainment" && PW.cat.categoryOf(java[1], back.userRules) === "Groceries");
    } finally { PW.store.clearAll(); PW.CONFIG.storageKey = oldKey; }
  });

  /* ---------------- Dashboard ---------------- */
  safely("Dashboard", "Dashboard", () => {
    const st = makeState(sampleTxs());
    const catOf = t => PW.cat.categoryOf(t, {});
    let allOk = true, detail = [];
    PW.income.monthsInData(st.transactions).forEach(m => {
      const s = PW.analysis.monthSummary(st, catOf, m);
      const sumCats = U.sum(s.byCategory.map(r => r.amount));
      // Independent count: money out minus refunds, skipping Income and Transfers
      const independent = U.sum(st.transactions.filter(t => U.monthKey(t.date) === m).map(t => {
        const c = catOf(t);
        if (c === "Income" || c === "Transfers") return 0;
        if (c === "Uncategorized") return t.amount < 0 ? -t.amount : 0;
        return -t.amount;
      }));
      if (!close(sumCats, s.spending) || !close(s.spending, independent)) allOk = false;
      detail.push(`${m}: ${U.money(s.spending)}`);
    });
    check("Dashboard", "Category totals add up to total spending (every month)", "equal", detail.join("; "), allOk);
    const oct = PW.analysis.monthSummary(st, catOf, "2026-10");
    const hasTransfers = oct.byCategory.some(r => r.cat === "Transfers" || r.cat === "Income");
    check("Dashboard", "Transfers (incl. $500 to savings) and income are not in spending", "not in chart",
      hasTransfers ? "found in chart" : "not in chart", !hasTransfers);
    const shopping = PW.analysis.categoryTotals(st.transactions, catOf, "2026-10").Shopping;
    const expectShop = U.sum(st.transactions.filter(t => U.monthKey(t.date) === "2026-10" && catOf(t) === "Shopping").map(t => -t.amount));
    check("Dashboard", "A refund (+$23.99 Amazon return) lowers Shopping", U.money(expectShop), U.money(shopping), close(shopping, expectShop));
    check("Dashboard", "Top merchants list has at most 5", "<= 5", oct.topMerchants.length, oct.topMerchants.length <= 5 && oct.topMerchants.length > 0);
  });

  /* ---------------- Budget ---------------- */
  safely("Budget", "Budget", () => {
    const s = (sp, b) => PW.budget.status(sp, b).level;
    const got = [s(79.9, 100), s(80, 100), s(99.99, 100), s(100, 100), s(100.01, 100)];
    check("Budget", "Progress color switches at 80% and 100%", "green,yellow,yellow,yellow,red", got.join(","),
      got.join(",") === "green,yellow,yellow,yellow,red");
    check("Budget", "\"$X left\" / \"$X over\" text", "$20.00 left | $5.00 over",
      PW.budget.leftText(80, 100) + " | " + PW.budget.leftText(105, 100), PW.budget.leftText(80, 100) === "$20.00 left" && PW.budget.leftText(105, 100) === "$5.00 over");
    const txs = sampleTxs(), catOf = t => PW.cat.categoryOf(t, {});
    const sug = PW.budget.suggested(txs, catOf);
    const avg = PW.analysis.averageByCategory(txs, catOf);
    const okRound = Object.keys(sug).every(c => sug[c] % 5 === 0 && Math.abs(sug[c] - avg[c]) <= 2.5 + 0.001 || (avg[c] < 2.5 && sug[c] === 5));
    check("Budget", "Suggested budget = monthly average rounded to $5 (Housing 1150, Groceries " + sug.Groceries + ")", "rounded to $5",
      `Housing ${sug.Housing}, Dining ${sug["Dining & coffee"]} (avg ${U.money(avg["Dining & coffee"])})`, okRound && sug.Housing === 1150);
    const rec = PW.budget.recommended(sug, avg, 3141.67);
    const floorsOk = Object.keys(rec.budgets).filter(c => PW.cat.needOrWant(c) === "Need")
      .every(c => rec.budgets[c] >= U.roundTo(avg[c] * 0.9, 5));
    const wantSum = Object.keys(rec.budgets).filter(c => PW.cat.needOrWant(c) === "Want").reduce((t, c) => t + rec.budgets[c], 0);
    check("Budget", "Recommended: needs never below 90% of average; wants fit 30% (with $5 rounding)", "floors kept, wants <= $942.50 + rounding",
      `floors ${floorsOk ? "kept" : "broken"}, wants ${U.money(wantSum)}`, floorsOk && wantSum <= 3141.67 * 0.3 + 2.5 * 6);
  });

  /* ---------------- Income after tax ---------------- */
  safely("Income", "Income", () => {
    const m = PW.income.toMonthly;
    check("Income", "$1,450 every 2 weeks = $3,141.67/month", 3141.67, m(1450, "biweekly"), m(1450, "biweekly") === 3141.67);
    check("Income", "$52,000 yearly = $4,333.33/month", 4333.33, m(52000, "yearly"), m(52000, "yearly") === 4333.33);
    check("Income", "$500 weekly = $2,166.67; $1,500 twice a month = $3,000; $2,500 monthly = $2,500", "2166.67 / 3000 / 2500",
      `${m(500, "weekly")} / ${m(1500, "semimonthly")} / ${m(2500, "monthly")}`, m(500, "weekly") === 2166.67 && m(1500, "semimonthly") === 3000 && m(2500, "monthly") === 2500);
    const multi = { sources: [{ amount: 1450, frequency: "biweekly" }, { amount: 400, frequency: "monthly" }, { amount: 6000, frequency: "yearly" }] };
    check("Income", "Multiple income sources add up", 4041.67, PW.income.enteredMonthly(multi), PW.income.enteredMonthly(multi) === 4041.67);
    check("Income", "Amount 0 or negative is not accepted", 0, m(0, "monthly") + m(-5, "monthly"), m(0, "monthly") === 0 && m(-5, "monthly") === 0);

    const txs = sampleTxs(), catOf = t => PW.cat.categoryOf(t, {});
    const inc = { status: "entered", sources: [{ amount: 1450, frequency: "biweekly" }], planWith: "entered" };
    const oct = PW.income.crossCheck(inc, txs, catOf, "2026-10"), sep = PW.income.crossCheck(inc, txs, catOf, "2026-09");
    check("Income", "Mismatch card when >10% apart (Oct: $4,350 vs $3,141.67) and not when within 10% (Sep: $2,900)",
      "Oct mismatch, Sep no mismatch", `Oct ${oct.mismatch ? "mismatch" : "ok"} (${U.pct(oct.differencePct)}), Sep ${sep.mismatch ? "mismatch" : "ok"} (${U.pct(sep.differencePct)})`,
      oct.mismatch && !sep.mismatch);
    const extra = PW.income.extraPaychecks(txs, catOf);
    check("Income", "3-paycheck month found (October, about $1,450)", "2026-10 x3 $1,450", extra.map(e => `${e.month} x${e.count} ${U.money0(e.amount)}`).join(","),
      extra.length === 1 && extra[0].month === "2026-10" && extra[0].count === 3);

    const stEntered = makeState(txs, { income: Object.assign({}, inc) });
    const stStatement = makeState(txs, { income: Object.assign({}, inc, { planWith: "statement" }) });
    const p1 = PW.income.planningIncome(stEntered, catOf), p2 = PW.income.planningIncome(stStatement, catOf);
    const r1 = PW.planner.compute(stEntered, catOf, p1, { today: "2026-11-15" }), r2 = PW.planner.compute(stStatement, catOf, p2, { today: "2026-11-15" });
    check("Income", "\"Plan with my statement deposits\" changes the planner numbers", "3141.67 -> 3383.33",
      `${p1.amount} -> ${p2.amount}; 20% target ${r1.guide.savings} -> ${r2.guide.savings}`, p1.amount === 3141.67 && p2.amount === 3383.33 && r1.guide.savings !== r2.guide.savings);
    const stSkip = makeState(txs, { income: { status: "skipped", sources: [] } });
    const p3 = PW.income.planningIncome(stSkip, catOf);
    check("Income", "Skipping shows the banner and falls back to statement deposits", "banner, 3383.33", `${p3.banner ? "banner" : "no banner"}, ${p3.amount}`,
      p3.banner && p3.amount === 3383.33 && p3.basis === "fallback");
    const stLow = makeState(txs, { income: Object.assign({}, inc, { variable: true, lowMonth: 2600 }) });
    const p4 = PW.income.planningIncome(stLow, catOf);
    check("Income", "Variable income uses the typical low month for planning", 2600, p4.amount, p4.amount === 2600 && p4.basis === "low");
    const oldKey = PW.CONFIG.storageKey; PW.CONFIG.storageKey = "pocketwise.automated-test";
    try {
      PW.store.save(stEntered); const back = PW.store.load();
      check("Income", "Income survives saving and loading (refresh)", 3141.67, PW.income.enteredMonthly(back.income), PW.income.enteredMonthly(back.income) === 3141.67);
    } finally { PW.store.clearAll(); PW.CONFIG.storageKey = oldKey; }
  });

  /* ---------------- Planner (hand-checked example) ---------------- */
  safely("Planner", "Planner", () => {
    // One month: rent $1,800 (need) and restaurants $1,000 (want). Take-home $4,000.
    const txs = withKeys([
      { date: "2026-10-01", description: "PINE RIDGE APTS RENT", amount: -1800 },
      { date: "2026-10-05", description: "OLIVE GARDEN", amount: -1000 }]);
    const catOf = t => PW.cat.categoryOf(t, {});
    const st = makeState(txs, { goals: [{ name: "Laptop", amount: 2400, targetDate: "2027-11-15" }, { name: "Trip", amount: 1200, targetDate: "2027-06-01" }] });
    const r = PW.planner.compute(st, catOf, { amount: 4000, basis: "entered" }, { today: "2026-11-15", whatIfCategory: "Dining & coffee", whatIfCut: 600 });
    check("Planner", "50/30/20 of $4,000 = $2,000 / $1,200 / $800", "2000/1200/800", `${r.guide.needs}/${r.guide.wants}/${r.guide.savings}`,
      r.guide.needs === 2000 && r.guide.wants === 1200 && r.guide.savings === 800);
    check("Planner", "Saved now = 4000 - 1800 - 1000 = $1,200; suggested = $800 (needs under 50%)", "1200 / 800", `${r.saved} / ${r.suggested}`, r.saved === 1200 && r.suggested === 800);
    check("Planner", "Emergency fund 3 / 6 months of needs = $5,400 / $10,800, 5 months to reach 3-month amount", "5400/10800/5",
      `${r.emergency.low}/${r.emergency.high}/${r.emergency.months}`, r.emergency.low === 5400 && r.emergency.high === 10800 && r.emergency.months === 5);
    check("Planner", "Goal dates at $1,200/month, funded in order: Laptop 2 months (Jan 15, 2027), Trip 3 months (Feb 15, 2027)",
      "2027-01-15 / 2027-02-15", `${r.goals[0].finish} / ${r.goals[1].finish}`, r.goals[0].finish === "2027-01-15" && r.goals[1].finish === "2027-02-15");
    check("Planner", "Monthly amount needed: $2,400 over 12 months (365 days) is about $200", "about 200.14", r.goals[0].neededPerMonth, close(r.goals[0].neededPerMonth, 200.14, 0.02));
    check("Planner", "What-if: cut dining $600 -> saves $1,800/month, $21,600/year, Trip 1 month sooner", "1800 / 21600 / Trip 1 sooner",
      `${r.whatIf.newMonthly} / ${r.whatIf.yearly} / Trip ${r.whatIf.goals[1].monthsSooner} sooner`, r.whatIf.newMonthly === 1800 && r.whatIf.yearly === 21600 && r.whatIf.goals[1].monthsSooner === 1);
    const r2 = PW.planner.compute(st, catOf, { amount: 3000, basis: "entered" }, { today: "2026-11-15" });
    check("Planner", "Needs above 50% lower the suggestion: $3,000 pay, $1,800 needs -> 600 - 300 = $300", 300, r2.suggested, r2.suggested === 300);
  });

  /* ---------------- Recurring ---------------- */
  safely("Recurring", "Recurring", () => {
    const txs = sampleTxs(), catOf = t => PW.cat.categoryOf(t, {});
    const r = PW.recurring.detect(txs, catOf, {}, "2026-10");
    const names = r.monthly.map(s => s.name);
    const want = ["Spotify", "Netflix", "Hulu", "Planet Fitness Club Fees", "Apple Icloud Storage", "Adobe Creative Cloud"];
    check("Recurring", "Monthly subscriptions found in the sample", want.join(", "), names.join(", "), want.every(n => names.includes(n)));
    check("Recurring", "Yearly charge found (Amazon Prime, possible yearly)", "Amazon Prime Annual Membership", r.yearly.map(s => s.name).join(", "),
      r.yearly.some(s => /Amazon Prime/.test(s.name)));
    const sp = r.all.find(s => s.name === "Spotify");
    check("Recurring", "Spotify price increase flagged ($10.99 -> $11.99)", "price flag", sp ? sp.flags.map(f => f.text).join("; ") : "not found",
      sp && sp.flags.some(f => f.type === "price"));
    check("Recurring", "Netflix and Hulu flagged as overlap", "Streaming video: Netflix, Hulu", r.overlaps.map(o => o.group + ": " + o.names.join(", ")).join("; "),
      r.overlaps.some(o => o.names.includes("Netflix") && o.names.includes("Hulu")));
    const ad = r.all.find(s => s.name === "Adobe Creative Cloud");
    check("Recurring", "Adobe $0.00 trial then $19.99 flagged as trial turned paid", "trial flag", ad ? ad.flags.map(f => f.type).join(",") : "not found",
      ad && ad.flags.some(f => f.type === "trial"));
    // The SubSleuth bug: Disney+ $7.99, $7.99, $10.99 was dropped.
    const disney = withKeys([
      { date: "2026-08-10", description: "DISNEY PLUS 2211", amount: -7.99 },
      { date: "2026-09-10", description: "DISNEY PLUS 2211", amount: -7.99 },
      { date: "2026-10-10", description: "DISNEY PLUS 2211", amount: -10.99 }]);
    const d = PW.recurring.detect(disney, catOf, {}, "2026-10");
    const dp = d.all[0];
    check("Recurring", "Disney+ $7.99, $7.99, $10.99 is KEPT and flagged (SubSleuth dropped it)", "kept, Price increase: $7.99 -> $10.99",
      dp ? `kept, ${dp.flags.map(f => f.text).join("; ")}` : "dropped", dp && dp.flags.some(f => f.type === "price" && /7\.99.*10\.99/.test(f.text)));
    check("Recurring", "(for comparison) SubSleuth's old 25%-of-median rule alone would reject it", "rejected", PW.recurring.similar([7.99, 7.99, 10.99]) ? "accepted" : "rejected",
      !PW.recurring.similar([7.99, 7.99, 10.99]));
    const javaQ = r.habitQuestions.find(h => h.name === "Java House");
    check("Recurring", "Habit question appears for the coffee shop (16 visits in October)", "Java House, 16 times", javaQ ? `${javaQ.name}, ${javaQ.count} times, ${U.money(javaQ.monthTotal)}` : "not asked",
      javaQ && javaQ.count === 16);
    const after = PW.recurring.detect(txs, catOf, { "java house": "habit" }, "2026-10");
    check("Recurring", "\"It's a habit\" stops the question and lists the habit with its yearly cost", "not asked, listed",
      `${after.habitQuestions.some(h => h.key === "java house") ? "asked" : "not asked"}, ${after.confirmedHabits.some(h => h.key === "java house") ? "listed" : "not listed"}`,
      !after.habitQuestions.some(h => h.key === "java house") && after.confirmedHabits.some(h => h.key === "java house"));
    const sub = PW.recurring.detect(txs, catOf, { "java house": "subscription" }, "2026-10");
    check("Recurring", "\"It's a subscription\" adds it to the Recurring list", "in monthly list", sub.monthly.some(s => s.key === "java house") ? "in monthly list" : "missing",
      sub.monthly.some(s => s.key === "java house"));
  });

  /* ---------------- Settings ---------------- */
  safely("Settings", "Settings", () => {
    const oldKey = PW.CONFIG.storageKey; PW.CONFIG.storageKey = "pocketwise.automated-test";
    try {
      const st = makeState(sampleTxs(), { budgets: { Housing: 1150 }, userRules: { "java house": "Groceries" }, habitAnswers: { "java house": "habit" },
        goals: [{ name: "Laptop", amount: 1200, targetDate: "2027-05-01" }], income: { status: "entered", sources: [{ amount: 1450, frequency: "biweekly" }] } });
      const back = PW.store.importJson(PW.store.exportJson(st));
      const same = back.state && back.state.transactions.length === 157 && back.state.budgets.Housing === 1150 &&
        back.state.userRules["java house"] === "Groceries" && back.state.habitAnswers["java house"] === "habit" && back.state.goals.length === 1 &&
        PW.income.enteredMonthly(back.state.income) === 3141.67;
      check("Settings", "Export then import gives back the same data (incl. income, rules, habits, goals)", "same", same ? "same" : "different", same);
      const bad = PW.store.importJson("{\"hello\": 1}");
      check("Settings", "Importing a file that is not a Pocketwise export shows a message", "error", bad.error || "(accepted)", !!bad.error);
      PW.store.save(st);
      const before = window.localStorage.getItem(PW.CONFIG.storageKey) !== null;
      PW.store.clearAll();
      const afterLoad = PW.store.load();
      check("Settings", "\"Delete all my data\" clears everything", "nothing saved", `${before ? "saved" : "not saved"} -> ${afterLoad.transactions.length} transactions, income ${afterLoad.income.status}`,
        before && afterLoad.transactions.length === 0 && afterLoad.income.status === null && window.localStorage.getItem(PW.CONFIG.storageKey) === null);
    } finally { PW.store.clearAll(); PW.CONFIG.storageKey = oldKey; }
  });

  /* ---------------- Show the results ---------------- */
  const passed = results.filter(r => r.pass).length;
  window.PW_TEST_RESULTS = { ranAt: new Date().toISOString(), passed, failed: results.length - passed, total: results.length, tests: results, accuracy: acc };
  const esc = U.esc;
  const accTable = (title, a) => !a ? "" : `<h2>${esc(title)}: ${U.pct(a.overall)} (${a.correct} of ${a.total} correct)</h2>
    <table><thead><tr><th>Correct category (answer key)</th><th class="num">Transactions</th><th class="num">Correct</th><th class="num">Accuracy</th></tr></thead><tbody>
    ${Object.entries(a.perCategory).sort((x, y) => y[1].total - x[1].total).map(([c, v]) => `<tr><td>${esc(c)}</td><td class="num">${v.total}</td><td class="num">${v.correct}</td><td class="num ${v.correct / v.total < 0.85 ? "fail" : ""}">${U.pct(v.correct / v.total)}</td></tr>`).join("")}</tbody></table>
    <h3>Misses (${a.misses.length})</h3><table><thead><tr><th>Date</th><th>Description</th><th>Expected</th><th>Pocketwise said</th></tr></thead><tbody>
    ${a.misses.map(m => `<tr><td>${m.date}</td><td>${esc(m.description)}</td><td>${esc(m.expected)}</td><td>${esc(m.got)}</td></tr>`).join("") || "<tr><td colspan=4>None</td></tr>"}</tbody></table>`;
  document.getElementById("summary").innerHTML = `<strong class="${passed === results.length ? "pass" : "fail"}">${passed} of ${results.length} checks passed</strong>
    (${results.length - passed} failed). Ran ${new Date().toLocaleString()}.`;
  document.getElementById("results").innerHTML = results.map(r => `<tr><td>${esc(r.area)}</td><td>${esc(r.name)}</td><td>${esc(r.expected)}</td><td>${esc(r.actual)}</td>
    <td class="${r.pass ? "pass" : "fail"}">${r.pass ? "PASS" : "FAIL"}</td></tr>`).join("");
  document.getElementById("accuracy").innerHTML = accTable("Sample statement (rules written with this data)", acc.sample) +
    accTable("Holdout statement (NOT tuned on; the honest number)", acc.holdout);
})();
