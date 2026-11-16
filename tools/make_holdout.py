"""
Writes the HOLDOUT statement: a made-up Bank of America-style checking export
for a different fictional person (Sep-Oct 2026, New York City).

Why it exists: the categorization rules must also be measured on a statement
they were NOT tuned on. This file was written and committed to git BEFORE the
category keyword lists in js/config.js were written, and the keyword lists are
not to be edited to fix misses found on this file. Its accuracy number is the
honest one to report.

The "true category" column is our best human judgement using the category
descriptions in README.md. Some rows are realistic
traps on purpose (rent paid by Zelle, bank interest, an ATM withdrawal).

Run:  python tools/make_holdout.py
Output: tests/holdout/holdout-boa.csv and tests/holdout/holdout-answer-key.csv
"""
import csv
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, "tests", "holdout")

# (date MM/DD/YYYY, description as a bank would print it, amount, true category)
ROWS = [
    ("09/01/2026", "ZELLE PAYMENT TO LANDLORD CONF# K2J1QX", -1400.00, "Housing"),
    ("09/01/2026", "CON ED OF NY DES:INTELL CK ID:5521", -84.12, "Utilities"),
    ("09/02/2026", "TRADER JOE S #542 QPS NEW YORK NY", -46.88, "Groceries"),
    ("09/02/2026", "MTA*NYCT PAYGO NEW YORK NY", -2.90, "Transportation"),
    ("09/03/2026", "STARBUCKS STORE 11823 NEW YORK NY", -6.45, "Dining & coffee"),
    ("09/03/2026", "PEARSON EDUCATION INC", -79.99, "Education"),
    ("09/04/2026", "SPECTRUM DES:CABLE ID:88120", -69.99, "Utilities"),
    ("09/05/2026", "WHOLEFDS MKT 10245", -72.13, "Groceries"),
    ("09/05/2026", "SWEETGREEN NOMAD", -15.62, "Dining & coffee"),
    ("09/06/2026", "LYFT *RIDE SAT 4PM", -18.40, "Transportation"),
    ("09/07/2026", "NETFLIX.COM", -17.99, "Entertainment"),
    ("09/08/2026", "T-MOBILE DES:PCS SVC", -55.00, "Utilities"),
    ("09/08/2026", "CVS/PHARMACY #10451", -14.29, "Health"),
    ("09/09/2026", "AMAZON MKTPLACE PMTS AMZN.COM/BILL", -32.47, "Shopping"),
    ("09/09/2026", "APPLE.COM/BILL", -0.99, "Subscriptions & software"),
    ("09/10/2026", "LEMONADE INSURANCE CO", -12.75, "Insurance"),
    ("09/10/2026", "GOOGLE *YouTubePremium", -13.99, "Entertainment"),
    ("09/11/2026", "JOE'S PIZZA BROADWAY", -8.50, "Dining & coffee"),
    ("09/12/2026", "BLINK FITNESS 0042", -24.99, "Personal care & fitness"),
    ("09/12/2026", "MTA*NYCT PAYGO NEW YORK NY", -2.90, "Transportation"),
    ("09/13/2026", "UBER   *TRIP HELP.UBER.COM", -23.10, "Transportation"),
    ("09/14/2026", "SEAMLESS*DIG INN", -21.35, "Dining & coffee"),
    ("09/15/2026", "BLUEHARBOR MEDIA DES:PAYROLL ID:4471 PPD", 1812.40, "Income"),
    ("09/15/2026", "TRADER JOE S #542 QPS NEW YORK NY", -51.20, "Groceries"),
    ("09/16/2026", "ONLINE BANKING TRANSFER TO SAVINGS CONF# 2KJ8", -300.00, "Transfers"),
    ("09/16/2026", "DUANE READE #14421", -9.87, "Health"),
    ("09/17/2026", "SALLIE MAE DES:LOAN PMT ID:2231", -210.00, "Debt payments"),
    ("09/18/2026", "CHIPOTLE 2841", -12.85, "Dining & coffee"),
    ("09/18/2026", "VENMO DES:PAYMENT ID:1022", -30.00, "Transfers"),
    ("09/19/2026", "UNIQLO USA 5TH AVE", -59.80, "Shopping"),
    ("09/20/2026", "AMC 34TH ST 14 #2217", -18.99, "Entertainment"),
    ("09/20/2026", "SHAKE SHACK #1121", -14.70, "Dining & coffee"),
    ("09/21/2026", "KEY FOOD #1882", -38.44, "Groceries"),
    ("09/22/2026", "DROPBOX*DBX PLUS", -11.99, "Subscriptions & software"),
    ("09/23/2026", "BLUE BOTTLE COFFEE", -5.75, "Dining & coffee"),
    ("09/24/2026", "CITI BIKE MEMBERSHIP", -19.95, "Transportation"),
    ("09/25/2026", "HOME DEPOT #6177", -27.43, "Shopping"),
    ("09/25/2026", "MTA*NYCT PAYGO NEW YORK NY", -2.90, "Transportation"),
    ("09/26/2026", "DELTA AIR LINES 0062391", -248.60, "Travel"),
    ("09/27/2026", "TRADER JOE S #542 QPS NEW YORK NY", -44.19, "Groceries"),
    ("09/27/2026", "SQ *ELLA'S BAKERY", -7.25, "Dining & coffee"),
    ("09/28/2026", "CITYMD URGENT CARE", -75.00, "Health"),
    ("09/29/2026", "BEST BUY 00012", -89.99, "Shopping"),
    ("09/30/2026", "BLUEHARBOR MEDIA DES:PAYROLL ID:4471 PPD", 1812.40, "Income"),
    ("09/30/2026", "ATM WITHDRAWAL 1180 BROADWAY", -60.00, "Uncategorized"),
    ("10/01/2026", "ZELLE PAYMENT TO LANDLORD CONF# P9W2ZA", -1400.00, "Housing"),
    ("10/01/2026", "CON ED OF NY DES:INTELL CK ID:5521", -91.40, "Utilities"),
    ("10/02/2026", "WHOLEFDS MKT 10245", -65.02, "Groceries"),
    ("10/02/2026", "STARBUCKS STORE 11823 NEW YORK NY", -5.95, "Dining & coffee"),
    ("10/03/2026", "MTA*NYCT PAYGO NEW YORK NY", -2.90, "Transportation"),
    ("10/04/2026", "SPECTRUM DES:CABLE ID:88120", -69.99, "Utilities"),
    ("10/04/2026", "HELLOFRESH", -69.99, "Groceries"),
    ("10/05/2026", "DOORDASH*SUSHI ZEN", -34.20, "Dining & coffee"),
    ("10/06/2026", "LYFT *RIDE MON 9AM", -15.60, "Transportation"),
    ("10/07/2026", "NETFLIX.COM", -17.99, "Entertainment"),
    ("10/08/2026", "T-MOBILE DES:PCS SVC", -55.00, "Utilities"),
    ("10/09/2026", "AMAZON MKTPLACE PMTS AMZN.COM/BILL", -18.76, "Shopping"),
    ("10/09/2026", "AMAZON MKTPLACE PMTS AMZN.COM/BILL", 32.47, "Shopping"),
    ("10/09/2026", "APPLE.COM/BILL", -0.99, "Subscriptions & software"),
    ("10/10/2026", "LEMONADE INSURANCE CO", -12.75, "Insurance"),
    ("10/10/2026", "GOOGLE *YouTubePremium", -13.99, "Entertainment"),
    ("10/11/2026", "TRADER JOE S #542 QPS NEW YORK NY", -49.33, "Groceries"),
    ("10/12/2026", "BLINK FITNESS 0042", -24.99, "Personal care & fitness"),
    ("10/12/2026", "GREAT CLIPS #4410", -22.00, "Personal care & fitness"),
    ("10/13/2026", "SWEETGREEN NOMAD", -16.10, "Dining & coffee"),
    ("10/14/2026", "COURSERA *PLUS", -59.00, "Education"),
    ("10/15/2026", "BLUEHARBOR MEDIA DES:PAYROLL ID:4471 PPD", 1812.40, "Income"),
    ("10/15/2026", "STEAMGAMES.COM 4259522985", -19.99, "Entertainment"),
    ("10/16/2026", "ONLINE BANKING TRANSFER TO SAVINGS CONF# 7HQ3", -300.00, "Transfers"),
    ("10/17/2026", "SALLIE MAE DES:LOAN PMT ID:2231", -210.00, "Debt payments"),
    ("10/17/2026", "PANERA BREAD #601", -11.48, "Dining & coffee"),
    ("10/18/2026", "MARRIOTT BOSTON COPLEY", -189.00, "Travel"),
    ("10/18/2026", "AMTRAK .COM 2410", -64.00, "Travel"),
    ("10/19/2026", "EXXONMOBIL 4410", -38.20, "Transportation"),
    ("10/20/2026", "KEY FOOD #1882", -41.17, "Groceries"),
    ("10/21/2026", "SPOTIFY USA", -11.99, "Entertainment"),
    ("10/22/2026", "VENMO DES:CASHOUT ID:1022", 45.00, "Transfers"),
    ("10/23/2026", "SEPHORA 0412", -38.00, "Personal care & fitness"),
    ("10/24/2026", "MICROSOFT*365 PERSONAL", -9.99, "Subscriptions & software"),
    ("10/24/2026", "BLUE BOTTLE COFFEE", -6.25, "Dining & coffee"),
    ("10/25/2026", "TARGET 00012245", -54.31, "Shopping"),
    ("10/26/2026", "WALGREENS #3321", -12.60, "Health"),
    ("10/27/2026", "UBER   *EATS", -27.80, "Dining & coffee"),
    ("10/28/2026", "ZARA USA 3381", -79.90, "Shopping"),
    ("10/29/2026", "TRADER JOE S #542 QPS NEW YORK NY", -47.92, "Groceries"),
    ("10/30/2026", "INTEREST EARNED", 0.42, "Income"),
    ("10/30/2026", "BLUEHARBOR MEDIA DES:PAYROLL ID:4471 PPD", 1812.40, "Income"),
    ("10/31/2026", "CHECK 1043", -150.00, "Uncategorized"),
]

