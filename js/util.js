/* Small helpers used everywhere: money and date formatting, safe HTML. */
window.PW = window.PW || {};

PW.util = (function () {
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August",
    "September", "October", "November", "December"];
  const DAY_MS = 24 * 60 * 60 * 1000;

  /* Round to cents so 0.1 + 0.2 style errors never show up in totals. */
  function cents(n) { return Math.round((n + Number.EPSILON) * 100) / 100; }

  /* $1,234.56 (negative numbers get a minus sign in front: -$12.50) */
  function money(n) {
    const v = cents(Number(n) || 0);
    const s = Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return (v < 0 ? "-$" : "$") + s;
  }
  /* $1,235 (whole dollars, for budgets and big headline numbers) */
  function money0(n) {
    const v = Math.round(Number(n) || 0);
    return (v < 0 ? "-$" : "$") + Math.abs(v).toLocaleString("en-US");
  }
  function pct(n) { return isFinite(n) ? Math.round(n * 100) + "%" : "-"; }

  /* Dates are stored as "YYYY-MM-DD" text, so there are no time-zone surprises. */
  function isoFromParts(y, m, d) {
    const dt = new Date(Date.UTC(y, m - 1, d));
    if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null; // e.g. Feb 31
    return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }
  /* Accepts 2026-08-03 and 08/03/2026 (also 8/3/2026). Returns "2026-08-03" or null. */
  function parseDate(s) {
    s = String(s || "").trim();
    let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
    if (m) return isoFromParts(+m[1], +m[2], +m[3]);
    m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
    if (m) return isoFromParts(+m[3], +m[1], +m[2]);
    return null;
  }
  function dayNumber(iso) { // days since 1970, for "days between" math
    const [y, m, d] = iso.split("-").map(Number);
    return Math.round(Date.UTC(y, m - 1, d) / DAY_MS);
  }
  function daysBetween(a, b) { return dayNumber(b) - dayNumber(a); }
  function addDays(iso, n) {
    const dt = new Date((dayNumber(iso) + n) * DAY_MS);
    return dt.toISOString().slice(0, 10);
  }
  /* Same day next month (clamped: Jan 31 + 1 month = Feb 28). */
  function addMonths(iso, n) {
    let [y, m, d] = iso.split("-").map(Number);
    m += n;
    y += Math.floor((m - 1) / 12);
    m = ((m - 1) % 12 + 12) % 12 + 1;
    const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
    return isoFromParts(y, m, Math.min(d, last));
  }
  /* Oct 3, 2026 */
  function fmtDate(iso) {
    if (!iso) return "";
    const [y, m, d] = iso.split("-").map(Number);
    return `${MONTHS[m - 1]} ${d}, ${y}`;
  }
  function monthKey(iso) { return iso.slice(0, 7); }       // "2026-10"
  function monthLabel(key) {                                  // "October 2026"
    const [y, m] = key.split("-").map(Number);
    return `${MONTHS_LONG[m - 1]} ${y}`;
  }
  function monthName(key) { return MONTHS_LONG[Number(key.slice(5, 7)) - 1]; } // "October"
  function prevMonthKey(key) {
    let [y, m] = key.split("-").map(Number);
    m -= 1; if (m === 0) { m = 12; y -= 1; }
    return `${y}-${String(m).padStart(2, "0")}`;
  }
  function todayIso() {
    const t = new Date();
    return isoFromParts(t.getFullYear(), t.getMonth() + 1, t.getDate());
  }

  /* Escape text before putting it into HTML (bank descriptions are user data). */
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, c =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  function median(nums) {
    if (!nums.length) return 0;
    const s = [...nums].sort((a, b) => a - b);
    const mid = Math.floor(s.length / 2);
    return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
  }
  function sum(nums) { return cents(nums.reduce((t, n) => t + n, 0)); }
  function roundTo(n, step) { return Math.round(n / step) * step; }
  function titleCase(s) { return s.replace(/\b[a-z]/g, c => c.toUpperCase()); }

  return { cents, money, money0, pct, parseDate, dayNumber, daysBetween, addDays, addMonths, fmtDate,
    monthKey, monthLabel, monthName, prevMonthKey, todayIso, esc, median, sum, roundTo, titleCase, DAY_MS };
})();
