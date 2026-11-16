/* =====================================================================
   ANALYSIS: the numbers behind the Spending Dashboard.
   Spending = money out in every category except Income and Transfers.
   A refund (money back from a store) lowers that store's category.
   ===================================================================== */
window.PW = window.PW || {};

PW.analysis = (function () {
  const C = PW.CONFIG, U = PW.util;

  /* How much one transaction adds to spending (0 for income and transfers). */
  function spendingOf(tx, cat) {
    if (!PW.cat.isSpendingCategory(cat)) return 0;
    if (cat === "Uncategorized") return tx.amount < 0 ? -tx.amount : 0; // unknown money IN is not a refund
    return -tx.amount; // a purchase of -12.50 adds 12.50; a refund of +23.99 subtracts 23.99
  }

  /* Spending per category for one month: { "Groceries": 312.40, ... } */
  function categoryTotals(txs, catOf, month) {
    const out = {};
    txs.forEach(t => {
      if (month && U.monthKey(t.date) !== month) return;
      const cat = catOf(t), s = spendingOf(t, cat);
      if (s !== 0 || (PW.cat.isSpendingCategory(cat) && t.amount < 0)) out[cat] = U.cents((out[cat] || 0) + s);
    });
    return out;
  }

  /* Average monthly spending per category across all imported months. */
  function averageByCategory(txs, catOf) {
    const months = PW.income.monthsInData(txs);
    const totals = categoryTotals(txs, catOf, null);
    const out = {};
    Object.keys(totals).forEach(c => { out[c] = months.length ? U.cents(totals[c] / months.length) : 0; });
    return out;
  }

  /* Everything the dashboard shows for one month. */
  function monthSummary(state, catOf, month) {
    const txs = state.transactions;
    const totals = categoryTotals(txs, catOf, month);
    const prevKey = U.prevMonthKey(month);
    const hasPrev = txs.some(t => U.monthKey(t.date) === prevKey);
    const prevTotals = hasPrev ? categoryTotals(txs, catOf, prevKey) : null;
    const spending = U.sum(Object.values(totals));
    const byCategory = Object.keys(totals).filter(c => totals[c] > 0).map(c => ({
      cat: c, amount: totals[c], share: spending > 0 ? totals[c] / spending : 0,
      need: PW.cat.needOrWant(c),
      prev: prevTotals ? (prevTotals[c] || 0) : null,
      diff: prevTotals ? U.cents(totals[c] - (prevTotals[c] || 0)) : null
    })).sort((a, b) => b.amount - a.amount);

    // Top 5 merchants by spending this month
    const merch = {};
    txs.forEach(t => {
      if (U.monthKey(t.date) !== month) return;
      const s = spendingOf(t, catOf(t));
      if (!s) return;
      const k = t.key || PW.cat.merchantKey(t.description);
      merch[k] = merch[k] || { key: k, name: PW.cat.merchantName(k), amount: 0, count: 0 };
      merch[k].amount = U.cents(merch[k].amount + s);
      merch[k].count++;
    });
    const topMerchants = Object.values(merch).filter(m => m.amount > 0).sort((a, b) => b.amount - a.amount).slice(0, 5);

    // Needs vs wants
    let needs = 0, wants = 0, unsorted = 0;
    byCategory.forEach(r => {
      if (r.need === "Need") needs += r.amount; else if (r.need === "Want") wants += r.amount; else unsorted += r.amount;
    });

    const deposits = PW.income.depositsByMonth(txs, catOf)[month] || 0;
    const count = txs.filter(t => U.monthKey(t.date) === month).length;
    const uncategorizedCount = txs.filter(t => U.monthKey(t.date) === month && catOf(t) === "Uncategorized").length;
    return { month, prevKey: hasPrev ? prevKey : null, spending, byCategory, topMerchants,
      needs: U.cents(needs), wants: U.cents(wants), unsorted: U.cents(unsorted), deposits, count, uncategorizedCount };
  }

  /* 2-3 plain-language observations, all computed from the data. */
  function insights(summary, planning) {
    const out = [];
    const mName = U.monthName(summary.month);
    const prevName = summary.prevKey ? U.monthName(summary.prevKey) : null;
    const inc = planning.amount;
    if (inc > 0) {
      const p = summary.spending / inc;
      if (p > 1) out.push({ kind: "warn", text: `You spent ${U.pct(p)} of your take-home pay in ${mName}: ${U.money(summary.spending - inc)} more than you brought home.` });
      else out.push({ kind: "info", text: `You spent ${U.pct(p)} of your take-home pay in ${mName}, leaving ${U.money(inc - summary.spending)}.` });
    }
    const wants = summary.byCategory.filter(r => r.need === "Want");
    if (wants.length) {
      const w = wants[0];
      let t = `${w.cat} was your biggest want: ${U.money(w.amount)}`;
      if (w.diff !== null && Math.abs(w.diff) >= 1) t += `, ${w.diff > 0 ? "up" : "down"} ${U.money(Math.abs(w.diff))} from ${prevName}`;
      out.push({ kind: "info", text: t + "." });
    }
    // Biggest increase vs last month (other than the one already mentioned)
    const ups = summary.byCategory.filter(r => r.diff !== null && r.diff > 0 && (!wants.length || r.cat !== wants[0].cat))
      .sort((a, b) => b.diff - a.diff);
    if (ups.length && ups[0].diff >= 20) {
      out.push({ kind: "info", text: `${ups[0].cat} went up the most compared with ${prevName}: +${U.money(ups[0].diff)}.` });
    } else if (summary.uncategorizedCount > 0) {
      out.push({ kind: "info", text: `${summary.uncategorizedCount} transaction(s) this month are not sorted yet. Review them in Transactions to make these numbers more accurate.` });
    }
    return out.slice(0, 3);
  }

  return { spendingOf, categoryTotals, averageByCategory, monthSummary, insights };
})();
