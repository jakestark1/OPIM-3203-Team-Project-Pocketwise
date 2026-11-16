/* =====================================================================
   APP: the screens. Each screen is a render function that writes HTML
   into <main id="view">. Buttons carry data-action="..." and inputs carry
   data-change / data-input; one listener per event type looks them up in
   the ACTIONS / CHANGES / INPUTS tables at the bottom of this file.
   All numbers come from the logic files (import, categorize, income,
   analysis, budget, planner, recurring). Nothing here is hard-coded.
   ===================================================================== */
(function () {
  const U = PW.util, C = PW.CONFIG, esc = PW.util.esc;
  let state = PW.store.load();
  // Screen state that does not need to be saved
  const ui = {
    lastImport: null, importError: null, pendingMapping: null,
    tx: { q: "", cat: "", month: null, reviewOnly: false, sort: "date", dir: "desc" },
    incomeDraft: null, incomeErrors: [],
    budgetNotes: null, budgetUndo: null,
    whatIf: { cat: null, cut: 0 },
    deleteConfirm: false, settingsMsg: null
  };
  const $ = sel => document.querySelector(sel);
  const view = $("#view");

  /* ---------- shared helpers ---------- */
  const catOf = t => PW.cat.categoryOf(t, state.userRules);
  const hasData = () => state.transactions.length > 0;
  const months = () => PW.income.monthsInData(state.transactions);
  const planning = () => PW.income.planningIncome(state, catOf);
  function save() { if (!PW.store.save(state)) toast("Could not save in this browser (storage is blocked or full)."); }
  function currentMonth() {
    const m = months();
    if (!m.length) return null;
    if (!state.selectedMonth || !m.includes(state.selectedMonth)) state.selectedMonth = m[m.length - 1];
    return state.selectedMonth;
  }
  /* Show a screen. The address bar changes too (#dashboard), so Back works. */
  function go(route) {
    if (location.hash !== "#" + route) history.pushState(null, "", "#" + route);
    render();
  }
  let toastTimer = null;
  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg; t.classList.add("show");
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove("show"), 3200);
  }
  const catOptions = (selected, extra) => (extra || "") + C.categoryNames.map(n =>
    `<option value="${esc(n)}"${n === selected ? " selected" : ""}>${esc(n)}</option>`).join("");
  const needBadge = cat => {
    const nw = PW.cat.needOrWant(cat);
    return nw ? `<span class="badge ${nw.toLowerCase()}">${nw}</span>` : "";
  };
  function emptyState(title, text) {
    return `<div class="card empty"><h2>${esc(title)}</h2><p>${esc(text)}</p>
      <div class="row" style="justify-content:center"><button class="primary" data-action="upload">Upload bank statement (CSV)</button>
      <button data-action="sample">Try with sample data</button></div></div>`;
  }
  function incomeBanner(p) {
    if (!p.banner) return "";
    return `<div class="banner warn" role="note"><span class="icon" aria-hidden="true">!</span>
      <p><strong>Add your take-home pay for a more accurate plan.</strong> Until then Pocketwise uses the average paychecks found in your statement (${U.money(p.statementAvg)} a month).</p>
      <span class="spacer"></span><a class="btn" href="#income">Add take-home pay</a></div>`;
  }

  /* ---------- modal dialog ---------- */
  function modal({ title, body, buttons, onCancel }) {
    const root = $("#modalRoot");
    root.innerHTML = `<div class="modal-backdrop"><div class="modal" role="dialog" aria-modal="true" aria-labelledby="modalTitle">
      <h2 id="modalTitle">${esc(title)}</h2><div>${body}</div>
      <div class="row">${buttons.map((b, i) => `<button class="${b.cls || ""}" data-mi="${i}">${esc(b.label)}</button>`).join("")}</div>
    </div></div>`;
    const close = () => { root.innerHTML = ""; document.removeEventListener("keydown", onKey); };
    const onKey = e => { if (e.key === "Escape") { close(); if (onCancel) onCancel(); } };
    document.addEventListener("keydown", onKey);
    root.querySelectorAll("[data-mi]").forEach(btn => btn.addEventListener("click", () => {
      close(); const b = buttons[+btn.dataset.mi]; if (b.onClick) b.onClick();
    }));
    const first = root.querySelector("[data-mi]"); if (first) first.focus();
  }

  /* =====================================================================
     IMPORTING FILES
     ===================================================================== */
  function pickFile() { const f = $("#fileInput"); f.value = ""; f.click(); }

  function readFileAsText(file, cb) {
    const r = new FileReader();
    r.onload = () => cb(String(r.result || ""));
    r.onerror = () => cb(null);
    r.readAsText(file);
  }

  /* Called with the text of an uploaded file. */
  function handleStatement(text, fileName, manualColumns) {
    ui.importError = null; ui.pendingMapping = null;
    if (text === null) { ui.importError = "The file could not be read. Please try again."; go("import"); return; }
    const res = PW.importer.readStatement(text, fileName, manualColumns);
    if (res.error && !res.needsMapping) { ui.importError = res.error; go("import"); return; }
    if (res.needsMapping) {
      ui.pendingMapping = { text, fileName, rows: res.rows || PW.importer.parseCsv(text), message: res.message || res.error };
      go("import"); return;
    }
    commitImport(res, fileName, false);
  }

  /* Save imported transactions (dropping duplicates) and show the summary. */
  function commitImport(res, fileName, isSample) {
    let replacedSample = false;
    if (isSample) state = PW.store.blank();
    else if (state.isSample) { state = PW.store.blank(); replacedSample = true; }
    const incoming = res.transactions.map(t => Object.assign({}, t, { id: "t" + (state.nextId++), key: PW.cat.merchantKey(t.description) }));
    const merged = PW.importer.merge(state.transactions, incoming);
    state.transactions = merged.all;
    state.isSample = !!isSample;
    if (isSample && state.income.status === null) {
      state.income.sources = [{ name: "Northwind Logistics paycheck (sample)", amount: 1450, frequency: "biweekly" }];
      state.income.isSample = true;
    }
    // New categories get a suggested budget; budgets the user already set are kept.
    if (state.budgetsSet) {
      const sug = PW.budget.suggested(state.transactions, catOf);
      Object.keys(sug).forEach(c => { if (state.budgets[c] === undefined) state.budgets[c] = sug[c]; });
    }
    const info = { fileName, layout: res.layout, read: res.transactions.length, added: merged.added.length,
      duplicates: merged.duplicates, skipped: res.skipped, skippedTotal: res.skippedTotal, examples: res.examples,
      signNote: res.signNote, from: res.from, to: res.to, total: state.transactions.length, replacedSample, isSample: !!isSample,
      at: new Date().toISOString() };
    state.imports.push(info);
    state.selectedMonth = null; currentMonth();
    ui.lastImport = info; ui.incomeDraft = null; ui.tx.month = null;
    save();
    go("import");
  }

  function loadSample() {
    const doIt = () => commitImport(PW.importer.readStatement(PW.SAMPLE_CSV, "Sample statement (made up)"), "Sample statement (made up)", true);
    if (hasData() && !state.isSample) {
      modal({ title: "Replace your data with sample data?", body: "<p>Loading the sample statement removes the transactions, budgets and settings you have now. You can export your data first in Settings.</p>",
        buttons: [{ label: "Load sample data", cls: "primary", onClick: doIt }, { label: "Cancel" }] });
    } else doIt();
  }

  /* =====================================================================
     SCREENS
     ===================================================================== */

  /* ---------- 1. Welcome ---------- */
  function renderWelcome() {
    view.innerHTML = `
    <section class="hero">
      <div>
        <h1>See where your money goes.</h1>
        <p class="lead">Pocketwise reads the CSV file from your bank, sorts every purchase into a category, and helps you set a budget and a savings plan.</p>
        <div class="privacy"><span aria-hidden="true">🔒</span><span>Your data stays in this browser. No bank login, no account, nothing is uploaded.</span></div>
        <div class="hero-actions">
          <button class="primary big" data-action="upload">Upload bank statement (CSV)</button>
          <button class="big" data-action="sample">Try with sample data</button>
        </div>
        ${hasData() ? `<p class="small" style="margin-top:12px">You already have ${state.transactions.length} transactions saved. <a href="#dashboard">Go to your dashboard</a>.</p>` : ""}
      </div>
      <div class="card">
        <h2>How it works</h2>
        <ol class="steps">
          <li><span><strong>Add your statement.</strong> Download "transactions as CSV" from your bank's website.</span></li>
          <li><span><strong>Enter your take-home pay.</strong> The amount that lands in your account after taxes.</span></li>
          <li><span><strong>See your spending</strong> by category, month by month.</span></li>
          <li><span><strong>Set budgets and a plan</strong> for saving, and spot recurring charges.</span></li>
        </ol>
      </div>
    </section>
    <section class="card">
      <h2>Bank file layouts Pocketwise reads</h2>
      <div class="formats">
        <div><strong>Simple</strong><code>date, description, amount</code></div>
        <div><strong>Chase-style</strong><code>Transaction Date, Post Date, Description, Category, Type, Amount</code></div>
        <div><strong>Bank of America-style</strong><code>Date, Description, Amount, Running Bal.</code></div>
        <div><strong>Capital One-style</strong><code>Transaction Date, Posted Date, Card No., Description, Category, Debit, Credit</code></div>
      </div>
      <p class="small muted" style="margin-top:10px">Other layouts work too if you match the columns yourself. Dates can be 2026-08-03 or 08/03/2026.</p>
    </section>`;
  }

  /* ---------- 2. Import summary / errors / column matching ---------- */
  function renderImport() {
    if (ui.importError) {
      view.innerHTML = `<div class="card"><h1>That file did not work</h1>
        <div class="error-box" role="alert">${esc(ui.importError)}</div>
        <div class="row"><button class="primary" data-action="upload">Choose another file</button>
        <button data-action="sample">Try with sample data</button>${hasData() ? `<a class="btn" href="#dashboard">Back to dashboard</a>` : ""}</div></div>`;
      return;
    }
    if (ui.pendingMapping) return renderMapping();
    const s = ui.lastImport || state.imports[state.imports.length - 1];
    if (!s) { renderWelcome(); return; }
    const sk = s.skipped || {};
    const skippedLines = [];
    if (sk.badDate) skippedLines.push(`${sk.badDate} with a date that could not be read`);
    if (sk.badAmount) skippedLines.push(`${sk.badAmount} with a missing or unreadable amount (for example a balance line)`);
    if (sk.noDescription) skippedLines.push(`${sk.noDescription} with no description`);
    const next = state.income.status === null
      ? `<button class="primary big" data-action="goto" data-to="income">Next: your income after tax</button>`
      : `<button class="primary big" data-action="goto" data-to="dashboard">Go to your dashboard</button>`;
    view.innerHTML = `
    <div class="card">
      <p class="muted" style="margin:0">${s.isSample ? "Sample data (made up)" : "Statement imported"}</p>
      <h1>Read ${s.read} transactions from ${U.fmtDate(s.from)} to ${U.fmtDate(s.to)}</h1>
      ${s.replacedSample ? `<div class="banner info"><p>Your file replaced the sample data.</p></div>` : ""}
      <ul class="list-plain">
        <li><span>File</span><strong>${esc(s.fileName)}</strong></li>
        <li><span>Layout found</span><strong>${esc(s.layout)}</strong></li>
        <li><span>Plus and minus signs</span><span>${esc(s.signNote)}</span></li>
        <li><span>Rows skipped</span><span>${s.skippedTotal ? `${s.skippedTotal}: ${esc(skippedLines.join("; "))}` : "None"}</span></li>
        <li><span>Duplicates removed</span><span>${s.duplicates ? `${s.duplicates} (already saved from an earlier upload)` : "None"}</span></li>
        <li><span>New transactions added</span><strong>${s.added}</strong></li>
        <li><span>Total saved in this browser</span><strong>${s.total} transactions</strong></li>
      </ul>
      ${s.examples && s.examples.length ? `<p class="small muted">Skipped rows: ${esc(s.examples.join("; "))}${s.skippedTotal > s.examples.length ? "; ..." : ""}</p>` : ""}
      <div class="row" style="margin-top:14px">${next}<button data-action="upload">Upload another file</button></div>
      <p class="small muted" style="margin-top:12px">Any category column in the bank file is ignored; Pocketwise sorts transactions with its own rules, which you can correct.</p>
    </div>`;
  }

  function renderMapping() {
    const pm = ui.pendingMapping;
    const header = pm.rows[0] || [];
    const opts = sel => `<option value="-1">(none)</option>` + header.map((h, i) =>
      `<option value="${i}"${i === sel ? " selected" : ""}>${esc(h || "Column " + (i + 1))}</option>`).join("");
    const preview = pm.rows.slice(1, 6);
    view.innerHTML = `<div class="card">
      <h1>Match the columns</h1>
      <div class="banner warn" role="alert"><p>${esc(pm.message)}</p></div>
      <p>File: <strong>${esc(pm.fileName)}</strong>. Pick which column holds each piece of information. Use either one Amount column, or separate Debit and Credit columns.</p>
      <div class="row" style="align-items:flex-end">
        <label class="field">Date<select id="mapDate">${opts(-1)}</select></label>
        <label class="field">Description<select id="mapDesc">${opts(-1)}</select></label>
        <label class="field">Amount<select id="mapAmount">${opts(-1)}</select></label>
        <span class="muted">or</span>
        <label class="field">Debit (money out)<select id="mapDebit">${opts(-1)}</select></label>
        <label class="field">Credit (money in)<select id="mapCredit">${opts(-1)}</select></label>
      </div>
      <h3 style="margin-top:16px">First rows of the file</h3>
      <div class="table-wrap"><table><thead><tr>${header.map(h => `<th>${esc(h)}</th>`).join("")}</tr></thead>
      <tbody>${preview.map(r => `<tr>${header.map((_, i) => `<td>${esc(r[i] || "")}</td>`).join("")}</tr>`).join("") || `<tr><td>No rows below the header.</td></tr>`}</tbody></table></div>
      <div id="mapError"></div>
      <div class="row" style="margin-top:14px"><button class="primary" data-action="apply-mapping">Use these columns</button>
      <button data-action="upload">Choose another file</button></div>
    </div>`;
  }

  /* ---------- 3. Income after tax ---------- */
  function incomeDraft() {
    if (!ui.incomeDraft) {
      const inc = JSON.parse(JSON.stringify(state.income));
      if (!inc.sources.length) inc.sources = [{ name: "", amount: "", frequency: "biweekly" }];
      ui.incomeDraft = inc;
    }
    return ui.incomeDraft;
  }
  function renderIncome() {
    const d = incomeDraft();
    const freqOpts = sel => Object.entries(C.incomeFrequencies).map(([k, f]) =>
      `<option value="${k}"${k === sel ? " selected" : ""}>${f.label}</option>`).join("");
    const rows = d.sources.map((s, i) => `
      <div class="card" style="background:#fbfcfc">
        <div class="row" style="align-items:flex-end">
          <label class="field" style="flex:1 1 220px">${i === 0 ? "Name (optional)" : "Income source name"}
            <input type="text" data-input="inc-name" data-i="${i}" value="${esc(s.name || "")}" placeholder="${i === 0 ? "Main job" : "Side job"}"></label>
          <label class="field">Take-home amount
            <span class="money-input"><span>$</span><input type="number" min="0" step="0.01" inputmode="decimal" data-input="inc-amount" data-i="${i}" value="${s.amount === "" || s.amount == null ? "" : esc(s.amount)}" aria-describedby="live${i}" ${i === 0 ? "required" : ""}></span></label>
          <label class="field">How often
            <select data-change="inc-freq" data-i="${i}">${freqOpts(s.frequency)}</select></label>
          ${i > 0 ? `<button data-action="inc-remove" data-i="${i}" aria-label="Remove income source ${i + 1}">Remove</button>` : ""}
        </div>
        <p class="small" id="live${i}" style="margin:8px 0 0"><strong data-live="${i}"></strong></p>
      </div>`).join("");
    view.innerHTML = `
    <div class="page-head"><div><h1>What is your income after tax?</h1>
      <p>Enter your take-home pay: the amount that actually lands in your bank account after taxes and deductions.</p></div></div>
    ${d.isSample ? `<div class="banner info"><p><strong>Sample value:</strong> the made-up person in the sample statement takes home $1,450 every 2 weeks. Press "Save income" to continue.</p></div>` : ""}
    <div class="grid grid-2" style="align-items:start">
      <div>
        ${rows}
        ${d.sources.length < 1 + C.maxExtraIncomeSources ? `<button data-action="inc-add">+ Add another income source</button>` : `<p class="small muted">You can add up to ${C.maxExtraIncomeSources} extra income sources.</p>`}
        <div class="card" style="margin-top:16px">
          <label class="checkbox"><input type="checkbox" data-change="inc-variable" ${d.variable ? "checked" : ""}> My income changes from month to month</label>
          ${d.variable ? `<label class="field" style="margin-top:10px">A typical low month (take-home, per month)
            <span class="money-input"><span>$</span><input type="number" min="0" step="0.01" data-input="inc-low" value="${d.lowMonth == null ? "" : esc(d.lowMonth)}"></span>
            <span class="hint">Budgets and savings suggestions will use this lower number.</span></label>` : ""}
        </div>
        <div id="incomeErrors"></div>
        <div class="row"><button class="primary big" data-action="inc-save">Save income</button>
        <button class="big" data-action="inc-skip">Skip for now</button></div>
        <p class="small muted" style="margin-top:10px">Pocketwise never asks for your gross salary, employer, tax details or ID numbers. This stays in this browser.</p>
      </div>
      <div><div class="card" id="incomeTotal"></div><div id="crossCheck"></div></div>
    </div>`;
    updateIncomeLive();
  }

  /* Update the "= $X per month" lines and the cross-check card while typing. */
  function updateIncomeLive() {
    const d = incomeDraft();
    d.sources.forEach((s, i) => {
      const el = view.querySelector(`[data-live="${i}"]`);
      if (!el) return;
      const m = PW.income.toMonthly(s.amount, s.frequency);
      el.textContent = m > 0 ? `= ${U.money(m)} per month` : (s.amount === "" ? "" : "Enter an amount greater than $0");
    });
    const total = PW.income.enteredMonthly(d);
    const low = d.variable && Number(d.lowMonth) > 0 ? Number(d.lowMonth) : 0;
    $("#incomeTotal").innerHTML = `<div class="stat" style="border:none;padding:0">
      <div class="label">Total monthly take-home</div><div class="value">${U.money(total)}</div>
      <div class="note">${d.sources.length > 1 ? "All income sources added together." : "Weekly x 52 / 12, every 2 weeks x 26 / 12, twice a month x 2, yearly / 12."}</div>
      ${low ? `<div class="pair"><div>Typical month<strong>${U.money(total)}</strong></div><div>Typical low month (used for planning)<strong>${U.money(Math.min(low, total))}</strong></div></div>` : ""}</div>`;
    const box = $("#crossCheck");
    if (!hasData()) { box.innerHTML = ""; return; }
    const cc = PW.income.crossCheck(d, state.transactions, catOf, currentMonth());
    const extras = PW.income.extraPaychecks(state.transactions, catOf);
    const monthsList = Object.entries(cc.byMonth).map(([m, v]) => `<li><span>${U.monthLabel(m)}</span><span class="num">${U.money(v)}</span></li>`).join("");
    let html = `<div class="card"><h2>Check against your statement</h2>`;
    if (total > 0) {
      html += `<p>You entered <strong>${U.money(total)}/month</strong> take-home. Your statement shows <strong>${U.money(cc.deposits)}</strong> in paychecks in ${U.monthLabel(cc.month)}.</p>`;
    } else html += `<p>Your statement shows <strong>${U.money(cc.deposits)}</strong> in paychecks in ${U.monthLabel(cc.month)}. Enter your take-home pay to compare.</p>`;
    html += `<ul class="list-plain small">${monthsList}<li><span>Average per month</span><strong class="num">${U.money(cc.average)}</strong></li></ul>`;
    if (cc.mismatch) {
      html += `<div class="banner warn" style="margin-top:12px;display:block"><p><strong>These differ by ${U.pct(cc.differencePct)}</strong> (${U.money(Math.abs(cc.difference))}). Possible reasons:</p>
        <ul style="margin:6px 0 0 18px;padding:0">${cc.reasons.map(r => `<li>${esc(r)}</li>`).join("")}</ul></div>
        <fieldset style="border:1px solid var(--line);border-radius:10px;padding:10px 14px"><legend><strong>Which number should Pocketwise plan with?</strong></legend>
        <label class="checkbox" style="font-weight:500"><input type="radio" name="planWith" value="entered" data-change="inc-planwith" ${d.planWith !== "statement" ? "checked" : ""}> Plan with what I entered (${U.money(low ? Math.min(low, total) : total)}/month)</label>
        <label class="checkbox" style="font-weight:500;margin-top:6px"><input type="radio" name="planWith" value="statement" data-change="inc-planwith" ${d.planWith === "statement" ? "checked" : ""}> Plan with my statement deposits (average ${U.money(cc.average)}/month)</label></fieldset>`;
    } else if (total > 0) {
      html += `<div class="banner good" style="margin-top:12px"><p>✓ Within 10% of your statement for ${U.monthLabel(cc.month)}. Looks right.</p></div>`;
    }
    extras.forEach(e => {
      html += `<div class="banner info" style="margin-top:8px"><p><strong>${U.monthLabel(e.month)} has an extra paycheck</strong> of about ${U.money(e.amount)} (${e.count} paychecks). Consider saving it.</p></div>`;
    });
    box.innerHTML = html + `</div>`;
  }

  /* ---------- 4. Dashboard ---------- */
  function renderDashboard() {
    if (!hasData()) { view.innerHTML = emptyState("Upload a statement to see your spending", "Your dashboard shows where your money went, by category, once you add a bank statement CSV."); return; }
    const m = currentMonth(), p = planning();
    const s = PW.analysis.monthSummary(state, catOf, m);
    const inc = p.amount, net = U.cents(inc - s.spending), rate = inc > 0 ? net / inc : null;
    const max = s.byCategory.length ? s.byCategory[0].amount : 1;
    const enteredLabel = p.basis === "entered" ? "Take-home (you entered)" : p.basis === "low" ? "Take-home (your low month)" :
      p.basis === "statement" ? "Take-home (statement average)" : "Take-home (statement average)";
    const chart = s.byCategory.map(r => {
      const w = Math.max(1, r.amount / max * 100);
      const color = r.cat === "Uncategorized" ? "#9aa6b4" : r.need === "Need" ? "#2f6db5" : "#0f6e4f";
      let chg = `<span class="flat">no earlier month</span>`;
      if (r.diff !== null) chg = r.diff > 0.004 ? `<span class="up">▲ ${U.money(r.diff)} vs ${U.monthName(s.prevKey).slice(0, 3)}</span>`
        : r.diff < -0.004 ? `<span class="down">▼ ${U.money(-r.diff)} vs ${U.monthName(s.prevKey).slice(0, 3)}</span>` : `<span class="flat">no change</span>`;
      return `<div class="chart-row">
        <div class="name" title="${esc(r.cat)}">${esc(r.cat)}</div>
        <svg viewBox="0 0 100 20" preserveAspectRatio="none" role="img" aria-label="${esc(r.cat)}: ${U.money(r.amount)}, ${U.pct(r.share)} of spending">
          <rect x="0" y="2" width="100" height="16" fill="#eef1f4"></rect><rect x="0" y="2" width="${w.toFixed(2)}" height="16" fill="${color}"></rect></svg>
        <div class="amt">${U.money(r.amount)} <span>${U.pct(r.share)}</span></div>
        <div class="chg">${chg}</div></div>`;
    }).join("");
    const insights = PW.analysis.insights(s, p);
    const total = s.needs + s.wants + s.unsorted || 1;
    const extra = PW.income.extraPaychecks(state.transactions, catOf).find(e => e.month === m);
    view.innerHTML = `
    ${incomeBanner(p)}
    <div class="page-head"><div><h1>Spending in ${U.monthLabel(m)}</h1><p>${s.count} transactions this month${state.isSample ? " · sample data (made up)" : ""}</p></div>
      ${s.uncategorizedCount ? `<a class="btn" href="#transactions" data-action="review">${s.uncategorizedCount} to review</a>` : ""}</div>
    <div class="grid grid-4">
      <div class="stat"><div class="label">Take-home income</div><div class="value">${U.money(inc)}</div>
        <div class="pair"><div>${enteredLabel}<strong>${p.entered > 0 ? U.money(p.basis === "low" ? p.low : p.entered) : "not entered"}</strong></div><div>Deposits in statement<strong>${U.money(s.deposits)}</strong></div></div></div>
      <div class="stat"><div class="label">Spending</div><div class="value">${U.money(s.spending)}</div><div class="note">Transfers between accounts are not counted.</div></div>
      <div class="stat"><div class="label">Net</div><div class="value ${net < 0 ? "neg" : ""}">${U.money(net)}</div><div class="note">${net < 0 ? "Spent more than take-home pay" : "Take-home minus spending"}</div></div>
      <div class="stat"><div class="label">Saved rate</div><div class="value ${rate !== null && rate < 0 ? "neg" : ""}">${rate === null ? "-" : U.pct(rate)}</div><div class="note">Share of take-home pay not spent</div></div>
    </div>
    ${extra ? `<div class="banner info" style="margin-top:16px"><p><strong>This month has an extra paycheck</strong> of about ${U.money(extra.amount)}. Consider saving it.</p></div>` : ""}
    <div class="grid" style="grid-template-columns:minmax(0,1.7fr) minmax(0,1fr);margin-top:16px" id="dashGrid">
      <div class="card"><h2>Spending by category <span class="sub">largest first, with change from ${s.prevKey ? U.monthName(s.prevKey) : "the month before"}</span></h2>
        <div class="chart">${chart || `<p class="muted">No spending this month.</p>`}</div></div>
      <div>
        <div class="card"><h2>Insights</h2><ul class="insights">${insights.map(i => `<li class="${i.kind}">${esc(i.text)}</li>`).join("") || "<li>Not enough data yet.</li>"}</ul></div>
        <div class="card"><h2>Needs vs wants</h2>
          <div class="split-bar" role="img" aria-label="Needs ${U.money(s.needs)}, wants ${U.money(s.wants)}, not sorted ${U.money(s.unsorted)}">
            <div style="width:${s.needs / total * 100}%;background:#2f6db5"></div><div style="width:${s.wants / total * 100}%;background:#0f6e4f"></div><div style="width:${s.unsorted / total * 100}%;background:#9aa6b4"></div></div>
          <div class="legend"><span><i style="background:#2f6db5"></i>Needs ${U.money(s.needs)} (${U.pct(s.needs / total)})</span>
          <span><i style="background:#0f6e4f"></i>Wants ${U.money(s.wants)} (${U.pct(s.wants / total)})</span>
          ${s.unsorted ? `<span><i style="background:#9aa6b4"></i>Not sorted ${U.money(s.unsorted)}</span>` : ""}</div></div>
        <div class="card"><h2>Top 5 merchants</h2><ol class="list-plain">${s.topMerchants.map(t =>
          `<li><span>${esc(t.name)} <span class="muted small">(${t.count}x)</span></span><span class="num">${U.money(t.amount)}</span></li>`).join("")}</ol></div>
      </div>
    </div>
    <div class="row"><a class="btn primary" href="#budget">Next: set your budgets</a><a class="btn" href="#transactions">See all transactions</a></div>`;
    if (window.matchMedia("(max-width: 980px)").matches) $("#dashGrid").style.gridTemplateColumns = "1fr";
  }

  /* ---------- 5. Transactions ---------- */
  function renderTransactions() {
    if (!hasData()) { view.innerHTML = emptyState("No transactions yet", "Upload a statement to see and correct your transactions."); return; }
    const f = ui.tx;
    const monthSel = f.month || currentMonth();
    const all = state.transactions;
    const reviewAll = all.filter(t => catOf(t) === "Uncategorized").length;
    const q = f.q.trim().toLowerCase();
    let rows = all.filter(t => (monthSel === "all" || U.monthKey(t.date) === monthSel)
      && (!f.cat || catOf(t) === f.cat)
      && (!f.reviewOnly || catOf(t) === "Uncategorized")
      && (!q || t.description.toLowerCase().includes(q) || PW.cat.merchantName(t.key).toLowerCase().includes(q)));
    const val = {
      date: t => t.date, merchant: t => PW.cat.merchantName(t.key), description: t => t.description,
      category: t => catOf(t), amount: t => t.amount
    }[f.sort];
    rows.sort((a, b) => { const x = val(a), y = val(b); const c = typeof x === "number" ? x - y : String(x).localeCompare(String(y)); return f.dir === "asc" ? c : -c; });
    const th = (key, label, cls) => {
      const sorted = f.sort === key;
      return `<th class="${cls || ""}" aria-sort="${sorted ? (f.dir === "asc" ? "ascending" : "descending") : "none"}">
        <button class="sort" data-action="tx-sort" data-col="${key}">${label}${sorted ? (f.dir === "asc" ? " ▲" : " ▼") : ""}</button></th>`;
    };
    const monthOpts = `<option value="all"${monthSel === "all" ? " selected" : ""}>All months</option>` +
      months().map(m => `<option value="${m}"${m === monthSel ? " selected" : ""}>${U.monthLabel(m)}</option>`).join("");
    view.innerHTML = `
    <div class="page-head"><div><h1>Transactions</h1><p>Change any category with the menu in the Category column. Pocketwise remembers your choice for that merchant.</p></div>
      <button data-action="upload">Upload another statement</button></div>
    ${reviewAll ? `<div class="banner warn"><span class="icon" aria-hidden="true">!</span><p><strong>Review: ${reviewAll} transaction${reviewAll > 1 ? "s" : ""} not sorted yet.</strong> They are highlighted below. Pick a category so your totals are accurate.</p>
      <span class="spacer"></span><button data-action="tx-review-toggle">${f.reviewOnly ? "Show all" : "Show only these"}</button></div>`
      : `<div class="banner good"><p>✓ Every transaction has a category.</p></div>`}
    <div class="card">
      <div class="filters">
        <label class="field" style="flex:1 1 240px">Search<input type="search" data-input="tx-q" value="${esc(f.q)}" placeholder="Merchant or description"></label>
        <label class="field">Category<select data-change="tx-cat"><option value="">All categories</option>${catOptions(f.cat)}</select></label>
        <label class="field">Month<select data-change="tx-month">${monthOpts}</select></label>
      </div>
      <p class="small muted" id="txCount">Showing ${rows.length} of ${all.length} transactions</p>
      <div class="table-wrap"><table>
        <thead><tr>${th("date", "Date")}${th("merchant", "Merchant")}${th("description", "Description")}${th("category", "Category")}${th("amount", "Amount", "num")}</tr></thead>
        <tbody>${rows.map(t => {
          const c = catOf(t), review = c === "Uncategorized";
          return `<tr class="${review ? "needs-review" : ""}">
            <td class="num" style="text-align:left">${U.fmtDate(t.date)}</td>
            <td><strong>${esc(PW.cat.merchantName(t.key))}</strong>${review ? ` <span class="badge review">Review</span>` : ""}</td>
            <td class="desc">${esc(t.description)}</td>
            <td><select data-change="tx-category" data-id="${t.id}" aria-label="Category for ${esc(t.description)} on ${U.fmtDate(t.date)}">${catOptions(c)}</select></td>
            <td class="num ${t.amount > 0 ? "amount-in" : ""}">${t.amount > 0 ? "+" : ""}${U.money(t.amount)}</td></tr>`;
        }).join("") || `<tr><td colspan="5" class="muted">No transactions match these filters.</td></tr>`}</tbody>
      </table></div>
    </div>`;
  }

  /* The user picked a new category for one transaction. */
  function changeCategory(id, newCat) {
    const tx = state.transactions.find(t => t.id === id);
    if (!tx) return;
    const oldCat = catOf(tx);
    if (oldCat === newCat) return;
    const same = state.transactions.filter(t => t.key === tx.key);
    const name = PW.cat.merchantName(tx.key);
    const applyAll = () => {
      state.userRules[tx.key] = newCat;
      same.forEach(t => { delete t.categoryOverride; });
      save(); render();
      toast(`${name}: ${same.length} transaction${same.length > 1 ? "s" : ""} moved to ${newCat}. Future imports will use this too.`);
    };
    const onlyThis = () => { tx.categoryOverride = newCat; save(); render(); toast(`This ${name} transaction moved to ${newCat}.`); };
    modal({
      title: `Apply to all ${name} transactions?`,
      body: `<p>You changed a <strong>${esc(name)}</strong> transaction from <strong>${esc(oldCat)}</strong> to <strong>${esc(newCat)}</strong>.</p>
        <p>There ${same.length === 1 ? "is 1 transaction" : `are ${same.length} transactions`} from ${esc(name)}. If you apply to all, Pocketwise also remembers this for future uploads.</p>`,
      buttons: [{ label: `Yes, apply to all ${same.length}`, cls: "primary", onClick: applyAll },
        { label: "Only this one", onClick: onlyThis }, { label: "Cancel", onClick: render }],
      onCancel: render
    });
  }

  /* ---------- 6. Budget ---------- */
  function ensureBudgets() {
    if (!state.budgetsSet && hasData()) {
      state.budgets = PW.budget.suggested(state.transactions, catOf);
      state.budgetsSet = true; save();
    }
  }
  function renderBudget() {
    if (!hasData()) { view.innerHTML = emptyState("No budget yet", "Upload a statement and Pocketwise will suggest a starting budget for every category."); return; }
    ensureBudgets();
    const m = currentMonth(), p = planning();
    const totals = PW.analysis.categoryTotals(state.transactions, catOf, m);
    const avg = PW.analysis.averageByCategory(state.transactions, catOf);
    const cats = [...new Set([...Object.keys(state.budgets), ...Object.keys(totals)])].filter(c => c !== "Uncategorized" && PW.cat.isSpendingCategory(c))
      .sort((a, b) => (state.budgets[b] || 0) - (state.budgets[a] || 0));
    const totalBudget = PW.budget.total(state.budgets);
    const over = p.amount > 0 && totalBudget > p.amount;
    const uncatSpend = totals.Uncategorized || 0;
    const rowsHtml = cats.map(c => {
      const b = Number(state.budgets[c] || 0), spent = Math.max(0, totals[c] || 0);
      const st = PW.budget.status(spent, b);
      const w = b > 0 ? Math.min(100, spent / b * 100) : (spent > 0 ? 100 : 0);
      const icon = st.level === "green" ? "✓" : st.level === "yellow" ? "!" : "✕";
      return `<div class="budget-row" data-cat="${esc(c)}">
        <div><div class="cat">${esc(c)}</div>${needBadge(c)} <span class="small muted">avg ${U.money0(avg[c] || 0)}/mo</span></div>
        <label class="field"><span class="small">Monthly budget</span><span class="money-input"><span>$</span>
          <input type="number" min="0" step="5" data-change="budget" data-cat="${esc(c)}" value="${b}" aria-label="Monthly budget for ${esc(c)}"></span></label>
        <div class="progress-cell"><div class="progress" role="progressbar" aria-label="${esc(c)} budget used" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(b > 0 ? spent / b * 100 : 0)}">
          <div class="lvl-${st.level}" style="width:${w}%"></div></div>
          <div class="small muted" style="margin-top:4px">${U.money(spent)} of ${U.money0(b)} spent (${b > 0 ? U.pct(spent / b) : "-"})</div></div>
        <div class="left-cell"><div class="status ${st.level}"><span aria-hidden="true">${icon}</span> ${st.label}</div>
          <div class="small">${b > 0 ? PW.budget.leftText(spent, b) : "Set a budget"}</div></div>
      </div>`;
    }).join("");
    view.innerHTML = `
    ${incomeBanner(p)}
    <div class="page-head"><div><h1>Budget for ${U.monthLabel(m)}</h1><p>Suggested budgets are your average monthly spending per category, rounded to $5. Change any amount.</p></div>
      <div class="row"><button class="primary" data-action="budget-recommended">Recommended (50/30/20)</button>
      <button data-action="budget-reset">Reset to suggested</button>${ui.budgetUndo ? `<button data-action="budget-undo">Undo</button>` : ""}</div></div>
    ${ui.budgetNotes ? `<div class="banner info" style="display:block"><p><strong>Recommended budgets applied.</strong></p><ul style="margin:4px 0 0 18px;padding:0">${ui.budgetNotes.map(n => `<li>${esc(n)}</li>`).join("")}</ul></div>` : ""}
    <div class="grid grid-3">
      <div class="stat"><div class="label">Total of all budgets</div><div class="value">${U.money0(totalBudget)}</div><div class="note">per month</div></div>
      <div class="stat"><div class="label">Monthly take-home pay</div><div class="value">${U.money0(p.amount)}</div><div class="note">${esc(PW.income.basisLabel(p))}</div></div>
      <div class="stat"><div class="label">${over ? "Budgets are over take-home by" : "Left after budgets"}</div><div class="value ${over ? "neg" : ""}">${U.money0(Math.abs(p.amount - totalBudget))}</div>
        <div class="note">${over ? "Lower some budgets, or try Recommended." : "Room for savings and goals."}</div></div>
    </div>
    ${over ? `<div class="banner bad" style="margin-top:16px"><span class="icon" aria-hidden="true">✕</span><p><strong>Your budgets add up to more than your take-home pay</strong> (${U.money0(totalBudget)} vs ${U.money0(p.amount)}).</p></div>` : ""}
    <div class="card" style="margin-top:16px">
      <div class="legend small" style="margin-bottom:6px"><span><i class="lvl-green"></i>✓ under 80%</span><span><i class="lvl-yellow"></i>! 80-100%</span><span><i class="lvl-red"></i>✕ over 100%</span></div>
      ${rowsHtml}
    </div>
    ${uncatSpend > 0 ? `<p class="small muted">${U.money(uncatSpend)} of spending this month is not sorted yet and is not in any budget. <a href="#transactions" data-action="review">Review it</a>.</p>` : ""}
    <div class="row"><a class="btn primary" href="#plan">Next: your savings plan</a></div>`;
  }

  /* ---------- 7. Plan ---------- */
  function renderPlan() {
    if (!hasData()) { view.innerHTML = emptyState("No plan yet", "Upload a statement so Pocketwise can see your needs and wants."); return; }
    const p = planning();
    const wantCats = Object.entries(PW.analysis.averageByCategory(state.transactions, catOf)).filter(([c, v]) => PW.cat.needOrWant(c) === "Want" && v > 0)
      .sort((a, b) => b[1] - a[1]);
    if (!ui.whatIf.cat && wantCats.length) ui.whatIf.cat = wantCats[0][0];
    const r = PW.planner.compute(state, catOf, p, { whatIfCategory: ui.whatIf.cat, whatIfCut: ui.whatIf.cut });
    const gapTxt = (g, goodWhenNeg) => {
      if (Math.abs(g) < 0.5) return `<span class="flat">on target</span>`;
      const bad = goodWhenNeg ? g > 0 : g < 0;
      return `<span class="${bad ? "up" : "down"}">${g > 0 ? "+" : "-"}${U.money(Math.abs(g))} ${g > 0 ? "over" : "under"}</span>`;
    };
    const goalsForm = (state.goals.length ? state.goals : []).map((g, i) => `
      <div class="goal-row">
        <label class="field">Goal name<input type="text" data-change="goal" data-i="${i}" data-f="name" value="${esc(g.name || "")}" placeholder="e.g. New laptop"></label>
        <label class="field">Amount<span class="money-input"><span>$</span><input type="number" min="0" step="10" data-change="goal" data-i="${i}" data-f="amount" value="${g.amount || ""}"></span></label>
        <label class="field">Target date<input type="date" data-change="goal" data-i="${i}" data-f="targetDate" value="${esc(g.targetDate || "")}"></label>
        <button data-action="goal-remove" data-i="${i}" aria-label="Remove goal ${i + 1}">Remove</button>
      </div>`).join("");
    const goalsOut = r.goals.map(g => `<li><span><strong>${esc(g.name)}</strong> (${U.money0(g.amount)}${g.targetDate ? ` by ${U.fmtDate(g.targetDate)}` : ""})<br>
      <span class="small muted">${g.neededPerMonth !== null ? `Needs ${U.money(g.neededPerMonth)} a month to reach it by the target date.` : g.datePassed ? "The target date has passed." : "Add a target date to see the monthly amount needed."}</span></span>
      <span class="num">${g.finish ? `Done about <strong>${U.fmtDate(g.finish)}</strong><br><span class="small ${g.onTrack === false ? "up" : g.onTrack ? "down" : "muted"}">${g.onTrack === false ? "after your target date" : g.onTrack ? "on time" : ""}</span>` : `<span class="up">Not reachable at your current savings rate</span>`}</span></li>`).join("");
    view.innerHTML = `
    ${incomeBanner(p)}
    <div class="page-head"><div><h1>Save and invest plan</h1><p>Based on your average month: ${U.money(r.averages.total)} spending across ${months().length} month(s) of data.</p></div>
      <a class="btn" href="#income">Edit income</a></div>
    <div class="disclaimer" role="note">Pocketwise gives general educational guidance, not personal financial or investment advice.</div>
    <div class="grid grid-3" style="margin-top:16px">
      <div class="stat"><div class="label">Monthly take-home used</div><div class="value">${U.money(r.income)}</div><div class="note">${esc(PW.income.basisLabel(p))}</div></div>
      <div class="stat"><div class="label">You save now (average)</div><div class="value ${r.saved < 0 ? "neg" : ""}">${U.money(r.saved)}</div><div class="note">${r.savedRate === null ? "" : U.pct(r.savedRate) + " of take-home, per month"}</div></div>
      <div class="stat"><div class="label">Suggested to set aside</div><div class="value">${U.money(r.suggested)}</div><div class="note">${esc(r.suggestedNote)}</div></div>
    </div>
    <div class="grid grid-2" style="margin-top:16px;align-items:start">
      <div class="card"><h2>50/30/20 guideline vs your month</h2>
        <div class="table-wrap"><table><thead><tr><th></th><th class="num">Guideline</th><th class="num">Yours (avg)</th><th class="num">Gap</th></tr></thead><tbody>
        <tr><td><strong>Needs</strong> (50%)</td><td class="num">${U.money(r.guide.needs)}</td><td class="num">${U.money(r.actual.needs)}</td><td class="num">${gapTxt(r.gap.needs, true)}</td></tr>
        <tr><td><strong>Wants</strong> (30%)</td><td class="num">${U.money(r.guide.wants)}</td><td class="num">${U.money(r.actual.wants)}</td><td class="num">${gapTxt(r.gap.wants, true)}</td></tr>
        <tr><td><strong>Savings and debt payoff</strong> (20%)</td><td class="num">${U.money(r.guide.savings)}</td><td class="num">${U.money(r.actual.savings)}</td><td class="num">${gapTxt(r.gap.savings, false)}</td></tr>
        </tbody></table></div>
        <p class="small muted" style="margin-top:8px">"Yours" wants include spending that is not sorted yet. Loan payments count as needs.</p></div>
      <div class="card"><h2>Emergency fund</h2>
        <label class="field" style="max-width:260px">Current savings (optional)<span class="money-input"><span>$</span>
          <input type="number" min="0" step="50" data-change="current-savings" value="${state.currentSavings == null ? "" : state.currentSavings}"></span></label>
        <ul class="list-plain" style="margin-top:10px">
          <li><span>3 months of needs</span><strong class="num">${U.money0(r.emergency.low)}</strong></li>
          <li><span>6 months of needs</span><strong class="num">${U.money0(r.emergency.high)}</strong></li>
          <li><span>Time to reach the 3-month amount</span><strong class="num">${r.emergency.months === 0 ? "Reached" : r.emergency.months === null ? "Not reachable at your current savings rate" : `about ${r.emergency.months} month${r.emergency.months > 1 ? "s" : ""}`}</strong></li>
        </ul></div>
    </div>
    <div class="grid grid-2" style="align-items:start">
      <div class="card"><h2>A simple order of priorities</h2><ol class="checklist">${r.priorities.map((x, i) =>
        `<li><span class="mark ${x.done ? "done" : ""}" aria-label="${x.done ? "done" : "step " + (i + 1)}">${x.done ? "✓" : i + 1}</span><span><strong>${esc(x.title)}</strong><br><span class="small muted">${esc(x.detail)}</span></span></li>`).join("")}</ol></div>
      <div class="card"><h2>Savings goals <span class="sub">up to ${C.maxGoals}, funded one after another</span></h2>
        ${goalsForm}${state.goals.length < C.maxGoals ? `<button data-action="goal-add">+ Add a goal</button>` : ""}
        ${r.goals.length ? `<ul class="list-plain" style="margin-top:12px">${goalsOut}</ul>` : `<p class="small muted" style="margin-top:10px">Add a goal (name, amount, date) to see how long it takes at your current savings rate of ${U.money(r.saved)} a month.</p>`}</div>
    </div>
    <div class="card"><h2>What if I spent less?</h2>
      ${wantCats.length ? `<div class="row" style="align-items:flex-end">
        <label class="field">Cut this want<select data-change="whatif-cat">${wantCats.map(([c, v]) => `<option value="${esc(c)}"${c === ui.whatIf.cat ? " selected" : ""}>${esc(c)} (avg ${U.money0(v)}/mo)</option>`).join("")}</select></label>
        <label class="field" style="flex:1 1 260px"><span>Cut it by <span id="whatIfCutLabel">${U.money0(r.whatIf ? r.whatIf.cut : 0)}</span> a month</span>
          <input type="range" min="0" max="${Math.ceil((r.whatIf ? r.whatIf.max : 0) / 5) * 5}" step="5" value="${r.whatIf ? r.whatIf.cut : 0}" data-input="whatif-cut"></label></div>
        <div id="whatIfOut"></div>` : `<p class="muted">No "want" spending found to cut.</p>`}
    </div>
    <div class="disclaimer">Pocketwise gives general educational guidance, not personal financial or investment advice. It never recommends a specific stock, fund or company.</div>`;
    renderWhatIf(r);
  }
  function renderWhatIf(r) {
    const out = $("#whatIfOut");
    if (!out || !r.whatIf) return;
    const w = r.whatIf;
    $("#whatIfCutLabel").textContent = U.money0(w.cut);
    out.innerHTML = `<div class="grid grid-3" style="margin-top:10px">
      <div class="stat"><div class="label">New monthly savings</div><div class="value">${U.money(w.newMonthly)}</div><div class="note">was ${U.money(r.saved)}</div></div>
      <div class="stat"><div class="label">Saved in a year</div><div class="value">${U.money0(w.yearly)}</div><div class="note">${U.money0(w.extraPerYear)} more than now</div></div>
      <div class="stat"><div class="label">Goals</div>${w.goals.length ? w.goals.map(g => `<div class="note"><strong>${esc(g.name)}</strong>: ${g.monthsSooner === "now reachable" ? "now reachable" : g.monthsSooner > 0 ? `${g.monthsSooner} month${g.monthsSooner > 1 ? "s" : ""} sooner` : g.monthsSooner === 0 ? "same month" : "not reachable yet"}${g.finish ? ` (${U.fmtDate(g.finish)})` : ""}</div>`).join("") : `<div class="note">Add a goal to see how much sooner you reach it.</div>`}</div>
    </div>`;
  }

  /* ---------- 8. Recurring ---------- */
  function renderRecurring() {
    if (!hasData()) { view.innerHTML = emptyState("No recurring charges yet", "Upload a statement to find subscriptions, price increases and repeat purchases."); return; }
    const m = currentMonth();
    const r = PW.recurring.detect(state.transactions, catOf, state.habitAnswers, m);
    const table = list => list.length ? `<div class="table-wrap"><table><thead><tr><th>Merchant</th><th>Category</th><th class="num">Charges</th><th class="num">Amount</th><th>Next expected</th><th class="num">Per year</th><th>Flags</th></tr></thead><tbody>
      ${list.map(s => `<tr><td><strong>${esc(s.name)}</strong>${s.isBill ? ` <span class="badge need">Bill</span>` : ""}</td><td>${esc(s.category)}</td><td class="num">${s.charges}</td>
        <td class="num">${U.money(s.latest)}</td><td>${U.fmtDate(s.nextDate)}</td><td class="num">${U.money(s.yearlyCost)}</td>
        <td>${s.flags.map(f => `<span class="flag ${f.type}">${esc(f.text)}</span>`).join("") || "-"}</td></tr>`).join("")}</tbody></table></div>` : `<p class="muted">None found.</p>`;
    const alerts = r.all.flatMap(s => s.flags.filter(f => f.type === "price" || f.type === "trial").map(f => ({ s, f })));
    view.innerHTML = `
    <div class="page-head"><div><h1>Recurring charges</h1><p>Charges that repeat every month or every year, found with plain rules (same merchant, regular timing, similar amount).</p></div></div>
    <div class="grid grid-3">
      <div class="stat"><div class="label">Recurring charges found</div><div class="value">${r.all.length}</div><div class="note">${r.monthly.length} monthly, ${r.yearly.length} yearly</div></div>
      <div class="stat"><div class="label">Total per month</div><div class="value">${U.money(r.totalPerMonth)}</div><div class="note">yearly charges counted as 1/12</div></div>
      <div class="stat"><div class="label">Total per year</div><div class="value">${U.money(r.totalPerYear)}</div></div>
    </div>
    ${alerts.length || r.overlaps.length ? `<div class="card" style="margin-top:16px"><h2>Worth a second look</h2><ul class="insights">
      ${alerts.map(a => `<li class="${a.f.type === "price" ? "warn" : ""}"><strong>${esc(a.s.name)}:</strong> ${esc(a.f.text)}</li>`).join("")}
      ${r.overlaps.map(o => `<li><strong>Overlap (${esc(o.group.toLowerCase())}):</strong> you pay for ${o.names.map(esc).join(" and ")}. Do you need all of them?</li>`).join("")}</ul></div>` : ""}
    <div class="card" style="margin-top:16px"><h2>Habit or subscription? <span class="sub">${U.monthLabel(m)}</span></h2>
      ${r.habitQuestions.length ? r.habitQuestions.map(h => `<div class="habit-card">
        <p><strong>You paid ${esc(h.name)} ${h.count} time${h.count > 1 ? "s" : ""} this month (${U.money(h.monthTotal)}). Is this a habit or a subscription?</strong></p>
        <p class="small muted">${esc(h.name)}: ${h.count} time${h.count > 1 ? "s" : ""}, ${U.money0(h.monthTotal)} this month, about ${U.money0(h.yearly)} a year.</p>
        <div class="row"><button data-action="habit" data-key="${esc(h.key)}" data-answer="habit">It's a habit</button>
        <button data-action="habit" data-key="${esc(h.key)}" data-answer="subscription">It's a subscription</button></div></div>`).join("")
        : `<p class="muted">No repeat purchases to ask about this month.</p>`}
      ${r.confirmedHabits.length ? `<h3 style="margin-top:12px">Your habits</h3><ul class="list-plain">${r.confirmedHabits.map(h =>
        `<li><span>${esc(h.name)}: ${h.count} times, ${U.money0(h.monthTotal)} this month, about <strong>${U.money0(h.yearly)} a year</strong></span>
        <button class="link" data-action="habit-reset" data-key="${esc(h.key)}">Ask me again</button></li>`).join("")}</ul>` : ""}
    </div>
    <div class="card"><h2>Monthly</h2>${table(r.monthly)}</div>
    <div class="card"><h2>Yearly</h2>${table(r.yearly)}</div>
    <p class="small muted">Pocketwise cannot cancel anything. To cancel a subscription, use the company's own website or app.</p>`;
  }

  /* ---------- 9. Settings ---------- */
  function renderSettings() {
    const p = planning(), inc = state.income;
    const srcs = inc.sources.map(s => `${esc(s.name || "Income")}: ${U.money(Number(s.amount) || 0)} ${esc((C.incomeFrequencies[s.frequency] || {}).label || "")}`).join("<br>");
    view.innerHTML = `
    <div class="page-head"><div><h1>Settings and privacy</h1><p>Everything is saved only in this browser on this computer.</p></div></div>
    ${ui.settingsMsg ? `<div class="banner ${ui.settingsMsg.kind}" role="status"><p>${esc(ui.settingsMsg.text)}</p></div>` : ""}
    <div class="grid grid-2" style="align-items:start">
      <div class="card"><h2>Income after tax</h2>
        <p>${inc.status === "entered" ? srcs + `<br><strong>${U.money(PW.income.enteredMonthly(inc))} per month</strong>` : inc.status === "skipped" ? "Skipped. Pocketwise uses your statement's paychecks instead." : "Not entered yet."}</p>
        <p class="small muted">Planning with: ${esc(PW.income.basisLabel(p))} (${U.money(p.amount)}/month)</p>
        <a class="btn primary" href="#income">Edit income</a></div>
      <div class="card"><h2>Statements</h2>
        <p>${state.transactions.length} transactions saved${state.isSample ? " (sample data, made up)" : ""}. ${state.imports.length} file(s) imported.</p>
        <div class="row"><button data-action="upload">Upload another statement</button><button data-action="sample">Load sample data</button></div>
        <p class="small muted" style="margin-top:8px">A second file adds to your data; exact duplicates (same date, description and amount) are skipped.</p></div>
      <div class="card"><h2>Your data</h2>
        <p>Make a backup file, or move your data to another browser.</p>
        <div class="row"><button data-action="export" ${hasData() || state.income.status ? "" : "disabled"}>Export my data</button><button data-action="import-json">Import my data</button></div>
        <p class="small muted" style="margin-top:8px">The export is a JSON file with your transactions, income, budgets, goals, category rules and habit answers.</p></div>
      <div class="card"><h2>Delete all my data</h2>
        ${ui.deleteConfirm ? `<div class="banner bad" role="alert" style="display:block"><p><strong>Delete everything?</strong> This removes all transactions, income, budgets, goals, category corrections and habit answers from this browser. It cannot be undone.</p></div>
          <div class="row"><button class="danger" data-action="delete-yes">Yes, delete everything</button><button data-action="delete-no">Cancel</button></div>`
          : `<p>Removes everything Pocketwise saved in this browser.</p><button class="danger" data-action="delete-ask">Delete all my data</button>`}</div>
    </div>
    <div class="card"><h2>Privacy</h2><ul>
      <li>No bank login and no account. Pocketwise never sends your data anywhere: no analytics, no online fonts or scripts.</li>
      <li>Data is kept in this browser's local storage. Anyone using this browser on this computer could see it; use "Delete all my data" on a shared computer.</li>
      <li>Categories come from simple keyword rules and can be wrong. Check the Transactions tab.</li>
      <li>General educational guidance only, not personal financial or investment advice.</li></ul></div>`;
  }

  /* =====================================================================
     HEADER AND ROUTING
     ===================================================================== */
  const SCREENS = { welcome: renderWelcome, import: renderImport, income: renderIncome, dashboard: renderDashboard,
    transactions: renderTransactions, budget: renderBudget, plan: renderPlan, recurring: renderRecurring, settings: renderSettings };

  function renderHeader(route) {
    $("#sampleBadge").hidden = !state.isSample;
    const ms = months(), pick = $("#monthPicker");
    $("#monthPickerWrap").hidden = !ms.length;
    const cm = currentMonth();
    pick.innerHTML = ms.map(m => `<option value="${m}"${m === cm ? " selected" : ""}>${U.monthLabel(m)}</option>`).join("");
    document.querySelectorAll("#tabs a").forEach(a => {
      if (a.dataset.tab === route) a.setAttribute("aria-current", "page");
      else a.removeAttribute("aria-current");
    });
    const review = state.transactions.filter(t => catOf(t) === "Uncategorized").length;
    const rc = $("#reviewCount");
    rc.hidden = !review; rc.textContent = review; rc.setAttribute("aria-label", `${review} to review`);
    $("#tabs").classList.toggle("hidden", !hasData() && ["welcome", "import"].includes(route));
  }

  let lastRoute = null;
  function render() {
    let route = location.hash.replace(/^#\/?/, "");
    if (!SCREENS[route]) route = hasData() ? "dashboard" : "welcome";
    renderHeader(route);
    SCREENS[route]();
    if (route !== lastRoute) { window.scrollTo(0, 0); view.focus({ preventScroll: true }); lastRoute = route; }
    document.title = (route === "welcome" ? "" : route[0].toUpperCase() + route.slice(1) + " · ") + "Pocketwise: Your personal money planner";
  }

  /* =====================================================================
     EVENTS
     ===================================================================== */
  const ACTIONS = {
    upload: () => pickFile(),
    sample: () => loadSample(),
    goto: el => go(el.dataset.to),
    review: (el, e) => { e.preventDefault(); ui.tx.reviewOnly = true; ui.tx.month = "all"; ui.tx.cat = ""; go("transactions"); },
    "apply-mapping": () => {
      const v = id => Number($(id).value);
      const cols = { date: v("#mapDate"), description: v("#mapDesc"), amount: v("#mapAmount"), debit: v("#mapDebit"), credit: v("#mapCredit") };
      let msg = null;
      if (cols.date < 0 || cols.description < 0) msg = "Pick the date and the description columns.";
      else if (cols.amount < 0 && (cols.debit < 0 || cols.credit < 0)) msg = "Pick an Amount column, or both a Debit and a Credit column.";
      if (msg) { $("#mapError").innerHTML = `<div class="error-box" role="alert">${esc(msg)}</div>`; return; }
      const pm = ui.pendingMapping;
      const res = PW.importer.readStatement(pm.text, pm.fileName, cols);
      if (res.error) { $("#mapError").innerHTML = `<div class="error-box" role="alert">${esc(res.error)} Check that the columns you picked are right.</div>`; return; }
      ui.pendingMapping = null;
      commitImport(res, pm.fileName, false);
    },
    "inc-add": () => { incomeDraft().sources.push({ name: "", amount: "", frequency: "monthly" }); renderIncome(); },
    "inc-remove": el => { incomeDraft().sources.splice(+el.dataset.i, 1); renderIncome(); },
    "inc-save": () => {
      const d = incomeDraft(), errs = [];
      const sources = d.sources.filter((s, i) => i === 0 || s.name || s.amount !== "");
      sources.forEach((s, i) => { if (!(Number(s.amount) > 0)) errs.push(i === 0 ? "Enter your take-home pay (an amount greater than $0)." : `Enter an amount greater than $0 for "${s.name || "income source " + (i + 1)}", or remove it.`); });
      if (d.variable && !(Number(d.lowMonth) > 0)) errs.push("Enter a typical low month, or uncheck \"My income changes from month to month\".");
      if (errs.length) { $("#incomeErrors").innerHTML = `<div class="error-box" role="alert">${errs.map(esc).join("<br>")}</div>`; return; }
      const cc = hasData() ? PW.income.crossCheck(d, state.transactions, catOf, currentMonth()) : { mismatch: false };
      state.income = { status: "entered", sources: sources.map(s => ({ name: s.name || "", amount: U.cents(Number(s.amount)), frequency: s.frequency })),
        variable: !!d.variable, lowMonth: d.variable ? U.cents(Number(d.lowMonth)) : null,
        planWith: cc.mismatch && d.planWith === "statement" ? "statement" : "entered", isSample: !!d.isSample };
      ui.incomeDraft = null; save();
      toast(`Income saved: ${U.money(PW.income.enteredMonthly(state.income))} per month.`);
      go(hasData() ? "dashboard" : "welcome");
    },
    "inc-skip": () => {
      state.income.status = "skipped"; state.income.planWith = "entered"; ui.incomeDraft = null; save();
      go(hasData() ? "dashboard" : "welcome");
    },
    "tx-sort": el => { const c = el.dataset.col; if (ui.tx.sort === c) ui.tx.dir = ui.tx.dir === "asc" ? "desc" : "asc"; else { ui.tx.sort = c; ui.tx.dir = c === "amount" || c === "date" ? "desc" : "asc"; } renderTransactions(); },
    "tx-review-toggle": () => { ui.tx.reviewOnly = !ui.tx.reviewOnly; if (ui.tx.reviewOnly) ui.tx.month = "all"; renderTransactions(); },
    "budget-recommended": () => {
      ensureBudgets();
      ui.budgetUndo = Object.assign({}, state.budgets);
      const res = PW.budget.recommended(state.budgets, PW.analysis.averageByCategory(state.transactions, catOf), planning().amount);
      state.budgets = res.budgets; ui.budgetNotes = res.notes; save(); renderBudget();
    },
    "budget-reset": () => { ui.budgetUndo = Object.assign({}, state.budgets); state.budgets = PW.budget.suggested(state.transactions, catOf); ui.budgetNotes = null; save(); renderBudget(); toast("Budgets reset to your monthly averages."); },
    "budget-undo": () => { if (ui.budgetUndo) state.budgets = ui.budgetUndo; ui.budgetUndo = null; ui.budgetNotes = null; save(); renderBudget(); },
    "goal-add": () => { if (state.goals.length < C.maxGoals) state.goals.push({ name: "", amount: "", targetDate: "" }); save(); renderPlan(); },
    "goal-remove": el => { state.goals.splice(+el.dataset.i, 1); save(); renderPlan(); },
    habit: el => {
      state.habitAnswers[el.dataset.key] = el.dataset.answer; save(); renderRecurring();
      toast(el.dataset.answer === "habit" ? "Got it. Pocketwise will stop asking about this merchant." : "Added to your recurring charges.");
    },
    "habit-reset": el => { delete state.habitAnswers[el.dataset.key]; save(); renderRecurring(); },
    export: () => {
      const blob = new Blob([PW.store.exportJson(state)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob); a.download = `pocketwise-data-${U.todayIso()}.json`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      ui.settingsMsg = { kind: "good", text: "Your data was saved as a JSON file in your downloads." }; renderSettings();
    },
    "import-json": () => { const f = $("#jsonInput"); f.value = ""; f.click(); },
    "delete-ask": () => { ui.deleteConfirm = true; renderSettings(); },
    "delete-no": () => { ui.deleteConfirm = false; renderSettings(); },
    "delete-yes": () => {
      state = PW.store.clearAll();
      Object.assign(ui, { lastImport: null, importError: null, pendingMapping: null, incomeDraft: null, budgetNotes: null, budgetUndo: null,
        deleteConfirm: false, settingsMsg: null, whatIf: { cat: null, cut: 0 } });
      ui.tx = { q: "", cat: "", month: null, reviewOnly: false, sort: "date", dir: "desc" };
      go("welcome"); toast("All your Pocketwise data was deleted from this browser.");
    }
  };

  const CHANGES = {
    "inc-freq": el => { incomeDraft().sources[+el.dataset.i].frequency = el.value; incomeDraft().isSample = false; updateIncomeLive(); },
    "inc-variable": el => { incomeDraft().variable = el.checked; renderIncome(); },
    "inc-planwith": el => { incomeDraft().planWith = el.value; },
    "tx-cat": el => { ui.tx.cat = el.value; renderTransactions(); },
    "tx-month": el => { ui.tx.month = el.value; renderTransactions(); },
    "tx-category": el => changeCategory(el.dataset.id, el.value),
    budget: el => { const v = Math.max(0, Math.round(Number(el.value) || 0)); state.budgets[el.dataset.cat] = v; ui.budgetNotes = null; save(); renderBudget(); },
    "current-savings": el => { state.currentSavings = el.value === "" ? null : Math.max(0, Number(el.value)); save(); renderPlan(); },
    goal: el => {
      const g = state.goals[+el.dataset.i]; if (!g) return;
      g[el.dataset.f] = el.dataset.f === "amount" ? (el.value === "" ? "" : Math.max(0, Number(el.value))) : el.value;
      save(); renderPlan();
    },
    "whatif-cat": el => { ui.whatIf.cat = el.value; ui.whatIf.cut = 0; renderPlan(); }
  };
  const INPUTS = {
    "inc-name": el => { incomeDraft().sources[+el.dataset.i].name = el.value; },
    "inc-amount": el => { incomeDraft().sources[+el.dataset.i].amount = el.value; incomeDraft().isSample = false; updateIncomeLive(); },
    "inc-low": el => { incomeDraft().lowMonth = el.value; updateIncomeLive(); },
    "tx-q": el => {
      ui.tx.q = el.value; const pos = el.selectionStart; renderTransactions();
      const s = view.querySelector('[data-input="tx-q"]'); s.focus(); try { s.setSelectionRange(pos, pos); } catch (e) { /* ignore */ }
    },
    "whatif-cut": el => {
      ui.whatIf.cut = Number(el.value);
      renderWhatIf(PW.planner.compute(state, catOf, planning(), { whatIfCategory: ui.whatIf.cat, whatIfCut: ui.whatIf.cut }));
    }
  };

  document.addEventListener("click", e => {
    const el = e.target.closest("[data-action]");
    if (el && ACTIONS[el.dataset.action]) ACTIONS[el.dataset.action](el, e);
  });
  view.addEventListener("change", e => { const el = e.target.closest("[data-change]"); if (el && CHANGES[el.dataset.change]) CHANGES[el.dataset.change](el, e); });
  view.addEventListener("input", e => { const el = e.target.closest("[data-input]"); if (el && INPUTS[el.dataset.input]) INPUTS[el.dataset.input](el, e); });
  $("#monthPicker").addEventListener("change", e => { state.selectedMonth = e.target.value; ui.tx.month = null; save(); render(); });
  $("#fileInput").addEventListener("change", e => {
    const file = e.target.files[0]; if (!file) return;
    readFileAsText(file, text => handleStatement(text, file.name));
  });
  $("#jsonInput").addEventListener("change", e => {
    const file = e.target.files[0]; if (!file) return;
    readFileAsText(file, text => {
      const res = PW.store.importJson(text || "");
      if (res.error) { ui.settingsMsg = { kind: "bad", text: res.error }; go("settings"); return; }
      const apply = () => { state = res.state; save(); ui.settingsMsg = { kind: "good", text: `Imported ${state.transactions.length} transactions and your settings.` }; go("settings"); };
      if (hasData()) modal({ title: "Replace your current data?", body: "<p>Importing this file replaces the data saved in this browser now.</p>",
        buttons: [{ label: "Replace my data", cls: "primary", onClick: apply }, { label: "Cancel" }] });
      else apply();
    });
  });
  window.addEventListener("hashchange", render);

  // For the automated browser test only: lets it read the app state. It does not change anything.
  window.PW.app = { getState: () => state, catOf: t => catOf(t), handleStatement };
  render();
})();
