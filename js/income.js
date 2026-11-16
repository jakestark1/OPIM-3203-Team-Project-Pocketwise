/* =====================================================================
   INCOME AFTER TAX: turn take-home pay into a monthly number, compare it
   with the paychecks found in the statement, and decide which number all
   budgets and plans use (the "planning income").
   ===================================================================== */
window.PW = window.PW || {};

PW.income = (function () {
  const C = PW.CONFIG, U = PW.util;

  /* $1,450 every 2 weeks -> 1450 x 26 / 12 = $3,141.67 per month */
  function toMonthly(amount, frequency) {
    const f = C.incomeFrequencies[frequency];
    const a = Number(amount);
    if (!f || !isFinite(a) || a <= 0) return 0;
    return U.cents(a * f.perMonth);
  }

  /* Sum of all income sources, per month. */
  function enteredMonthly(income) {
    if (!income || !income.sources) return 0;
    return U.cents(income.sources.reduce((t, s) => t + toMonthly(s.amount, s.frequency), 0));
  }

  /* Months that appear in the statement, oldest first: ["2026-08", "2026-09", "2026-10"] */
  function monthsInData(txs) {
    return [...new Set(txs.map(t => U.monthKey(t.date)))].sort();
  }

  /* Deposits categorized as Income, added up per month. */
  function depositsByMonth(txs, catOf) {
    const out = {};
    monthsInData(txs).forEach(m => { out[m] = 0; });
    txs.forEach(t => {
      if (t.amount > 0 && catOf(t) === "Income") out[U.monthKey(t.date)] = U.cents(out[U.monthKey(t.date)] + t.amount);
    });
    return out;
  }
  function avgMonthlyDeposits(txs, catOf) {
    const by = depositsByMonth(txs, catOf), months = Object.keys(by);
    return months.length ? U.cents(U.sum(Object.values(by)) / months.length) : 0;
  }

  /* Months where one payer paid 3 times about two weeks apart: the "extra paycheck" months. */
  function extraPaychecks(txs, catOf) {
    const groups = {};
    txs.forEach(t => {
      if (t.amount > 0 && catOf(t) === "Income") {
        const k = (t.key || PW.cat.merchantKey(t.description)) + "|" + U.monthKey(t.date);
        (groups[k] = groups[k] || []).push(t);
      }
    });
    const out = [];
    Object.entries(groups).forEach(([k, list]) => {
      if (list.length < 3) return;
      list.sort((a, b) => a.date.localeCompare(b.date));
      const gaps = list.slice(1).map((t, i) => U.daysBetween(list[i].date, t.date));
      if (gaps.every(g => g >= 12 && g <= 16)) {
        out.push({ month: k.split("|")[1], count: list.length, amount: U.median(list.map(t => t.amount)),
          payer: PW.cat.merchantName(k.split("|")[0]) });
      }
    });
    return out.sort((a, b) => a.month.localeCompare(b.month));
  }

  /* Compare entered take-home pay with the statement for one month. */
  function crossCheck(income, txs, catOf, month) {
    const entered = enteredMonthly(income);
    const by = depositsByMonth(txs, catOf);
    const months = Object.keys(by);
    const m = month && by[month] !== undefined ? month : months[months.length - 1];
    const deposits = m ? by[m] : 0;
    const avg = avgMonthlyDeposits(txs, catOf);
    const diff = entered > 0 ? Math.abs(deposits - entered) / entered : 0;
    const mismatch = entered > 0 && diff > C.incomeMismatchThreshold;
    const reasons = [];
    if (mismatch) {
      const extra = extraPaychecks(txs, catOf).find(e => e.month === m);
      if (deposits > entered) {
        if (extra) reasons.push(`${U.monthName(m)} had ${extra.count} paychecks instead of the usual 2.`);
        reasons.push("Some deposits may not be pay (for example a refund, a gift or money moved in from savings).");
        reasons.push("Your pay may have gone up, or you had a bonus.");
      } else {
        reasons.push("Part of your pay may go to another account (for example savings or a second bank).");
        reasons.push("The statement may cover only part of the month.");
        reasons.push("An income source may be missing from the statement, or a paycheck was labeled differently.");
      }
    }
    return { entered, month: m, deposits, average: avg, byMonth: by, difference: U.cents(deposits - entered),
      differencePct: diff, mismatch, reasons };
  }

  /* The ONE monthly income number used by the dashboard, budget and planner.
     basis tells the screens where it came from. */
  function planningIncome(state, catOf) {
    const inc = state.income || {};
    const txs = state.transactions || [];
    const entered = enteredMonthly(inc);
    const statementAvg = avgMonthlyDeposits(txs, catOf);
    const low = inc.variable && Number(inc.lowMonth) > 0 ? U.cents(Number(inc.lowMonth)) : 0;
    if (inc.status === "entered" && entered > 0) {
      if (inc.planWith === "statement")
        return { amount: statementAvg, basis: "statement", entered, statementAvg, low, banner: false };
      if (low > 0)
        return { amount: Math.min(low, entered), basis: "low", entered, statementAvg, low, banner: false };
      return { amount: entered, basis: "entered", entered, statementAvg, low, banner: false };
    }
    // Skipped or not entered yet: fall back to the paychecks in the statement and show a banner.
    return { amount: statementAvg, basis: statementAvg > 0 ? "fallback" : "none", entered: 0, statementAvg, low: 0, banner: true };
  }

  /* Plain-English label for where the planning number came from. */
  function basisLabel(p) {
    return {
      entered: "Take-home pay you entered",
      low: "Your typical low month (you said your income changes)",
      statement: "Average paychecks in your statement (your choice)",
      fallback: "Average paychecks in your statement (take-home pay not entered)",
      none: "No income entered and no paychecks found"
    }[p.basis];
  }

  return { toMonthly, enteredMonthly, monthsInData, depositsByMonth, avgMonthlyDeposits, extraPaychecks,
    crossCheck, planningIncome, basisLabel };
})();