BEGINNING_BALANCE = 2215.37


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    total_in = sum(a for _, _, a, _ in ROWS if a > 0)
    total_out = sum(a for _, _, a, _ in ROWS if a < 0)
    ending = BEGINNING_BALANCE + total_in + total_out

    path = os.path.join(OUT_DIR, "holdout-boa.csv")
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        # Real Bank of America exports start with a short summary block.
        w.writerow(["Description", "", "Summary Amt."])
        w.writerow(["Beginning balance as of 09/01/2026", "", f"{BEGINNING_BALANCE:,.2f}"])
        w.writerow(["Total credits", "", f"{total_in:,.2f}"])
        w.writerow(["Total debits", "", f"{total_out:,.2f}"])
        w.writerow(["Ending balance as of 10/31/2026", "", f"{ending:,.2f}"])
        w.writerow([])
        w.writerow(["Date", "Description", "Amount", "Running Bal."])
        w.writerow(["09/01/2026", "Beginning balance as of 09/01/2026", "", f"{BEGINNING_BALANCE:,.2f}"])
        bal = BEGINNING_BALANCE
        for d, desc, amt, _ in ROWS:
            bal += amt
            w.writerow([d, desc, f"{amt:,.2f}", f"{bal:,.2f}"])

    key_path = os.path.join(OUT_DIR, "holdout-answer-key.csv")
    with open(key_path, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["date", "description", "amount", "category"])
        for d, desc, amt, cat in ROWS:
            y = d[6:10] + "-" + d[0:2] + "-" + d[3:5]
            w.writerow([y, desc, f"{amt:.2f}", cat])

    print(f"wrote {len(ROWS)} rows to {path} and {key_path}")


if __name__ == "__main__":
    main()
