#!/usr/bin/env node

/**
 * Test suite for Budget & Net Worth Tracker
 * Validates all core functionality without external dependencies.
 */

const { DataStore } = require('./models/DataStore');
const { Account, ACCOUNT_TYPES, INSTITUTIONS } = require('./models/Account');
const { Transaction, TRANSACTION_TYPES, CATEGORIES } = require('./models/Transaction');
const { Budget, BudgetCategory } = require('./models/Budget');
const { NetWorthSnapshot } = require('./models/NetWorthSnapshot');
const { RobinhoodManager } = require('./accounts/RobinhoodManager');
const { ChaseManager } = require('./accounts/ChaseManager');
const { VanguardManager } = require('./accounts/VanguardManager');
const { AmexManager } = require('./accounts/AmexManager');
const { BudgetEngine } = require('./engines/BudgetEngine');
const { NetWorthEngine } = require('./engines/NetWorthEngine');
const { ReportEngine } = require('./engines/ReportEngine');
const { Dashboard } = require('./ui/Dashboard');
const { generateDemoData } = require('./demo');
const { currency, monthKey, percentage } = require('./utils/format');

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    passed++;
    console.log(`  \x1b[32m✓\x1b[0m ${message}`);
  } else {
    failed++;
    console.log(`  \x1b[31m✗\x1b[0m ${message}`);
  }
}

function section(name) {
  console.log(`\n\x1b[1m\x1b[36m── ${name} ──\x1b[0m`);
}

// ═══════════════════════════════════════════════════
// Use an in-memory store (bypass file I/O for tests)
// ═══════════════════════════════════════════════════
class TestDataStore extends DataStore {
  load() {} // no-op
  save() {} // no-op
}

const store = new TestDataStore();

// ── Models ─────────────────────────────────────────
section('Account Model');

const checking = new Account({
  name: 'Test Checking',
  institution: 'Chase',
  type: ACCOUNT_TYPES.CHECKING,
  balance: 5000,
});
assert(checking.isAsset() === true, 'Checking account is an asset');
assert(checking.isLiability() === false, 'Checking account is not a liability');
assert(checking.getNetValue() === 5000, 'Checking net value is balance');

const creditCard = new Account({
  name: 'Test CC',
  institution: 'Amex',
  type: ACCOUNT_TYPES.CREDIT_CARD,
  balance: 1000,
  creditLimit: 10000,
});
assert(creditCard.isLiability() === true, 'Credit card is a liability');
assert(creditCard.getNetValue() === -1000, 'Credit card net value is negative');

const brokerage = new Account({
  name: 'Test Brokerage',
  institution: 'Robinhood',
  type: ACCOUNT_TYPES.BROKERAGE,
  balance: 0,
  holdings: [
    { symbol: 'AAPL', shares: 10, avgCost: 150, currentPrice: 190 },
    { symbol: 'MSFT', shares: 5, avgCost: 300, currentPrice: 400 },
  ],
});
assert(brokerage.getNetValue() === 10 * 190 + 5 * 400, 'Brokerage value from holdings = 3900');

section('Transaction Model');

const incomeTx = new Transaction({
  description: 'Salary',
  amount: 5000,
  type: 'income',
  category: 'Salary',
  accountId: checking.id,
});
assert(incomeTx.isIncome() === true, 'Income transaction identified');
assert(incomeTx.isExpense() === false, 'Income is not expense');

const expenseTx = new Transaction({
  description: 'Groceries',
  amount: 100,
  type: 'expense',
  category: 'Groceries',
  accountId: checking.id,
});
assert(expenseTx.isExpense() === true, 'Expense transaction identified');

section('Budget Model');

const budget = new Budget({
  month: '2026-02',
  totalMonthlyIncome: 10000,
  savingsGoalPercent: 20,
  categories: [
    new BudgetCategory({ category: 'Housing', monthlyLimit: 2000 }),
    new BudgetCategory({ category: 'Groceries', monthlyLimit: 500 }),
    new BudgetCategory({ category: 'Dining Out', monthlyLimit: 300 }),
  ],
});
assert(budget.getTotalBudgeted() === 2800, 'Total budgeted = 2800');
assert(budget.getUnallocated() === 7200, 'Unallocated = 7200');

// ── Account Managers ───────────────────────────────
section('Chase Manager');

const chaseManager = new ChaseManager(store);
chaseManager.createCheckingAccount({ name: 'Chase Checking', balance: 8000 });
chaseManager.createSavingsAccount({ name: 'Chase Savings', balance: 20000 });
chaseManager.createCreditCardAccount({ name: 'Chase Sapphire', balance: 2500, creditLimit: 15000 });
assert(chaseManager.getAccounts().length === 3, 'Chase has 3 accounts');

