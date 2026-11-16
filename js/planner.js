/* =====================================================================
   SAVE AND INVEST PLANNER (general education only, not financial advice):
   50/30/20 guideline, emergency fund, suggested savings, goals, what-if.
   All amounts are per month unless the name says otherwise.
   ===================================================================== */
window.PW = window.PW || {};

PW.planner = (function () {
  const C = PW.CONFIG, U = PW.util;
  const DAYS_PER_MONTH = 365.25 / 12;

  /* Average monthly needs / wants / not-sorted spending across the imported months. */
  function averages(txs, catOf) {
    const avg = PW.analysis.averageByCategory(txs, catOf);
    let needs = 0, wants = 0, unsorted = 0;
    Object.keys(avg).forEach(c => {
      const nw = PW.cat.needOrWant(c);
      if (nw === "Need") needs += avg[c]; else if (nw === "Want") wants += avg[c]; else unsorted += avg[c];
    });
    return { byCategory: avg, needs: U.cents(needs), wants: U.cents(wants), unsorted: U.cents(unsorted),
      total: U.cents(needs + wants + unsorted) };
  }

  /* Goals are funded one after another, in the order listed, at `rate` per month. */
  function projectGoals(goals, rate, today) {
    let cumulative = 0;
    return (goals || []).filter(g => g && g.name && Number(g.amount) > 0).map(g => {
      const amount = Number(g.amount);
      cumulative += amount;
      const monthsLeft = g.targetDate ? U.daysBetween(today, g.targetDate) / DAYS_PER_MONTH : null;
      const neededPerMonth = monthsLeft !== null && monthsLeft > 0 ? U.cents(amount / monthsLeft) : null;
      const monthsToFinish = rate > 0 ? Math.ceil(cumulative / rate - 1e-9) : null;
      const finish = monthsToFinish !== null ? U.addMonths(today, monthsToFinish) : null;
      return { name: g.name, amount, targetDate: g.targetDate || null, neededPerMonth,
        datePassed: monthsLeft !== null && monthsLeft <= 0, monthsToFinish, finish,
        onTrack: finish && g.targetDate ? finish <= g.targetDate : null };
    });
  }

  /* Everything on the Plan tab. opts: { today, whatIfCategory, whatIfCut } */
  function compute(state, catOf, planning, opts) {
    opts = opts || {};
    const today = opts.today || U.todayIso();
    const I = planning.amount;
    const a = averages(state.transactions, catOf);
    const saved = U.cents(I - a.total);  // what is left each month on average = current savings rate
    const guide = { needs: U.cents(I * C.split.needs), wants: U.cents(I * C.split.wants), savings: U.cents(I * C.split.savings) };
    const actual = { needs: a.needs, wants: a.wants + a.unsorted, savings: saved };
    const gap = { needs: U.cents(actual.needs - guide.needs), wants: U.cents(actual.wants - guide.wants),
      savings: U.cents(actual.savings - guide.savings) };

    // Suggested monthly set-aside: the 20% target, lowered if needs alone take more than 50%.
    let suggested = guide.savings, suggestedNote = "This is 20% of your take-home pay, the savings part of the 50/30/20 guideline.";
    if (a.needs > guide.needs) {
      suggested = U.cents(Math.max(0, guide.savings - (a.needs - guide.needs)));
      suggestedNote = `Your needs take ${U.pct(I > 0 ? a.needs / I : 0)} of your pay (more than 50%), so the 20% target is lowered by the ${U.money(a.needs - guide.needs)} difference.`;
    }

    const current = Number(state.currentSavings) > 0 ? Number(state.currentSavings) : 0;
    const efLow = U.cents(a.needs * C.emergencyFundMonths.low), efHigh = U.cents(a.needs * C.emergencyFundMonths.high);
    const stillNeeded = Math.max(0, efLow - current);
    const efMonths = stillNeeded === 0 ? 0 : saved > 0 ? Math.ceil(stillNeeded / saved) : null;

    const goals = projectGoals(state.goals, saved, today);

    // What-if: cut one "want" category by some amount per month.
    let whatIf = null;
    if (opts.whatIfCategory) {
      const max = a.byCategory[opts.whatIfCategory] || 0;
      const cut = Math.min(Math.max(0, Number(opts.whatIfCut) || 0), max);
      const newRate = U.cents(saved + cut);
      const newGoals = projectGoals(state.goals, newRate, today);
      whatIf = { category: opts.whatIfCategory, max, cut, newMonthly: newRate, yearly: U.cents(newRate * 12),
        extraPerYear: U.cents(cut * 12),
        goals: newGoals.map((g, i) => ({ name: g.name, finish: g.finish,
          monthsSooner: goals[i].monthsToFinish !== null && g.monthsToFinish !== null ? goals[i].monthsToFinish - g.monthsToFinish
            : (goals[i].monthsToFinish === null && g.monthsToFinish !== null ? "now reachable" : null) })) };
    }

    const debtPayments = a.byCategory["Debt payments"] || 0;
    const priorities = [
      { title: `Build a small starter emergency fund (${U.money0(C.starterEmergencyFund)})`,
        done: current >= C.starterEmergencyFund,
        detail: current >= C.starterEmergencyFund ? "Done, based on the savings you entered." : `You entered ${U.money0(current)} in savings.` },
      { title: "Pay down high-interest debt (for example credit card balances)",
        done: null,
        detail: debtPayments > 0 ? `Your statement shows about ${U.money(debtPayments)} a month in loan payments. Paying high-interest balances first usually saves the most.` : "No loan payments found in your statement." },
      { title: `Grow the emergency fund to ${C.emergencyFundMonths.low}-${C.emergencyFundMonths.high} months of needs (${U.money0(efLow)} to ${U.money0(efHigh)})`,
        done: current >= efLow && efLow > 0, detail: current >= efLow && efLow > 0 ? "You have at least the 3-month amount." : `${U.money0(stillNeeded)} to go for the 3-month amount.` },
      { title: "Invest for the long term (for example a retirement account or a broad index fund)",
        done: null, detail: "General idea only: long-term investing usually comes after a safety cushion. Learn the options before choosing." }
    ];

    return { income: I, basis: planning.basis, averages: a, saved, savedRate: I > 0 ? saved / I : null,
      guide, actual, gap, suggested, suggestedNote, current, emergency: { low: efLow, high: efHigh, months: efMonths, stillNeeded },
      goals, whatIf, priorities, today };
  }

  return { averages, projectGoals, compute };
})();
