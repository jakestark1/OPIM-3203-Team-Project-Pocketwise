/* =====================================================================
   POCKETWISE SETTINGS: every rule, threshold and keyword list lives here.
   Change a number or add a keyword below; no other file needs to change.
   ===================================================================== */
window.PW = window.PW || {};

PW.CONFIG = {
  /* ---------- Income after tax ---------- */
  // How each pay frequency turns into a monthly amount.
  incomeFrequencies: {
    weekly:      { label: "Weekly",        perMonth: 52 / 12 },
    biweekly:    { label: "Every 2 weeks", perMonth: 26 / 12 },
    semimonthly: { label: "Twice a month", perMonth: 2 },
    monthly:     { label: "Monthly",       perMonth: 1 },
    yearly:      { label: "Yearly",        perMonth: 1 / 12 }
  },
  maxExtraIncomeSources: 3,      // "Add another income source" (up to 3 more)
  incomeMismatchThreshold: 0.10, // warn when entered pay and statement deposits differ by more than 10%

  /* ---------- Budget colors ---------- */
  budgetYellowAt: 0.80,          // yellow from 80% of the budget
  budgetRedAbove: 1.00,          // red above 100% of the budget
  budgetRoundTo: 5,              // suggested budgets are rounded to the nearest $5
  needsMinShareOfAverage: 0.90,  // "Recommended" never cuts a need below 90% of its average

  /* ---------- Planner ---------- */
  split: { needs: 0.50, wants: 0.30, savings: 0.20 }, // the 50/30/20 guideline
  emergencyFundMonths: { low: 3, high: 6 },           // emergency fund = 3 to 6 months of needs
  starterEmergencyFund: 1000,                         // step 1 of the priority checklist
  maxGoals: 3,

  /* ---------- Recurring charges and habits ---------- */
  recurring: {
    minCharges: 2,
    monthlyGapDays: [25, 35],     // monthly = charges 25 to 35 days apart
    yearlyGapDays: [350, 380],    // yearly = charges 350 to 380 days apart
    amountTolerance: 0.25,        // amounts within 25% of the median count as "similar"
    priceIncreaseMin: 0.50,       // flag "Price increase" when latest >= earliest + $0.50
    trialMaxAmount: 1.00,         // a $0.00 or $1.00 first charge can be a free trial
    // One charge from these merchants is shown as "Possible yearly"
    knownAnnual: ["amazon prime", "costco", "sams club", "aaa membership", "annual membership", "annual fee"],
    // Two or more subscriptions in the same group = "Overlap"
    overlapGroups: {
      "Streaming video": ["netflix", "hulu", "disney", "max", "hbo", "peacock", "paramount", "youtube tv", "prime video"],
      "Music":           ["spotify", "apple music", "pandora", "tidal", "youtube music"],
      "Cloud storage":   ["icloud", "google one", "google storage", "dropbox", "onedrive", "box"]
    }
  },
  habit: {
    minVisitsPerMonth: 4,         // 4+ visits in one month with varying amounts = habit question
    // Only spending in these groups can raise the habit question (bills and groceries are expected to repeat)
    askForWants: true,
    askForUncategorized: true
  },

  /* ---------- Merchant cleaning ---------- */
  // Removed from the START of a description before matching (repeated until none match).
  descriptionPrefixes: [
    "debit card purchase", "pos debit", "pos purchase", "pos", "ach debit", "ach credit", "ach",
    "checkcard", "check card", "purchase authorized on", "recurring payment", "sq *", "sq*", "tst *", "tst*"
  ],

  /* ---------- Categories and keywords ----------
     need: true = Need, false = Want, null = not part of spending (Income, Transfers).
     Matching: the description is cleaned into a "merchant key" (see categorize.js). A keyword
     matches when it appears at the start of a word in the key. If several keywords match,
     the LONGEST keyword wins (so "uber eats" beats "uber", "walmart grocery" beats "walmart").
     A rule the user makes (a correction) always beats these lists. */
  categories: [
    { name: "Housing", need: true, keywords: [
      "rent", "mortgage", "apartment", "apartments", "apts", "property mgmt", "property management", "hoa dues"] },
    { name: "Utilities", need: true, keywords: [
      "electric", "gas & electric", "power company", "energy", "eversource", "national grid", "duke energy", "pg&e",
      "water", "sewer", "internet", "xfinity", "comcast", "spectrum", "cox comm", "optimum", "fios", "frontier",
      "verizon", "at&t", "att", "t-mobile", "tmobile", "sprint", "cricket", "mint mobile", "wireless", "phone bill"] },
    { name: "Groceries", need: true, keywords: [
      "grocery", "groceries", "supermarket", "market basket", "stop & shop", "trader joe", "whole foods", "kroger",
      "safeway", "aldi", "publix", "wegmans", "price chopper", "shoprite", "big y", "food lion", "giant food",
      "h-e-b", "heb", "costco", "sams club", "walmart grocery", "instacart", "fresh market", "sprouts", "lidl", "hannaford"] },
    { name: "Transportation", need: true, keywords: [
      "shell", "sunoco", "exxon", "mobil", "chevron", "bp", "citgo", "gulf oil", "speedway", "wawa", "gas station",
      "fuel", "uber", "lyft", "transit", "metro", "parking", "parkmobile", "toll", "e-zpass", "ezpass",
      "greyhound", "taxi", "car wash", "jiffy lube", "auto repair"] },
    { name: "Insurance", need: true, keywords: [
      "insurance", "geico", "progressive", "state farm", "allstate", "liberty mutual", "renters insurance",
      "auto insurance", "health insurance", "blue cross", "aetna", "cigna"] },
    { name: "Health", need: true, keywords: [
      "pharmacy", "cvs", "walgreens", "rite aid", "doctor", "medical", "clinic", "hospital", "dental", "dentist",
      "urgent care", "optometrist", "vision", "labcorp", "quest diagnostics", "copay"] },
    { name: "Debt payments", need: true, keywords: [
      "loan", "student loan", "nelnet", "navient", "great lakes", "mohela", "car payment", "auto loan", "loan pmt"] },
    { name: "Education", need: true, keywords: [
      "tuition", "university", "college", "bookstore", "textbook", "chegg", "course", "udemy", "school"] },
    { name: "Dining & coffee", need: false, keywords: [
      "restaurant", "cafe", "coffee", "espresso", "java", "starbucks", "dunkin", "peets", "tim hortons",
      "chipotle", "mcdonald", "burger", "wendy", "taco bell", "chick-fil-a", "chick fil a", "subway", "panera",
      "pizza", "domino", "papa john", "olive garden", "applebee", "chili", "panda express", "five guys",
      "sushi", "thai", "grill", "kitchen", "diner", "bakery", "bagel", "tavern",
      "doordash", "grubhub", "uber eats", "postmates", "caviar"] },
    { name: "Shopping", need: false, keywords: [
      "amazon", "amzn", "target", "walmart", "wal-mart", "best buy", "home depot", "lowes", "ikea", "kohls",
      "macys", "tj maxx", "tjmaxx", "marshalls", "old navy", "gap", "h&m", "nike", "adidas", "etsy", "ebay",
      "apple store", "bed bath", "wayfair", "ulta", "dollar tree", "dollar general", "clothing", "electronics"] },
    { name: "Entertainment", need: false, keywords: [
      "netflix", "hulu", "disney", "spotify", "apple music", "hbo", "max", "peacock", "paramount", "pandora",
      "steam", "playstation", "xbox", "nintendo", "games", "movie", "cinema", "theatre", "theater", "amc",
      "regal", "fandango", "ticketmaster", "stubhub", "live nation", "concert", "bowling", "museum"] },
    { name: "Subscriptions & software", need: false, keywords: [
      "icloud", "google one", "google storage", "dropbox", "adobe", "microsoft", "office 365", "openai", "chatgpt",
      "notion", "canva", "zoom", "audible", "amazon prime", "prime membership", "patreon", "duolingo", "membership fee"] },
    { name: "Personal care & fitness", need: false, keywords: [
      "planet fitness", "gym", "fitness", "ymca", "crossfit", "yoga", "peloton", "salon", "barber", "hair",
      "nails", "day spa", "cosmetics"] },
    { name: "Travel", need: false, keywords: [
      "airline", "airlines", "air lines", "delta", "united airlines", "american airlines", "southwest", "jetblue",
      "spirit airl", "hotel", "marriott", "hilton", "hyatt", "airbnb", "expedia", "booking com", "vrbo", "hertz", "avis"] },
    { name: "Income", need: null, keywords: [
      "payroll", "direct deposit", "dir dep", "salary", "paycheck", "wages"] },
    { name: "Transfers", need: null, keywords: [
      "venmo", "zelle", "paypal", "cash app", "transfer", "xfer", "to savings", "from savings",
      "credit card payment", "card payment", "autopay pymt", "payment thank you"] },
    { name: "Uncategorized", need: null, keywords: [] }
  ],

  /* ---------- Storage ---------- */
  storageKey: "pocketwise.v1"
};

/* Handy lists built from the settings above (do not edit) */
PW.CONFIG.categoryNames = PW.CONFIG.categories.map(c => c.name);
PW.CONFIG.notSpending = ["Income", "Transfers"];           // excluded from spending totals
PW.CONFIG.spendingCategories = PW.CONFIG.categoryNames.filter(n => !PW.CONFIG.notSpending.includes(n));
PW.CONFIG.needOf = Object.fromEntries(PW.CONFIG.categories.map(c => [c.name, c.need]));