const chaseSummary = chaseManager.getAccountSummary();
assert(chaseSummary.checking.totalBalance === 8000, 'Chase checking balance = 8000');
assert(chaseSummary.savings.totalBalance === 20000, 'Chase savings balance = 20000');
assert(chaseSummary.creditCards.totalBalance === 2500, 'Chase CC balance = 2500');

section('Robinhood Manager');

const rhManager = new RobinhoodManager(store);
const rhAccount = rhManager.createBrokerageAccount({ name: 'Robinhood', balance: 0 });
rhManager.addHolding(rhAccount.id, { symbol: 'AAPL', shares: 50, avgCost: 150, currentPrice: 190 });
rhManager.addHolding(rhAccount.id, { symbol: 'GOOGL', shares: 20, avgCost: 100, currentPrice: 175 });

const rhSummary = rhManager.getPortfolioSummary(rhAccount.id);
assert(rhSummary.totalValue === 50 * 190 + 20 * 175, 'Robinhood portfolio value correct');
assert(rhSummary.totalGain > 0, 'Robinhood portfolio shows gains');
assert(rhSummary.holdings.length === 2, 'Robinhood has 2 holdings');

section('Vanguard Manager');

const vgManager = new VanguardManager(store);
const vg401k = vgManager.createRetirementAccount({ name: 'Vanguard 401k', balance: 150000, accountSubtype: '401k' });
vgManager.updateHoldings(vg401k.id, [
  { symbol: 'VFIAX', shares: 200, avgCost: 400, currentPrice: 480, type: 'Index Fund' },
  { symbol: 'VBTLX', shares: 500, avgCost: 10, currentPrice: 9.8, type: 'Bond Fund' },
]);
const vgSummary = vgManager.getPortfolioSummary(vg401k.id);
assert(vgSummary !== null, 'Vanguard portfolio summary exists');
assert(vgSummary.accountSubtype === '401k', 'Vanguard account subtype is 401k');

section('Amex Manager');

const amexManager = new AmexManager(store);
amexManager.createCreditCardAccount({ name: 'Amex Gold', balance: 1500, creditLimit: 20000 });
const amexUtil = amexManager.getCreditUtilization();
assert(amexUtil.totalBalance === 1500, 'Amex balance = 1500');
assert(amexUtil.utilization === 7.5, 'Amex utilization = 7.5%');

// ── Engines ────────────────────────────────────────
section('Net Worth Engine');

const nwEngine = new NetWorthEngine(store);
const currentNW = nwEngine.calculateCurrentNetWorth();
assert(currentNW.totalAssets > 0, 'Total assets > 0');
assert(currentNW.totalLiabilities > 0, 'Total liabilities > 0 (have credit cards)');
assert(typeof currentNW.netWorth === 'number', 'Net worth is a number');
assert(currentNW.accounts.length === store.accounts.length, 'All accounts in net worth calc');

const snapshot = nwEngine.takeSnapshot();
assert(snapshot.netWorth === currentNW.netWorth, 'Snapshot matches current net worth');

const byInst = nwEngine.getBreakdownByInstitution();
assert(byInst.length > 0, 'Institution breakdown has entries');

const byType = nwEngine.getBreakdownByType();
assert(byType.length > 0, 'Type breakdown has entries');

section('Budget Engine');

const budgetEngine = new BudgetEngine(store);
const month = monthKey(new Date());
budgetEngine.createBudget({
  month,
  totalMonthlyIncome: 15000,
  categories: [
    { category: 'Housing', monthlyLimit: 2200 },
    { category: 'Groceries', monthlyLimit: 500 },
  ],
});

// Add some transactions for the current month
const chaseAccounts = chaseManager.getAccounts();
const checkingId = chaseAccounts.find(a => a.type === 'checking').id;

store.addTransaction(new Transaction({
  date: `${month}-05`,
  description: 'Test Rent',
  amount: 2200,
  type: 'expense',
  category: 'Housing',
  accountId: checkingId,
}));
store.addTransaction(new Transaction({
  date: `${month}-06`,
  description: 'Test Groceries',
  amount: 150,
  type: 'expense',
  category: 'Groceries',
  accountId: checkingId,
}));
store.addTransaction(new Transaction({
  date: `${month}-01`,
  description: 'Test Salary',
  amount: 7500,
  type: 'income',
  category: 'Salary',
  accountId: checkingId,
}));

const budgetReport = budgetEngine.getMonthlyReport(month);
assert(budgetReport !== null, 'Budget report generated');
assert(budgetReport.totalIncome === 7500, 'Budget report income = 7500');
assert(budgetReport.totalExpenses === 2350, 'Budget report expenses = 2350');
assert(budgetReport.categoryReports.length === 2, 'Budget has 2 category reports');

const housingReport = budgetReport.categoryReports.find(c => c.category === 'Housing');
assert(housingReport.spent === 2200, 'Housing spent = 2200');
assert(housingReport.percentUsed === 100, 'Housing is 100% used');

