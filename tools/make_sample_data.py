"""
Makes the "Try with sample data" statement for Pocketwise.

Everything here is MADE UP: a fictional person, a fictional employer
("Northwind Logistics"), no real account numbers. The output follows the
Chase-style bank layout.

Run:    python tools/make_sample_data.py
Output: sample-data/sample-statement.csv   (Chase-style, MM/DD/YYYY, spending negative)
        sample-data/answer-key.csv         (the correct category for every row)
Then run tools/build_embeds.py so the browser copy (js/sample-data.js) is updated.

The random generator uses a fixed seed, so running it again gives the same file.
"""
import csv
import datetime as dt
import os
import random

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
rng = random.Random(3203)  # fixed seed = same sample every time

rows = []  # (date, description, bank_category, type, amount, true_category)


def add(date, desc, amount, true_cat, bank_cat="", typ="Sale"):
    rows.append((date, desc, bank_cat, typ, round(amount, 2), true_cat))


def d(m, day):
    return dt.date(2026, m, day)


# ---- Income: biweekly paycheck, Fridays. October has 3 paychecks. ----
for day in [d(8, 7), d(8, 21), d(9, 4), d(9, 18), d(10, 2), d(10, 16), d(10, 30)]:
    add(day, "NORTHWIND LOGISTICS PAYROLL PPD", 1450.00, "Income", "", "Payment")

# ---- Monthly bills and subscriptions ----
electric = {8: 71.38, 9: 84.12, 10: 63.05}
for m in (8, 9, 10):
    add(d(m, 1), "PINE RIDGE APTS RENT PMT WEB", -1150.00, "Housing", "Bills & Utilities", "Payment")
    add(d(m, 5), "EVERSOURCE ENERGY BILL PAY", -electric[m], "Utilities", "Bills & Utilities", "Payment")
    add(d(m, 5), "APPLE.COM/BILL ICLOUD STORAGE", -2.99, "Subscriptions & software", "Shopping")
    add(d(m, 9), "XFINITY INTERNET 8004", -65.00, "Utilities", "Bills & Utilities")
    add(d(m, 12), "VERIZON WIRELESS PAYMENT", -48.00, "Utilities", "Bills & Utilities", "Payment")
    add(d(m, 12), "NETFLIX.COM 8847", -15.49, "Entertainment", "Entertainment")
    add(d(m, 15), "GEICO AUTO INSURANCE", -112.40, "Insurance", "Bills & Utilities", "Payment")
    add(d(m, 15), "HULU 2290 HULU.COM/BILL", -9.99, "Entertainment", "Entertainment")
    add(d(m, 17), "PLANET FITNESS CLUB FEES", -24.99, "Personal care & fitness", "Health & Wellness")
    add(d(m, 20), "NELNET STUDENT LOAN PMT", -185.00, "Debt payments", "", "Payment")
    # Spotify price increase: $10.99 in August, $11.99 from September
    add(d(m, 3), "SPOTIFY USA 3321", -(10.99 if m == 8 else 11.99), "Entertainment", "Entertainment")
    # Free trial that turns paid: $0.00 in August, then $19.99
    add(d(m, 7), "ADOBE *CREATIVE CLOUD", -(0.00 if m == 8 else 19.99), "Subscriptions & software", "Shopping")

# Yearly charge: Amazon Prime annual membership in September
add(d(9, 14), "AMAZON PRIME*ANNUAL MEMBERSHIP", -139.00, "Subscriptions & software", "Shopping")

# ---- Groceries: weekly, varying amounts and stores ----
stores = ["STOP & SHOP 0612", "TRADER JOE S #523", "PRICE CHOPPER 118"]
day = d(8, 2)
i = 0
while day <= d(10, 31):
    add(day, stores[i % 3], -rng.uniform(45, 120), "Groceries", "Groceries")
    day += dt.timedelta(days=7)
    i += 1

# ---- Gas: every 1-2 weeks ----
day = d(8, 4)
i = 0
while day <= d(10, 31):
    desc = "DEBIT CARD PURCHASE SHELL OIL 57442" if i % 2 == 0 else "SUNOCO 0391 MANSFIELD CT"
    add(day, desc, -rng.uniform(32, 48), "Transportation", "Gas")
    day += dt.timedelta(days=rng.choice([8, 10, 12, 14]))
    i += 1

# ---- One pharmacy visit ----
add(d(9, 22), "CVS/PHARMACY #0921", -18.47, "Health", "Health & Wellness")

# ---- Coffee habit: 12-16 visits a month at the same coffee shop ----
for m, visits in ((8, 13), (9, 14), (10, 16)):
    last = 31 if m in (8, 10) else 30
    for dayn in sorted(rng.sample(range(1, last + 1), visits)):
        add(d(m, dayn), "SQ *JAVA HOUSE 4471", -rng.uniform(4.25, 7.80), "Dining & coffee", "Food & Drink")

