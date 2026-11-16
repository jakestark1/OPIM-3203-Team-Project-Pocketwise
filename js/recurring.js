/* =====================================================================
   RECURRING CHARGES AND HABITS (started from SubSleuth's rules).
   Monthly: 2+ charges, every gap 25-35 days.
   Yearly:  2+ charges 350-380 days apart, or one charge from a known
            annual service ("Possible yearly").
   Amounts: similar (within 25% of the median) OR stable, then a step up
            that stays. FIX of the SubSleuth bug: a price increase
            (Disney+ $7.99, $7.99, $10.99) is kept and flagged, never dropped.
   ===================================================================== */
window.PW = window.PW || {};

PW.recurring = (function () {
  const C = PW.CONFIG, R = PW.CONFIG.recurring, U = PW.util;
  // Everyday purchases that repeat but are not subscriptions; these go to the habit check instead.
  const IGNORE = ["Income", "Transfers", "Groceries", "Transportation", "Dining & coffee", "Shopping"];

  function similar(amounts) {
    const m = U.median(amounts);
    return amounts.every(a => Math.abs(a - m) <= m * R.amountTolerance + 0.005);
  }
  /* Stable, then one step UP, then stable at the new level. */
  function stepUp(amounts) {
    for (let k = 1; k < amounts.length; k++) {
      const before = amounts.slice(0, k), after = amounts.slice(k);
      if (similar(before) && similar(after) && U.median(after) > U.median(before)) return true;
    }
    return false;
  }
  function gapsWithin(dates, [lo, hi]) {
    for (let i = 1; i < dates.length; i++) {
      const g = U.daysBetween(dates[i - 1], dates[i]);
      if (g < lo || g > hi) return false;
    }
    return true;
  }
  function groupOf(key) {
    for (const [g, words] of Object.entries(R.overlapGroups)) {
      if (words.some(w => (" " + key).includes(" " + PW.cat.cleanText(w)))) return g;
    }
    return null;
  }

  /* Money-out transactions grouped by merchant key. */
  function groups(txs, catOf, ignore) {
    const out = {};
    txs.forEach(t => {
      if (t.amount > 0) return;
      const cat = catOf(t);
      if (ignore && ignore.includes(cat)) return;
      const k = t.key || PW.cat.merchantKey(t.description);
      (out[k] = out[k] || { key: k, cat, list: [] }).list.push(t);
    });
    Object.values(out).forEach(g => g.list.sort((a, b) => a.date.localeCompare(b.date)));
    return out;
  }

  /* Check one merchant's charges. Returns a subscription object or null. */
  function analyzeGroup(g) {
    const list = g.list, dates = list.map(t => t.date), amts = list.map(t => U.cents(-t.amount));
    let period = null, possible = false;
    if (list.length >= R.minCharges && gapsWithin(dates, R.monthlyGapDays)) period = "monthly";
    else if (list.length >= R.minCharges && gapsWithin(dates, R.yearlyGapDays)) period = "yearly";
    else if (list.length === 1 && R.knownAnnual.some(w => (" " + g.key).includes(" " + PW.cat.cleanText(w))) && amts[0] > R.trialMaxAmount) {
      period = "yearly"; possible = true;
    }
    if (!period) return null;

    // Free trial: first charge $0.00 or $1.00, then real charges.
    let paid = amts, trial = null;
    if (amts.length >= 2 && amts[0] <= R.trialMaxAmount && amts.slice(1).every(a => a > R.trialMaxAmount)) {
      trial = { date: dates[0], amount: amts[0] };
      paid = amts.slice(1);
    }
    if (!paid.length || paid.every(a => a === 0)) return null;
    if (!(similar(paid) || stepUp(paid))) return null;

    const latest = paid[paid.length - 1], earliest = paid[0];
    const flags = [];
    if (latest >= earliest + R.priceIncreaseMin) flags.push({ type: "price", text: `Price increase: ${U.money(earliest)} → ${U.money(latest)}` });
    if (trial) flags.push({ type: "trial", text: `Trial turned paid: ${U.money(trial.amount)} on ${U.fmtDate(trial.date)}, now ${U.money(latest)}` });
    if (possible) flags.push({ type: "possible", text: "Possible yearly (only one charge seen)" });
    const last = dates[dates.length - 1];
    return {
      key: g.key, name: PW.cat.merchantName(g.key), category: g.cat, isBill: PW.cat.needOrWant(g.cat) === "Need",
      period, charges: list.length, latest, earliest,
      monthlyCost: period === "monthly" ? latest : U.cents(latest / 12),
      yearlyCost: period === "monthly" ? U.cents(latest * 12) : latest,
      lastDate: last, nextDate: U.addMonths(last, period === "monthly" ? 1 : 12),
      flags, group: groupOf(g.key), markedByUser: false
    };
  }

  /* Habit candidates for one month: 4+ visits with varying amounts, or a regular
     pattern that is not a subscription. Only wants and unsorted spending are checked. */
  function habitCandidates(txs, catOf, month, subKeys, answers) {
    const all = groups(txs, catOf, ["Income", "Transfers"]);
    const months = PW.income.monthsInData(txs).length || 1;
    const out = [];
    Object.values(all).forEach(g => {
      const nw = PW.cat.needOrWant(g.cat);
      const allowed = (nw === "Want" && C.habit.askForWants) || (g.cat === "Uncategorized" && C.habit.askForUncategorized);
      if (!allowed || subKeys.has(g.key)) return;
      const inMonth = g.list.filter(t => U.monthKey(t.date) === month);
      if (!inMonth.length) return;
      const amts = inMonth.map(t => -t.amount);
      const varying = Math.max(...amts) - Math.min(...amts) > 0.01;
      let regular = false;
      if (g.list.length >= 3 && inMonth.length >= 2) { // repeats on a schedule, at least twice this month
        const gaps = g.list.slice(1).map((t, i) => U.daysBetween(g.list[i].date, t.date));
        const mg = U.median(gaps);
        regular = mg >= 5 && mg <= 60 && gaps.every(x => Math.abs(x - mg) <= 3);
      }
      if (!((inMonth.length >= C.habit.minVisitsPerMonth && varying) || regular)) return;
      const monthTotal = U.sum(amts);
      const avgMonthly = U.cents(U.sum(g.list.map(t => -t.amount)) / months);
      out.push({ key: g.key, name: PW.cat.merchantName(g.key), category: g.cat, count: inMonth.length, monthTotal,
        yearly: U.cents(monthTotal * 12), avgMonthly, answer: answers[g.key] || null });
    });
    return out.sort((a, b) => b.count - a.count || b.monthTotal - a.monthTotal); // most visits first
  }

  /* Everything on the Recurring tab. */
  function detect(txs, catOf, answers, month) {
    answers = answers || {};
    const subs = [];
    Object.values(groups(txs, catOf, IGNORE)).forEach(g => { const s = analyzeGroup(g); if (s) subs.push(s); });

    // Merchants the user said are subscriptions (from the habit check)
    const allGroups = groups(txs, catOf, ["Income", "Transfers"]);
    const months = PW.income.monthsInData(txs).length || 1;
    Object.keys(answers).forEach(k => {
      if (answers[k] !== "subscription" || subs.some(s => s.key === k) || !allGroups[k]) return;
      const g = allGroups[k], avg = U.cents(U.sum(g.list.map(t => -t.amount)) / months);
      const last = g.list[g.list.length - 1].date;
      subs.push({ key: k, name: PW.cat.merchantName(k), category: g.cat, isBill: false, period: "monthly",
        charges: g.list.length, latest: avg, earliest: avg, monthlyCost: avg, yearlyCost: U.cents(avg * 12),
        lastDate: last, nextDate: U.addMonths(last, 1), flags: [{ type: "user", text: "You marked this as a subscription (average per month)" }],
        group: groupOf(k), markedByUser: true });
    });

    // Overlap: 2+ subscriptions in the same group (streaming, music, cloud storage)
    const byGroup = {};
    subs.forEach(s => { if (s.group) (byGroup[s.group] = byGroup[s.group] || []).push(s); });
    const overlaps = [];
    Object.entries(byGroup).forEach(([grp, list]) => {
      if (list.length < 2) return;
      list.forEach(s => s.flags.push({ type: "overlap", text: `Overlap: ${list.length} ${grp.toLowerCase()} services` }));
      overlaps.push({ group: grp, names: list.map(s => s.name) });
    });

    subs.sort((a, b) => b.yearlyCost - a.yearlyCost);
    const monthly = subs.filter(s => s.period === "monthly"), yearly = subs.filter(s => s.period === "yearly");
    const perMonth = U.sum(subs.map(s => s.monthlyCost));
    const subKeys = new Set(subs.map(s => s.key));
    const habits = month ? habitCandidates(txs, catOf, month, subKeys, answers) : [];
    return { monthly, yearly, all: subs, overlaps, totalPerMonth: perMonth, totalPerYear: U.cents(U.sum(subs.map(s => s.yearlyCost))),
      habitQuestions: habits.filter(h => !h.answer), confirmedHabits: habits.filter(h => h.answer === "habit") };
  }

  return { detect, analyzeGroup, similar, stepUp, habitCandidates, IGNORE };
})();