const groceryReport = budgetReport.categoryReports.find(c => c.category === 'Groceries');
assert(groceryReport.spent === 150, 'Grocery spent = 150');
assert(groceryReport.remaining === 350, 'Grocery remaining = 350');

const topExpenses = budgetEngine.getTopExpenses(month, 5);
assert(topExpenses.length > 0, 'Top expenses found');
assert(topExpenses[0].amount >= topExpenses[topExpenses.length - 1].amount, 'Top expenses sorted descending');

section('Report Engine');

const reportEngine = new ReportEngine(store, budgetEngine, nwEngine);
const monthlyReport = reportEngine.generateMonthlyReport(month);
assert(monthlyReport !== null, 'Monthly report generated');
assert(monthlyReport.budget !== null, 'Monthly report has budget data');

const yearlyReport = reportEngine.generateYearlyReport(new Date().getFullYear().toString());
assert(yearlyReport !== null, 'Yearly report generated');
assert(yearlyReport.months.length === 12, 'Yearly report has 12 months');

const spendingReport = reportEngine.generateSpendingReport(`${month}-01`, `${month}-28`);
assert(spendingReport.total > 0, 'Spending report has total');
assert(spendingReport.byCategory.length > 0, 'Spending report has categories');

const csv = reportEngine.exportToCSV(store.getTransactions());
assert(csv.includes('Date,Description,Amount'), 'CSV has headers');
assert(csv.split('\n').length > 2, 'CSV has data rows');

const importedTxs = reportEngine.importFromCSV('Date,Description,Amount,Type,Category\n2026-01-15,Test Import,50.00,expense,Groceries');
assert(importedTxs.length === 1, 'CSV import parsed 1 transaction');
assert(importedTxs[0].amount === 50, 'Imported amount = 50');

section('Dashboard Rendering');

const dashboard = new Dashboard(store, budgetEngine, nwEngine, {
  robinhood: rhManager,
  chase: chaseManager,
  vanguard: vgManager,
  amex: amexManager,
});

const header = dashboard.renderHeader();
assert(header.includes('BUDGET & NET WORTH TRACKER'), 'Header contains title');

const nwSummary = dashboard.renderNetWorthSummary();
assert(nwSummary.includes('Net Worth'), 'Net worth summary renders');

const accSummary = dashboard.renderAccountsSummary();
assert(accSummary.includes('ACCOUNTS BY INSTITUTION'), 'Account summary renders');

const budgetSummary = dashboard.renderBudgetSummary(month);
assert(budgetSummary.includes('BUDGET'), 'Budget summary renders');

const investmentSummary = dashboard.renderInvestmentSummary();
assert(investmentSummary.includes('INVESTMENT'), 'Investment summary renders');

const creditSummary = dashboard.renderCreditSummary();
assert(creditSummary.includes('CREDIT'), 'Credit summary renders');

const recentTx = dashboard.renderRecentTransactions();
assert(recentTx.includes('RECENT TRANSACTIONS'), 'Recent transactions renders');

const fullDash = dashboard.renderFullDashboard();
assert(fullDash.length > 500, 'Full dashboard has substantial output');

const menu = dashboard.renderMenu();
assert(menu.includes('MAIN MENU'), 'Menu renders');

section('Demo Data');

const demoStore = new TestDataStore();
generateDemoData(demoStore);
assert(demoStore.accounts.length === 7, 'Demo has 7 accounts');
assert(demoStore.transactions.length > 30, 'Demo has 30+ transactions');
assert(demoStore.budgets.length === 1, 'Demo has 1 budget');
assert(demoStore.snapshots.length === 12, 'Demo has 12 snapshots');

const demoNW = new NetWorthEngine(demoStore);
const demoCalc = demoNW.calculateCurrentNetWorth();
assert(demoCalc.netWorth > 0, 'Demo net worth is positive');
assert(demoCalc.totalAssets > 200000, 'Demo assets > 200k');

section('Utility Functions');

assert(currency(1234.56) === '$1,234.56', 'Currency formatting works');
assert(currency(-500) === '-$500.00', 'Negative currency formatting works');
assert(currency(0) === '$0.00', 'Zero currency works');
assert(currency(1000000) === '$1,000,000.00', 'Large currency works');
assert(percentage(25, 100) === '25.0%', 'Percentage works');
assert(monthKey(new Date('2026-02-15')) === '2026-02', 'Month key extraction works');

// ── Summary ────────────────────────────────────────
console.log(`\n\x1b[1m══════════════════════════════════════════\x1b[0m`);
console.log(`\x1b[1m  Results: \x1b[32m${passed} passed\x1b[0m, \x1b[31m${failed} failed\x1b[0m`);
console.log(`\x1b[1m══════════════════════════════════════════\x1b[0m\n`);

process.exit(failed > 0 ? 1 : 0);
