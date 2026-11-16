# Pocketwise: Your personal money planner

Pocketwise reads the CSV file you download from your bank, sorts every transaction into a category,
shows where your money went, helps you set budgets, suggests how much to save (general education only),
and points out recurring charges. It runs entirely in your browser: **no bank login, no account, nothing is uploaded.**

## How to open it

1. Download this repository: green **Code** button > **Download ZIP**.
2. **Extract the ZIP first**: right-click it > **Extract All...** > **Extract**. (Opening `index.html` from inside the ZIP does not work, because the browser cannot see the `js` folder and `styles.css` next to it.)
3. In the extracted folder, double-click **`index.html`**. It opens in your browser (Chrome or Edge recommended). Nothing to install, no internet needed.
4. Click **Try with sample data** to explore with a made-up statement, or **Upload bank statement (CSV)** to use your own file.

## How to use it

1. **Upload or sample data**: Pocketwise reads the file and shows how many transactions it found.
2. **Income after tax**: enter your take-home pay and how often you are paid. Pocketwise turns it into a monthly amount and compares it with the paychecks in your statement.
3. **Dashboard**: spending by category, change from last month, top merchants, needs vs wants.
4. **Transactions**: search and sort; change any category with the menu and choose "apply to all" to fix that merchant everywhere.
5. **Budget**: suggested monthly budgets you can edit, with progress bars (green under 80%, yellow 80-100%, red over).
6. **Plan**: 50/30/20 guideline, emergency fund, savings goals and a what-if slider.
7. **Recurring**: subscriptions, price increases, free trials that turned paid, and "habit or subscription?" questions.
8. **Settings**: edit income, export or import your data, or delete all your data.

Use the **Month** menu at the top to switch months on every tab.

## Bank files it reads

| Layout | Columns |
|---|---|
| Simple | date, description, amount |
| Chase-style | Transaction Date, Post Date, Description, Category, Type, Amount |
| Bank of America-style | Date, Description, Amount, Running Bal. |
| Capital One-style | Transaction Date, Posted Date, Card No., Description, Category, Debit, Credit |

Dates can be `2026-08-03` or `08/03/2026`. For other layouts, Pocketwise asks you to pick the date, description and amount columns.
Uploading a second file adds to your data and skips exact duplicates.

## Categories

Housing, Utilities, Groceries, Transportation, Insurance, Health, Debt payments and Education (needs);
Dining & coffee, Shopping, Entertainment, Subscriptions & software, Personal care & fitness and Travel (wants);
Income and Transfers (not counted as spending); and Uncategorized for anything the keyword rules do not recognize.
Keywords and all thresholds are in `js/config.js`.

## Running the checks

Open **`tests/run-tests.html`** in Chrome or Edge. It runs the automated checks and shows pass/fail and categorization accuracy.

## Privacy

Your data is saved only in this browser on this computer (localStorage). Anyone using the same browser can see it;
use **Settings > Delete all my data** on a shared computer. All sample and test data in this repository is made up.
Pocketwise gives general educational guidance, not personal financial or investment advice.

## Project files

```
index.html, styles.css   the app
js/                      app code (config.js holds all keywords and settings)
sample-data/             made-up sample statement and its answer key
tests/                   run-tests.html and test files
tools/                   Python scripts that regenerate the sample data (optional)
```
