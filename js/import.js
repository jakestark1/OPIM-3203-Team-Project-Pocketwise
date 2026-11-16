/* =====================================================================
   IMPORT: read a bank CSV, find its columns, turn every row into a
   transaction { date: "2026-08-03", description, amount }.
   amount < 0 means money OUT (spending), amount > 0 means money IN.
   ===================================================================== */
window.PW = window.PW || {};

PW.importer = (function () {
  const U = PW.util;

  /* Split CSV text into rows of cells. Handles quoted cells with commas,
     doubled quotes ("") and line breaks inside quotes. */
  function parseCsv(text) {
    text = String(text || "").replace(/^﻿/, ""); // drop the invisible "BOM" some programs add
    const rows = [];
    let row = [], cell = "", inQuotes = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (inQuotes) {
        if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
        else if (ch === '"') inQuotes = false;
        else cell += ch;
      } else if (ch === '"') inQuotes = true;
      else if (ch === ",") { row.push(cell.trim()); cell = ""; }
      else if (ch === "\n" || ch === "\r") {
        if (ch === "\r" && text[i + 1] === "\n") i++;
        row.push(cell.trim()); rows.push(row); row = []; cell = "";
      } else cell += ch;
    }
    if (cell !== "" || row.length) { row.push(cell.trim()); rows.push(row); }
    return rows;
  }

  /* "$1,234.56" -> 1234.56, "-12.50" -> -12.5, "(12.50)" -> -12.5, "" -> null */
  function parseAmount(s) {
    let t = String(s == null ? "" : s).trim();
    if (!t) return null;
    let neg = false;
    if (/^\(.*\)$/.test(t)) { neg = true; t = t.slice(1, -1); }
    t = t.replace(/[$,\s]/g, "");
    if (t.startsWith("-")) { neg = !neg; t = t.slice(1); }
    else if (t.startsWith("+")) t = t.slice(1);
    if (t.startsWith("$")) t = t.slice(1);
    if (!/^\d+(\.\d+)?$|^\.\d+$/.test(t)) return null;
    const v = parseFloat(t);
    return U.cents(neg ? -v : v);
  }

  /* Header names we understand (lower case). The first match in each list wins. */
  const HEADER_NAMES = {
    date: ["transaction date", "trans date", "date", "posting date", "post date", "posted date"],
    description: ["description", "payee", "merchant", "details", "transaction description", "name"],
    amount: ["amount", "transaction amount", "amount ($)"],
    debit: ["debit", "debits", "withdrawal", "withdrawals", "money out"],
    credit: ["credit", "credits", "deposit", "deposits", "money in"]
  };

  /* Find the header row (banks sometimes put a summary above it) and the columns. */
  function detectColumns(rows) {
    for (let r = 0; r < Math.min(rows.length, 25); r++) {
      const h = rows[r].map(c => c.toLowerCase().trim());
      const find = names => { for (const n of names) { const i = h.indexOf(n); if (i !== -1) return i; } return -1; };
      const cols = { date: find(HEADER_NAMES.date), description: find(HEADER_NAMES.description),
        amount: find(HEADER_NAMES.amount), debit: find(HEADER_NAMES.debit), credit: find(HEADER_NAMES.credit) };
      const hasMoney = cols.amount !== -1 || (cols.debit !== -1 && cols.credit !== -1);
      if (cols.date !== -1 && cols.description !== -1 && hasMoney) {
        if (cols.amount !== -1) { cols.debit = -1; cols.credit = -1; }
        return { headerIndex: r, headers: rows[r], columns: cols, layout: layoutName(h, cols) };
      }
    }
    return null;
  }

  function layoutName(h, cols) {
    const has = n => h.includes(n);
    if (has("card no.") && cols.debit !== -1) return "Capital One-style";
    if (has("transaction date") && has("post date") && has("type")) return "Chase-style";
    if (has("running bal.")) return "Bank of America-style";
    if (h.filter(x => x).length === 3 && has("date") && has("description") && has("amount")) return "Simple";
    return "Other layout (columns found by name)";
  }

  /* Is this text, or a binary file such as a PDF or Excel workbook? */
  function looksBinary(text) {
    const sample = String(text).slice(0, 2000);
    if (!sample) return false;
    let odd = 0;
    for (const ch of sample) {
      const c = ch.charCodeAt(0);
      if (c === 0 || c === 0xFFFD || (c < 32 && c !== 9 && c !== 10 && c !== 13)) odd++;
    }
    return sample.startsWith("%PDF") || sample.startsWith("PK") || odd / sample.length > 0.02;
  }

  /* Check a file before reading rows. Returns an error message, or null when it looks fine. */
  function checkFile(fileName, text) {
    const name = String(fileName || "").toLowerCase();
    if (/\.(xlsx|xls|numbers|ods)$/.test(name))
      return "This is a spreadsheet file, not a CSV. On your bank's website choose \"Download as CSV\", or in Excel use File > Save As > CSV.";
    if (/\.pdf$/.test(name) || String(text).startsWith("%PDF"))
      return "This is a PDF, not a CSV. Most banks offer \"Download transactions\" as CSV next to the PDF statement.";
    if (looksBinary(text)) return "This file is not a CSV text file. Please choose the .csv file you downloaded from your bank.";
    if (!String(text).trim()) return "This file is empty. Please choose a CSV file that contains your transactions.";
    return null;
  }

  /* Turn CSV rows into transactions using a column map {date, description, amount | debit+credit}.
     Bad rows are skipped and counted by reason. */
  function rowsToTransactions(rows, headerIndex, columns, sourceName) {
    const out = [];
    const skipped = { badDate: 0, badAmount: 0, noDescription: 0 };
    const examples = [];
    const single = columns.amount !== -1 && columns.amount != null;
    for (let r = headerIndex + 1; r < rows.length; r++) {
      const cells = rows[r];
      if (cells.every(c => c === "")) continue;          // blank line: not a transaction
      const lineNo = r + 1;
      const date = U.parseDate(cells[columns.date]);
      const description = String(cells[columns.description] || "").replace(/\s+/g, " ").trim();
      let amount = null;
      if (single) amount = parseAmount(cells[columns.amount]);
      else {
        const debit = parseAmount(cells[columns.debit]);
        const credit = parseAmount(cells[columns.credit]);
        if (debit !== null || credit !== null)
          amount = U.cents((credit !== null ? Math.abs(credit) : 0) - (debit !== null ? Math.abs(debit) : 0));
      }
      let reason = null;
      if (!date) { skipped.badDate++; reason = "date not readable"; }
      else if (amount === null) { skipped.badAmount++; reason = "amount missing or not a number"; }
      else if (!description) { skipped.noDescription++; reason = "description missing"; }
      if (reason) { if (examples.length < 5) examples.push(`line ${lineNo}: ${reason}`); continue; }
      out.push({ date, description, amount, source: sourceName });
    }

    // Sign convention: if most rows are positive, this bank shows spending as positive. Flip them.
    let signNote = "Money out is shown as negative in this file.";
    if (single && out.length) {
      const neg = out.filter(t => t.amount < 0).length, pos = out.filter(t => t.amount > 0).length;
      if (pos > neg) {
        out.forEach(t => { t.amount = U.cents(-t.amount); });
        signNote = "Money out is shown as positive in this file, so Pocketwise flipped the signs.";
      }
    }
    if (!single) signNote = "Debit and Credit columns: debits are money out, credits are money in.";
    const skippedTotal = skipped.badDate + skipped.badAmount + skipped.noDescription;
    return { transactions: out, skipped, skippedTotal, examples, signNote };
  }

  /* Main entry point. Returns either { error }, { needsMapping, rows, ... } or a finished result. */
  function readStatement(text, fileName, manualColumns) {
    const fileError = checkFile(fileName, text);
    if (fileError) return { error: fileError };
    const rows = parseCsv(text);
    let det;
    if (manualColumns) det = { headerIndex: 0, headers: rows[0], columns: manualColumns, layout: "Columns matched by you" };
    else det = detectColumns(rows);
    if (!det) {
      return { needsMapping: true, rows, headers: rows[0] || [],
        message: "Pocketwise could not find the date, description and amount columns in this file. " +
          "Pick them below, or check that you chose a bank statement CSV." };
    }
    const res = rowsToTransactions(rows, det.headerIndex, det.columns, fileName || "statement.csv");
    if (!res.transactions.length) {
      return { error: `No transactions could be read from this file (${res.skippedTotal} row(s) skipped: ` +
        (res.examples.join("; ") || "no data rows below the header") + ").", needsMapping: !!manualColumns };
    }
    const dates = res.transactions.map(t => t.date).sort();
    return Object.assign(res, { layout: det.layout, from: dates[0], to: dates[dates.length - 1], fileName });
  }

  /* Add new transactions to the existing ones, dropping exact duplicates
     (same date, description and amount) that are already saved. Two identical
     coffees on the same day inside ONE file are both kept. */
  function merge(existing, incoming) {
    const key = t => `${t.date}|${t.description}|${t.amount.toFixed(2)}`;
    const have = new Map();
    existing.forEach(t => have.set(key(t), (have.get(key(t)) || 0) + 1));
    const added = [];
    let duplicates = 0;
    for (const t of incoming) {
      const k = key(t), n = have.get(k) || 0;
      if (n > 0) { duplicates++; have.set(k, n - 1); } else added.push(t);
    }
    return { all: existing.concat(added), added, duplicates };
  }

  return { parseCsv, parseAmount, detectColumns, readStatement, rowsToTransactions, merge, checkFile, looksBinary };
})();