# ---- Restaurants and delivery (October is heavier) ----
plan = {
    8: dict(chipotle=3, olive=1, doordash=2, ubereats=1, maple=1),
    9: dict(chipotle=3, olive=1, doordash=2, ubereats=1, maple=0),
    10: dict(chipotle=4, olive=1, doordash=3, ubereats=2, maple=1),
}
for m, p in plan.items():
    last = 31 if m in (8, 10) else 30
    for _ in range(p["chipotle"]):
        add(d(m, rng.randint(1, last)), "TST* CHIPOTLE 2210", -rng.uniform(10.5, 15.5), "Dining & coffee", "Food & Drink")
    for _ in range(p["olive"]):
        add(d(m, rng.randint(1, last)), "OLIVE GARDEN 0221", -rng.uniform(38, 62), "Dining & coffee", "Food & Drink")
    for _ in range(p["doordash"]):
        add(d(m, rng.randint(1, last)), "DOORDASH*THAI PALACE", -rng.uniform(24, 41), "Dining & coffee", "Food & Drink")
    for _ in range(p["ubereats"]):
        add(d(m, rng.randint(1, last)), "UBER EATS 8805 HELP.UBER.COM", -rng.uniform(19, 33), "Dining & coffee", "Food & Drink")
    # A local restaurant whose name has no food words: the rules cannot know it
    for _ in range(p["maple"]):
        add(d(m, rng.randint(1, last)), "SQ *MAPLE & VINE", -rng.uniform(28, 46), "Dining & coffee", "Food & Drink")

# ---- Rideshare ----
for m, day_ in ((8, 14), (9, 6), (9, 26), (10, 11)):
    add(d(m, day_), "UBER *TRIP 8812 HELP.UBER.COM", -rng.uniform(11, 26), "Transportation", "Travel")

# ---- Shopping ----
for m, days_ in ((8, (6, 19)), (9, (2, 16, 27)), (10, (8, 22))):
    for day_ in days_:
        # Order codes always mix letters and digits, like real Amazon descriptions
        code = "".join(rng.choice("ABCDEFGHJKLMNPQRSTUVWXYZ") for _ in range(4)) + str(rng.randint(10, 99))
        code = "".join(rng.sample(code, len(code)))
        add(d(m, day_), f"AMAZON.COM*{code}", -rng.uniform(14, 68), "Shopping", "Shopping")
add(d(10, 25), "AMAZON.COM*RETURN 4KD1QZ", 23.99, "Shopping", "Shopping", "Return")
for m, day_ in ((8, 23), (9, 20), (10, 18)):
    add(d(m, day_), "TARGET 00021", -rng.uniform(22, 75), "Shopping", "Shopping")
# Bought through PayPal: the rules treat PayPal as a transfer, but this is really shopping
add(d(9, 9), "PAYPAL *ETSY SELLER", -34.50, "Shopping", "Shopping")

# ---- One concert ----
add(d(10, 10), "TICKETMASTER*SUMMER TOUR", -89.50, "Entertainment", "Entertainment")

# ---- Transfers ----
add(d(8, 14), "VENMO PAYMENT 1180", -25.00, "Transfers", "", "Payment")
add(d(9, 11), "ZELLE PAYMENT TO ROOMMATE", -60.00, "Transfers", "", "Payment")
add(d(10, 4), "VENMO CASHOUT", 40.00, "Transfers", "", "Payment")
add(d(10, 30), "ONLINE TRANSFER TO SAVINGS", -500.00, "Transfers", "", "Payment")

# ---- Make sure no two rows are exact duplicates (same date, description, amount) ----
seen = set()
fixed = []
for r in rows:
    key = (r[0], r[1], r[4])
    while key in seen:
        r = (r[0], r[1], r[2], r[3], round(r[4] - 0.01, 2), r[5])
        key = (r[0], r[1], r[4])
    seen.add(key)
    fixed.append(r)
rows = sorted(fixed, key=lambda r: (r[0], r[1]))

os.makedirs(os.path.join(ROOT, "sample-data"), exist_ok=True)
with open(os.path.join(ROOT, "sample-data", "sample-statement.csv"), "w", newline="", encoding="utf-8") as f:
    w = csv.writer(f)
    w.writerow(["Transaction Date", "Post Date", "Description", "Category", "Type", "Amount"])
    for date, desc, bank_cat, typ, amt, _ in rows:
        post = date + dt.timedelta(days=0 if typ == "Payment" else rng.choice([1, 1, 2]))
        w.writerow([date.strftime("%m/%d/%Y"), post.strftime("%m/%d/%Y"), desc, bank_cat, typ, f"{amt:.2f}"])

with open(os.path.join(ROOT, "sample-data", "answer-key.csv"), "w", newline="", encoding="utf-8") as f:
    w = csv.writer(f)
    w.writerow(["date", "description", "amount", "category"])
    for date, desc, _, _, amt, cat in rows:
        w.writerow([date.isoformat(), desc, f"{amt:.2f}", cat])

print(f"wrote {len(rows)} sample transactions")
