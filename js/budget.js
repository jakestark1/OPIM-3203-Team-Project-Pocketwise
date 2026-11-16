/* =====================================================================
   BUDGET ORGANIZER: suggested budgets, progress colors, the 50/30/20
   "Recommended" rebalance.
   ===================================================================== */
window.PW = window.PW || {};

PW.budget = (function () {
  const C = PW.CONFIG, U = PW.util;

  /* Starting budget per category = average monthly spending, rounded to the nearest $5. */
  function suggested(txs, catOf) {
    const avg = PW.analysis.averageByCategory(txs, catOf);
    const out = {};
    Object.keys(avg).forEach(c => {
      if (c === "Uncategorized") return; // sort these first; a budget for "unknown" is not useful
      const v = U.roundTo(avg[c], C.budgetRoundTo);
      if (avg[c] > 0) out[c] = Math.max(v, C.budgetRoundTo);
    });
    return out;
  }

  /* green under 80%, yellow 80-100%, red over 100%. Returns { level, label }. */
  function status(spent, budget) {
    if (!(budget > 0)) return { level: spent > 0 ? "red" : "green", label: spent > 0 ? "No budget set" : "On track", ratio: spent > 0 ? Infinity : 0 };
    const r = spent / budget;
    if (r > C.budgetRedAbove) return { level: "red", label: "Over budget", ratio: r };
    if (r >= C.budgetYellowAt) return { level: "yellow", label: "Close to the limit", ratio: r };
    return { level: "green", label: "On track", ratio: r };
  }

  function leftText(spent, budget) {
    const d = U.cents(budget - spent);
    return d >= 0 ? `${U.money(d)} left` : `${U.money(-d)} over`;
  }

  function total(budgets) { return U.sum(Object.values(budgets || {}).map(Number).filter(n => n > 0)); }

  /* "Recommended": move budgets toward 50% needs / 30% wants of take-home pay.
     - Needs are only cut if they add up to more than 50%, and never below 90% of their average.
     - Wants are cut proportionally if they add up to more than 30%.
     - Nothing is raised. Uncategorized is left alone. Amounts are rounded to $5. */
  function recommended(budgets, averages, income) {
    const out = Object.assign({}, budgets);
    const notes = [];
    if (!(income > 0)) return { budgets: out, notes: ["Add your take-home pay first so Pocketwise knows the 50/30/20 targets."] };
    const needCats = Object.keys(out).filter(c => PW.cat.needOrWant(c) === "Need");
    const wantCats = Object.keys(out).filter(c => PW.cat.needOrWant(c) === "Want");
    const needTarget = income * C.split.needs, wantTarget = income * C.split.wants;

    const needSum = needCats.reduce((t, c) => t + Number(out[c] || 0), 0);
    if (needSum > needTarget) {
      // Cut each need by the same share, but stop at its floor (90% of its average).
      const floors = Object.fromEntries(needCats.map(c => [c, U.roundTo((averages[c] || 0) * C.needsMinShareOfAverage, C.budgetRoundTo)]));
      let excess = needSum - needTarget;
      const room = needCats.reduce((t, c) => t + Math.max(0, out[c] - floors[c]), 0);
      const share = room > 0 ? Math.min(1, excess / room) : 0;
      needCats.forEach(c => {
        const cut = Math.max(0, out[c] - floors[c]) * share;
        out[c] = Math.max(floors[c], U.roundTo(out[c] - cut, C.budgetRoundTo));
      });
      const after = needCats.reduce((t, c) => t + out[c], 0);
      notes.push(after > needTarget
        ? `Needs are cut to their 90% floor (${U.money0(after)}) and still exceed the 50% target (${U.money0(needTarget)}).`
        : `Needs trimmed to fit the 50% target of ${U.money0(needTarget)}.`);
    } else notes.push(`Needs (${U.money0(needSum)}) already fit the 50% target of ${U.money0(needTarget)}; unchanged.`);

    const wantSum = wantCats.reduce((t, c) => t + Number(out[c] || 0), 0);
    if (wantSum > wantTarget && wantSum > 0) {
      const f = wantTarget / wantSum;
      wantCats.forEach(c => { out[c] = Math.max(0, U.roundTo(out[c] * f, C.budgetRoundTo)); });
      notes.push(`Wants scaled down by ${U.pct(1 - f)} to fit the 30% target of ${U.money0(wantTarget)}.`);
    } else notes.push(`Wants (${U.money0(wantSum)}) already fit the 30% target of ${U.money0(wantTarget)}; unchanged.`);
    return { budgets: out, notes };
  }

  return { suggested, status, leftText, total, recommended };
})();
