const { DataStore } = require('./models/DataStore');
const { Account, ACCOUNT_TYPES, INSTITUTIONS } = require('./models/Account');
const { Transaction, TRANSACTION_TYPES, CATEGORIES } = require('./models/Transaction');
const { Budget, BudgetCategory } = require('./models/Budget');
const { NetWorthSnapshot } = require('./models/NetWorthSnapshot');
const { RecurringTransaction, FREQUENCIES } = require('./models/RecurringTransaction');
const { Goal, GOAL_TYPES } = require('./models/Goal');
const { monthKey } = require('./utils/format');

function generateDemoData(store) {
  // ═══════════════════════════════════════════════════
  // CHASE ACCOUNTS
  // ═══════════════════════════════════════════════════
  const chaseChecking = new Account({
    name: 'Chase Total Checking',
    institution: INSTITUTIONS.CHASE,
    type: ACCOUNT_TYPES.CHECKING,
    balance: 8542.33,
  });

  const chaseSavings = new Account({
    name: 'Chase Savings',
    institution: INSTITUTIONS.CHASE,
    type: ACCOUNT_TYPES.SAVINGS,
    balance: 25000.00,
  });

  const chaseCard = new Account({
    name: 'Chase Sapphire Preferred',
    institution: INSTITUTIONS.CHASE,
    type: ACCOUNT_TYPES.CREDIT_CARD,
    balance: 2847.52,
    creditLimit: 15000,
    apr: 21.49,
  });

  // ═══════════════════════════════════════════════════
  // ROBINHOOD ACCOUNT
  // ═══════════════════════════════════════════════════
  const robinhood = new Account({
    name: 'Robinhood Brokerage',
    institution: INSTITUTIONS.ROBINHOOD,
    type: ACCOUNT_TYPES.BROKERAGE,
    balance: 47250.80,
    holdings: [
      { symbol: 'AAPL', shares: 50, avgCost: 145.00, currentPrice: 189.84, type: 'Stocks' },
      { symbol: 'MSFT', shares: 30, avgCost: 280.00, currentPrice: 415.50, type: 'Stocks' },
      { symbol: 'VOO', shares: 25, avgCost: 380.00, currentPrice: 502.37, type: 'ETF' },
      { symbol: 'NVDA', shares: 20, avgCost: 450.00, currentPrice: 875.28, type: 'Stocks' },
      { symbol: 'VTI', shares: 40, avgCost: 200.00, currentPrice: 268.45, type: 'ETF' },
      { symbol: 'AMZN', shares: 15, avgCost: 130.00, currentPrice: 185.07, type: 'Stocks' },
    ],
  });
  // Recalculate actual balance from holdings
  robinhood.balance = robinhood.holdings.reduce((sum, h) => sum + h.shares * h.currentPrice, 0);

  // ═══════════════════════════════════════════════════
  // VANGUARD ACCOUNTS
  // ═══════════════════════════════════════════════════
  const vanguard401k = new Account({
    name: 'Vanguard 401(k)',
    institution: INSTITUTIONS.VANGUARD,
    type: ACCOUNT_TYPES.RETIREMENT,
    balance: 185420.00,
    holdings: [
      { symbol: 'VFIAX', name: 'Vanguard 500 Index', shares: 250, avgCost: 350.00, currentPrice: 485.20, type: 'Index Fund' },
      { symbol: 'VBTLX', name: 'Vanguard Total Bond', shares: 400, avgCost: 10.50, currentPrice: 9.85, type: 'Bond Fund' },
      { symbol: 'VTIAX', name: 'Vanguard Intl Stock', shares: 300, avgCost: 28.00, currentPrice: 34.50, type: 'International' },
    ],
    notes: '401k',
  });
  vanguard401k.balance = vanguard401k.holdings.reduce((sum, h) => sum + h.shares * h.currentPrice, 0);

  const vanguardRoth = new Account({
    name: 'Vanguard Roth IRA',
    institution: INSTITUTIONS.VANGUARD,
    type: ACCOUNT_TYPES.RETIREMENT,
    balance: 42800.00,
    holdings: [
      { symbol: 'VTI', name: 'Vanguard Total Stock', shares: 100, avgCost: 195.00, currentPrice: 268.45, type: 'ETF' },
      { symbol: 'VXUS', name: 'Vanguard Intl ETF', shares: 150, avgCost: 52.00, currentPrice: 58.30, type: 'International' },
    ],
    notes: 'Roth IRA',
  });
  vanguardRoth.balance = vanguardRoth.holdings.reduce((sum, h) => sum + h.shares * h.currentPrice, 0);

  // ═══════════════════════════════════════════════════
  // AMEX ACCOUNT
  // ═══════════════════════════════════════════════════
  const amexGold = new Account({
    name: 'Amex Gold Card',
    institution: INSTITUTIONS.AMEX,
    type: ACCOUNT_TYPES.CREDIT_CARD,
    balance: 1523.67,
    creditLimit: 20000,
    apr: 22.99,
    notes: 'Rewards: 4x Dining, 4x Groceries',
  });

  // Add all accounts
  store.accounts = [chaseChecking, chaseSavings, chaseCard, robinhood, vanguard401k, vanguardRoth, amexGold];

  // ═══════════════════════════════════════════════════
  // TRANSACTIONS (3 months of data)
  // ═══════════════════════════════════════════════════
  const now = new Date();
  const currentMonth = monthKey(now);
  const lastMonth = monthKey(new Date(now.getFullYear(), now.getMonth() - 1, 1));
  const twoMonthsAgo = monthKey(new Date(now.getFullYear(), now.getMonth() - 2, 1));

  function txDate(month, day) {
    return `${month}-${String(day).padStart(2, '0')}`;
  }

  const transactions = [
    // ── CURRENT MONTH ──────────────────────
    // Income
    new Transaction({ date: txDate(currentMonth, 1), description: 'Salary Deposit', amount: 7500.00, type: 'income', category: 'Salary', accountId: chaseChecking.id }),
    new Transaction({ date: txDate(currentMonth, 15), description: 'Salary Deposit', amount: 7500.00, type: 'income', category: 'Salary', accountId: chaseChecking.id }),
    new Transaction({ date: txDate(currentMonth, 5), description: 'Freelance Project - Web Dev', amount: 2500.00, type: 'income', category: 'Freelance', accountId: chaseChecking.id }),
    new Transaction({ date: txDate(currentMonth, 10), description: 'AAPL Dividend', amount: 47.50, type: 'dividend', category: 'Dividends', accountId: robinhood.id }),

    // Housing & Utilities
    new Transaction({ date: txDate(currentMonth, 1), description: 'Rent Payment', amount: 2200.00, type: 'expense', category: 'Housing', accountId: chaseChecking.id }),
    new Transaction({ date: txDate(currentMonth, 5), description: 'Electric Bill', amount: 142.33, type: 'expense', category: 'Utilities', accountId: chaseChecking.id }),
    new Transaction({ date: txDate(currentMonth, 5), description: 'Internet - Comcast', amount: 79.99, type: 'expense', category: 'Utilities', accountId: chaseChecking.id }),
    new Transaction({ date: txDate(currentMonth, 6), description: 'Water Bill', amount: 45.00, type: 'expense', category: 'Utilities', accountId: chaseChecking.id }),

    // Groceries (Amex - 4x rewards)
    new Transaction({ date: txDate(currentMonth, 3), description: 'Whole Foods Market', amount: 127.84, type: 'expense', category: 'Groceries', accountId: amexGold.id }),
    new Transaction({ date: txDate(currentMonth, 7), description: 'Trader Joes', amount: 89.42, type: 'expense', category: 'Groceries', accountId: amexGold.id }),
    new Transaction({ date: txDate(currentMonth, 12), description: 'Costco', amount: 234.56, type: 'expense', category: 'Groceries', accountId: amexGold.id }),
    new Transaction({ date: txDate(currentMonth, 18), description: 'Whole Foods Market', amount: 98.33, type: 'expense', category: 'Groceries', accountId: amexGold.id }),

    // Dining (Amex - 4x rewards)
    new Transaction({ date: txDate(currentMonth, 2), description: 'Nobu Restaurant', amount: 185.00, type: 'expense', category: 'Dining Out', accountId: amexGold.id }),
    new Transaction({ date: txDate(currentMonth, 8), description: 'Chipotle', amount: 15.42, type: 'expense', category: 'Dining Out', accountId: amexGold.id }),
    new Transaction({ date: txDate(currentMonth, 11), description: 'Starbucks', amount: 6.75, type: 'expense', category: 'Dining Out', accountId: amexGold.id }),
    new Transaction({ date: txDate(currentMonth, 14), description: 'Italian Kitchen', amount: 78.90, type: 'expense', category: 'Dining Out', accountId: amexGold.id }),
    new Transaction({ date: txDate(currentMonth, 19), description: 'Uber Eats', amount: 42.33, type: 'expense', category: 'Dining Out', accountId: amexGold.id }),

    // Transportation
    new Transaction({ date: txDate(currentMonth, 4), description: 'Gas Station - Shell', amount: 55.20, type: 'expense', category: 'Gas', accountId: chaseCard.id }),
    new Transaction({ date: txDate(currentMonth, 12), description: 'Gas Station - Chevron', amount: 48.75, type: 'expense', category: 'Gas', accountId: chaseCard.id }),
    new Transaction({ date: txDate(currentMonth, 3), description: 'Metro Monthly Pass', amount: 85.00, type: 'expense', category: 'Transportation', accountId: chaseChecking.id }),

    // Insurance & Healthcare
    new Transaction({ date: txDate(currentMonth, 1), description: 'Health Insurance Premium', amount: 450.00, type: 'expense', category: 'Insurance', accountId: chaseChecking.id }),
    new Transaction({ date: txDate(currentMonth, 1), description: 'Car Insurance - GEICO', amount: 125.00, type: 'expense', category: 'Insurance', accountId: chaseChecking.id }),
    new Transaction({ date: txDate(currentMonth, 9), description: 'CVS Pharmacy', amount: 32.50, type: 'expense', category: 'Healthcare', accountId: chaseCard.id }),

    // Entertainment & Subscriptions
    new Transaction({ date: txDate(currentMonth, 1), description: 'Netflix', amount: 15.99, type: 'expense', category: 'Subscriptions', accountId: chaseCard.id }),
    new Transaction({ date: txDate(currentMonth, 1), description: 'Spotify Premium', amount: 10.99, type: 'expense', category: 'Subscriptions', accountId: chaseCard.id }),
    new Transaction({ date: txDate(currentMonth, 1), description: 'ChatGPT Plus', amount: 20.00, type: 'expense', category: 'Subscriptions', accountId: chaseCard.id }),
    new Transaction({ date: txDate(currentMonth, 1), description: 'Gym Membership', amount: 49.99, type: 'expense', category: 'Subscriptions', accountId: chaseChecking.id }),
    new Transaction({ date: txDate(currentMonth, 13), description: 'Movie Tickets', amount: 32.00, type: 'expense', category: 'Entertainment', accountId: chaseCard.id }),
    new Transaction({ date: txDate(currentMonth, 17), description: 'Concert Tickets', amount: 150.00, type: 'expense', category: 'Entertainment', accountId: chaseCard.id }),

    // Shopping
    new Transaction({ date: txDate(currentMonth, 6), description: 'Amazon - Electronics', amount: 89.99, type: 'expense', category: 'Shopping', accountId: amexGold.id }),
    new Transaction({ date: txDate(currentMonth, 10), description: 'Target', amount: 67.43, type: 'expense', category: 'Shopping', accountId: chaseCard.id }),
    new Transaction({ date: txDate(currentMonth, 16), description: 'Nike Online', amount: 145.00, type: 'expense', category: 'Shopping', accountId: amexGold.id }),

    // Investments
    new Transaction({ date: txDate(currentMonth, 2), description: '401k Contribution', amount: 1625.00, type: 'transfer', category: 'Investment', accountId: chaseChecking.id, toAccountId: vanguard401k.id }),
    new Transaction({ date: txDate(currentMonth, 16), description: '401k Contribution', amount: 1625.00, type: 'transfer', category: 'Investment', accountId: chaseChecking.id, toAccountId: vanguard401k.id }),
    new Transaction({ date: txDate(currentMonth, 5), description: 'Roth IRA Contribution', amount: 500.00, type: 'transfer', category: 'Investment', accountId: chaseChecking.id, toAccountId: vanguardRoth.id }),

    // Credit card payments
    new Transaction({ date: txDate(currentMonth, 15), description: 'Chase Sapphire Payment', amount: 2000.00, type: 'payment', category: 'Credit Card Payment', accountId: chaseChecking.id, toAccountId: chaseCard.id }),

    // ── LAST MONTH ──────────────────────
    new Transaction({ date: txDate(lastMonth, 1), description: 'Salary Deposit', amount: 7500.00, type: 'income', category: 'Salary', accountId: chaseChecking.id }),
    new Transaction({ date: txDate(lastMonth, 15), description: 'Salary Deposit', amount: 7500.00, type: 'income', category: 'Salary', accountId: chaseChecking.id }),
    new Transaction({ date: txDate(lastMonth, 1), description: 'Rent Payment', amount: 2200.00, type: 'expense', category: 'Housing', accountId: chaseChecking.id }),
    new Transaction({ date: txDate(lastMonth, 3), description: 'Whole Foods Market', amount: 156.22, type: 'expense', category: 'Groceries', accountId: amexGold.id }),
    new Transaction({ date: txDate(lastMonth, 8), description: 'Trader Joes', amount: 112.50, type: 'expense', category: 'Groceries', accountId: amexGold.id }),
    new Transaction({ date: txDate(lastMonth, 15), description: 'Costco', amount: 198.75, type: 'expense', category: 'Groceries', accountId: amexGold.id }),
    new Transaction({ date: txDate(lastMonth, 5), description: 'Electric Bill', amount: 128.45, type: 'expense', category: 'Utilities', accountId: chaseChecking.id }),
    new Transaction({ date: txDate(lastMonth, 5), description: 'Internet', amount: 79.99, type: 'expense', category: 'Utilities', accountId: chaseChecking.id }),
    new Transaction({ date: txDate(lastMonth, 7), description: 'Sushi Restaurant', amount: 92.00, type: 'expense', category: 'Dining Out', accountId: amexGold.id }),
    new Transaction({ date: txDate(lastMonth, 12), description: 'Uber Eats', amount: 38.50, type: 'expense', category: 'Dining Out', accountId: amexGold.id }),
    new Transaction({ date: txDate(lastMonth, 4), description: 'Gas Station', amount: 52.00, type: 'expense', category: 'Gas', accountId: chaseCard.id }),
    new Transaction({ date: txDate(lastMonth, 1), description: 'Health Insurance', amount: 450.00, type: 'expense', category: 'Insurance', accountId: chaseChecking.id }),
    new Transaction({ date: txDate(lastMonth, 1), description: 'Car Insurance', amount: 125.00, type: 'expense', category: 'Insurance', accountId: chaseChecking.id }),
    new Transaction({ date: txDate(lastMonth, 1), description: 'Netflix', amount: 15.99, type: 'expense', category: 'Subscriptions', accountId: chaseCard.id }),
    new Transaction({ date: txDate(lastMonth, 1), description: 'Spotify', amount: 10.99, type: 'expense', category: 'Subscriptions', accountId: chaseCard.id }),
    new Transaction({ date: txDate(lastMonth, 9), description: 'Amazon', amount: 156.00, type: 'expense', category: 'Shopping', accountId: amexGold.id }),
    new Transaction({ date: txDate(lastMonth, 20), description: 'Weekend Trip Airbnb', amount: 420.00, type: 'expense', category: 'Travel', accountId: chaseCard.id }),

    // ── TWO MONTHS AGO ──────────────────────
    new Transaction({ date: txDate(twoMonthsAgo, 1), description: 'Salary Deposit', amount: 7500.00, type: 'income', category: 'Salary', accountId: chaseChecking.id }),
    new Transaction({ date: txDate(twoMonthsAgo, 15), description: 'Salary Deposit', amount: 7500.00, type: 'income', category: 'Salary', accountId: chaseChecking.id }),
    new Transaction({ date: txDate(twoMonthsAgo, 1), description: 'Rent Payment', amount: 2200.00, type: 'expense', category: 'Housing', accountId: chaseChecking.id }),
    new Transaction({ date: txDate(twoMonthsAgo, 5), description: 'Groceries', amount: 445.00, type: 'expense', category: 'Groceries', accountId: amexGold.id }),
    new Transaction({ date: txDate(twoMonthsAgo, 6), description: 'Utilities', amount: 255.00, type: 'expense', category: 'Utilities', accountId: chaseChecking.id }),
    new Transaction({ date: txDate(twoMonthsAgo, 8), description: 'Dining Out', amount: 210.00, type: 'expense', category: 'Dining Out', accountId: amexGold.id }),
    new Transaction({ date: txDate(twoMonthsAgo, 1), description: 'Insurance', amount: 575.00, type: 'expense', category: 'Insurance', accountId: chaseChecking.id }),
    new Transaction({ date: txDate(twoMonthsAgo, 1), description: 'Subscriptions', amount: 96.97, type: 'expense', category: 'Subscriptions', accountId: chaseCard.id }),
    new Transaction({ date: txDate(twoMonthsAgo, 15), description: 'Shopping', amount: 320.00, type: 'expense', category: 'Shopping', accountId: amexGold.id }),
    new Transaction({ date: txDate(twoMonthsAgo, 10), description: 'Gas', amount: 98.00, type: 'expense', category: 'Gas', accountId: chaseCard.id }),
  ];

  store.transactions = transactions;

  // ═══════════════════════════════════════════════════
  // BUDGET
  // ═══════════════════════════════════════════════════
  const budget = new Budget({
    month: currentMonth,
    totalMonthlyIncome: 17500,
    savingsGoalPercent: 25,
    categories: [
      new BudgetCategory({ category: 'Housing', monthlyLimit: 2200 }),
      new BudgetCategory({ category: 'Utilities', monthlyLimit: 300 }),
      new BudgetCategory({ category: 'Groceries', monthlyLimit: 600 }),
      new BudgetCategory({ category: 'Dining Out', monthlyLimit: 300 }),
      new BudgetCategory({ category: 'Gas', monthlyLimit: 120 }),
      new BudgetCategory({ category: 'Transportation', monthlyLimit: 100 }),
      new BudgetCategory({ category: 'Insurance', monthlyLimit: 600 }),
      new BudgetCategory({ category: 'Healthcare', monthlyLimit: 100 }),
      new BudgetCategory({ category: 'Entertainment', monthlyLimit: 200 }),
      new BudgetCategory({ category: 'Shopping', monthlyLimit: 300 }),
      new BudgetCategory({ category: 'Subscriptions', monthlyLimit: 100 }),
      new BudgetCategory({ category: 'Travel', monthlyLimit: 400 }),
      new BudgetCategory({ category: 'Investment', monthlyLimit: 3750 }),
    ],
  });

  store.budgets = [budget];

  // ═══════════════════════════════════════════════════
  // NET WORTH SNAPSHOTS (12 months history)
  // ═══════════════════════════════════════════════════
  const snapshots = [];
  const baseNetWorth = 240000;
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const growth = (12 - i) * 8500 + (Math.random() * 5000 - 2000);
    const nw = baseNetWorth + growth;
    const assets = nw + 4000 + Math.random() * 2000;
    const liabilities = assets - nw;

    snapshots.push(new NetWorthSnapshot({
      date: d.toISOString().split('T')[0],
      totalAssets: assets,
      totalLiabilities: liabilities,
      netWorth: nw,
      accounts: [],
    }));
  }

  store.snapshots = snapshots;

  // ═══════════════════════════════════════════════════
  // RECURRING TRANSACTIONS
  // ═══════════════════════════════════════════════════
  const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, 1).toISOString().split('T')[0];

  store.recurringTransactions = [
    new RecurringTransaction({
      description: 'Salary Deposit',
      amount: 7500.00,
      type: 'income',
      category: 'Salary',
      accountId: chaseChecking.id,
      frequency: FREQUENCIES.BIWEEKLY,
      startDate: threeMonthsAgo,
      dayOfMonth: 1,
      lastGenerated: txDate(currentMonth, 15),
    }),
    new RecurringTransaction({
      description: 'Rent Payment',
      amount: 2200.00,
      type: 'expense',
      category: 'Housing',
      accountId: chaseChecking.id,
      frequency: FREQUENCIES.MONTHLY,
      startDate: threeMonthsAgo,
      dayOfMonth: 1,
      lastGenerated: txDate(currentMonth, 1),
    }),
    new RecurringTransaction({
      description: 'Health Insurance',
      amount: 450.00,
      type: 'expense',
      category: 'Insurance',
      accountId: chaseChecking.id,
      frequency: FREQUENCIES.MONTHLY,
      startDate: threeMonthsAgo,
      dayOfMonth: 1,
      lastGenerated: txDate(currentMonth, 1),
    }),
    new RecurringTransaction({
      description: 'Car Insurance - GEICO',
      amount: 125.00,
      type: 'expense',
      category: 'Insurance',
      accountId: chaseChecking.id,
      frequency: FREQUENCIES.MONTHLY,
      startDate: threeMonthsAgo,
      dayOfMonth: 1,
      lastGenerated: txDate(currentMonth, 1),
    }),
    new RecurringTransaction({
      description: 'Netflix',
      amount: 15.99,
      type: 'expense',
      category: 'Subscriptions',
      accountId: chaseCard.id,
      frequency: FREQUENCIES.MONTHLY,
      startDate: threeMonthsAgo,
      dayOfMonth: 1,
      lastGenerated: txDate(currentMonth, 1),
    }),
    new RecurringTransaction({
      description: 'Spotify Premium',
      amount: 10.99,
      type: 'expense',
      category: 'Subscriptions',
      accountId: chaseCard.id,
      frequency: FREQUENCIES.MONTHLY,
      startDate: threeMonthsAgo,
      dayOfMonth: 1,
      lastGenerated: txDate(currentMonth, 1),
    }),
    new RecurringTransaction({
      description: 'Gym Membership',
      amount: 49.99,
      type: 'expense',
      category: 'Subscriptions',
      accountId: chaseChecking.id,
      frequency: FREQUENCIES.MONTHLY,
      startDate: threeMonthsAgo,
      dayOfMonth: 1,
      lastGenerated: txDate(currentMonth, 1),
    }),
    new RecurringTransaction({
      description: '401k Contribution',
      amount: 1625.00,
      type: 'transfer',
      category: 'Investment',
      accountId: chaseChecking.id,
      toAccountId: vanguard401k.id,
      frequency: FREQUENCIES.BIWEEKLY,
      startDate: threeMonthsAgo,
      dayOfMonth: 1,
      lastGenerated: txDate(currentMonth, 16),
    }),
    new RecurringTransaction({
      description: 'Internet - Comcast',
      amount: 79.99,
      type: 'expense',
      category: 'Utilities',
      accountId: chaseChecking.id,
      frequency: FREQUENCIES.MONTHLY,
      startDate: threeMonthsAgo,
      dayOfMonth: 5,
      lastGenerated: txDate(currentMonth, 5),
    }),
  ];

  // ═══════════════════════════════════════════════════
  // FINANCIAL GOALS
  // ═══════════════════════════════════════════════════
  store.goals = [
    new Goal({
      name: 'Emergency Fund (6 months)',
      type: GOAL_TYPES.EMERGENCY_FUND,
      targetAmount: 50000,
      currentAmount: 33542.33,
      deadline: '2026-12-31',
      createdDate: '2025-06-01',
      priority: 'high',
      notes: 'Target: 6 months of expenses in checking + savings',
    }),
    new Goal({
      name: 'Pay Off Chase Sapphire',
      type: GOAL_TYPES.DEBT_PAYOFF,
      targetAmount: 2847.52,
      currentAmount: 0,
      accountId: chaseCard.id,
      deadline: '2026-06-30',
      createdDate: '2026-01-01',
      priority: 'high',
    }),
    new Goal({
      name: 'Net Worth $500K',
      type: GOAL_TYPES.NET_WORTH,
      targetAmount: 500000,
      currentAmount: 0,
      deadline: '2027-12-31',
      createdDate: '2025-01-01',
      priority: 'medium',
    }),
    new Goal({
      name: 'Max Roth IRA 2026',
      type: GOAL_TYPES.INVESTMENT,
      targetAmount: 7000,
      currentAmount: 3500,
      accountId: vanguardRoth.id,
      deadline: '2026-12-31',
      createdDate: '2026-01-01',
      priority: 'medium',
      notes: '2026 Roth IRA contribution limit',
    }),
  ];

  store.save();

  return store;
}

module.exports = { generateDemoData };
