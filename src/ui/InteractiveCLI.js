const readline = require('readline');
const { colorize, currency, pad, monthKey } = require('../utils/format');
const { Transaction, TRANSACTION_TYPES, CATEGORIES } = require('../models/Transaction');
const { BudgetCategory } = require('../models/Budget');
const { GOAL_TYPES } = require('../models/Goal');
const { FREQUENCIES } = require('../models/RecurringTransaction');

class InteractiveCLI {
  constructor(dashboard, dataStore, budgetEngine, netWorthEngine, reportEngine, managers, goalsEngine, recurringEngine) {
    this.dashboard = dashboard;
    this.store = dataStore;
    this.budget = budgetEngine;
    this.netWorth = netWorthEngine;
    this.report = reportEngine;
    this.managers = managers;
    this.goals = goalsEngine || null;
    this.recurring = recurringEngine || null;
    this.rl = null;
  }

  start() {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    // Auto-clone budget if needed
    const cloned = this.budget.autoCloneCurrentMonth();
    if (cloned) {
      console.log(colorize(`\n  Budget auto-cloned to ${cloned.month} from previous month.\n`, 'yellow'));
    }

    // Generate pending recurring transactions
    if (this.recurring) {
      const generated = this.recurring.generatePendingTransactions();
      if (generated.length > 0) {
        console.log(colorize(`\n  Generated ${generated.length} recurring transaction(s).\n`, 'yellow'));
      }
    }

    this.showDashboard();
  }

  prompt(question) {
    return new Promise(resolve => {
      this.rl.question(colorize(`  > ${question} `, 'cyan'), answer => {
        resolve(answer.trim());
      });
    });
  }

  async showDashboard() {
    console.clear();
    console.log(this.dashboard.renderFullDashboard());
    console.log(this.dashboard.renderMenu());
    await this.handleMenuChoice();
  }

  async handleMenuChoice() {
    const choice = await this.prompt('Select option:');

    switch (choice) {
      case '1': return this.showFullDashboard();
      case '2': return this.manageAccounts();
      case '3': return this.addTransaction();
      case '4': return this.manageBudget();
      case '5': return this.showNetWorth();
      case '6': return this.showInvestments();
      case '7': return this.showCredit();
      case '8': return this.showReports();
      case '9': return this.importExport();
      case 'r': case 'R': return this.manageRecurring();
      case 'g': case 'G': return this.manageGoals();
      case 'f': case 'F': return this.showForecast();
      case '0':
      case 'q':
      case 'exit':
        console.log(colorize('\n  Goodbye! Your data has been saved.\n', 'cyan'));
        this.rl.close();
        process.exit(0);
        break;
      default:
        console.log(colorize('\n  Invalid option. Try again.\n', 'red'));
        return this.showDashboard();
    }
  }

  async showFullDashboard() {
    console.clear();
    console.log(this.dashboard.renderFullDashboard());
    await this.prompt('Press Enter to return to menu...');
    return this.showDashboard();
  }

  async manageAccounts() {
    console.clear();
    console.log(this.dashboard.renderHeader());
    console.log(this.dashboard.renderAccountsSummary());
    console.log(colorize('  ── ACCOUNT MANAGEMENT ──────────────────────────────────────────', 'blue'));
    console.log('');
    console.log('    ' + colorize('[1]', 'cyan') + '  Add Chase Account (Checking/Savings/Credit)');
    console.log('    ' + colorize('[2]', 'cyan') + '  Add Robinhood Brokerage Account');
    console.log('    ' + colorize('[3]', 'cyan') + '  Add Vanguard Account (Retirement/Investment)');
    console.log('    ' + colorize('[4]', 'cyan') + '  Add Amex Credit Card');
    console.log('    ' + colorize('[5]', 'cyan') + '  Update Account Balance');
    console.log('    ' + colorize('[6]', 'cyan') + '  Update Investment Holdings');
    console.log('    ' + colorize('[7]', 'cyan') + '  Remove Account');
    console.log('    ' + colorize('[0]', 'cyan') + '  Back to Menu');
    console.log('');

    const choice = await this.prompt('Select option:');

    switch (choice) {
      case '1': return this.addChaseAccount();
      case '2': return this.addRobinhoodAccount();
      case '3': return this.addVanguardAccount();
      case '4': return this.addAmexAccount();
      case '5': return this.updateAccountBalance();
      case '6': return this.updateHoldings();
      case '7': return this.removeAccount();
      case '0': return this.showDashboard();
      default: return this.manageAccounts();
    }
  }

  async addChaseAccount() {
    console.log('');
    const type = await this.prompt('Account type (checking/savings/credit):');
    const name = await this.prompt('Account name:');
    const balance = parseFloat(await this.prompt('Current balance:')) || 0;

    if (type === 'credit') {
      const limit = parseFloat(await this.prompt('Credit limit:')) || 10000;
      const apr = parseFloat(await this.prompt('APR %:')) || 24.99;
      this.managers.chase.createCreditCardAccount({ name, balance, creditLimit: limit, apr });
    } else if (type === 'savings') {
      this.managers.chase.createSavingsAccount({ name, balance });
    } else {
      this.managers.chase.createCheckingAccount({ name, balance });
    }

    console.log(colorize('\n  ✓ Chase account added successfully!\n', 'green'));
    await this.prompt('Press Enter to continue...');
    return this.manageAccounts();
  }

  async addRobinhoodAccount() {
    console.log('');
    const name = await this.prompt('Account name (default: Robinhood Brokerage):') || 'Robinhood Brokerage';
    const balance = parseFloat(await this.prompt('Cash balance:')) || 0;
    this.managers.robinhood.createBrokerageAccount({ name, balance });
    console.log(colorize('\n  ✓ Robinhood account added! Use "Update Holdings" to add stocks.\n', 'green'));
    await this.prompt('Press Enter to continue...');
    return this.manageAccounts();
  }

  async addVanguardAccount() {
    console.log('');
    const type = await this.prompt('Account type (retirement/investment):');
    const name = await this.prompt('Account name:');
    const balance = parseFloat(await this.prompt('Current value:')) || 0;

    if (type === 'retirement') {
      const subtype = await this.prompt('Subtype (401k/IRA/Roth IRA):') || '401k';
      this.managers.vanguard.createRetirementAccount({ name, balance, accountSubtype: subtype });
    } else {
      this.managers.vanguard.createInvestmentAccount({ name, balance });
    }

    console.log(colorize('\n  ✓ Vanguard account added successfully!\n', 'green'));
    await this.prompt('Press Enter to continue...');
    return this.manageAccounts();
  }

  async addAmexAccount() {
    console.log('');
    const name = await this.prompt('Card name (default: Amex Credit Card):') || 'Amex Credit Card';
    const balance = parseFloat(await this.prompt('Current balance owed:')) || 0;
    const limit = parseFloat(await this.prompt('Credit limit:')) || 15000;
    const apr = parseFloat(await this.prompt('APR %:')) || 22.99;
    this.managers.amex.createCreditCardAccount({ name, balance, creditLimit: limit, apr });
    console.log(colorize('\n  ✓ Amex card added successfully!\n', 'green'));
    await this.prompt('Press Enter to continue...');
    return this.manageAccounts();
  }

  async updateAccountBalance() {
    console.log('');
    const accounts = this.store.accounts;
    accounts.forEach((a, i) => {
      console.log(`    [${i + 1}] ${a.name} (${a.institution}) - ${currency(a.balance)}`);
    });
    console.log('');

    const idx = parseInt(await this.prompt('Select account number:')) - 1;
    if (idx < 0 || idx >= accounts.length) {
      console.log(colorize('  Invalid selection.\n', 'red'));
      await this.prompt('Press Enter to continue...');
      return this.manageAccounts();
    }

    const newBalance = parseFloat(await this.prompt('New balance:'));
    if (isNaN(newBalance)) {
      console.log(colorize('  Invalid amount.\n', 'red'));
      await this.prompt('Press Enter to continue...');
      return this.manageAccounts();
    }

    this.store.updateAccount(accounts[idx].id, { balance: newBalance });
    console.log(colorize('\n  ✓ Balance updated successfully!\n', 'green'));
    await this.prompt('Press Enter to continue...');
    return this.manageAccounts();
  }

  async updateHoldings() {
    console.log('');
    const investmentAccounts = this.store.accounts.filter(
      a => ['brokerage', 'retirement', 'investment'].includes(a.type)
    );

    if (investmentAccounts.length === 0) {
      console.log(colorize('  No investment accounts found.\n', 'yellow'));
      await this.prompt('Press Enter to continue...');
      return this.manageAccounts();
    }

    investmentAccounts.forEach((a, i) => {
      console.log(`    [${i + 1}] ${a.name} (${a.institution})`);
    });
    console.log('');

    const idx = parseInt(await this.prompt('Select account:')) - 1;
    if (idx < 0 || idx >= investmentAccounts.length) {
      return this.manageAccounts();
    }

    const account = investmentAccounts[idx];
    const symbol = (await this.prompt('Stock/Fund symbol:')).toUpperCase();
    const shares = parseFloat(await this.prompt('Number of shares:')) || 0;
    const avgCost = parseFloat(await this.prompt('Average cost per share:')) || 0;
    const currentPrice = parseFloat(await this.prompt('Current price per share:')) || avgCost;

    if (account.institution === 'Robinhood') {
      this.managers.robinhood.addHolding(account.id, { symbol, shares, avgCost, currentPrice });
    } else {
      this.managers.vanguard.updateHoldings(account.id, [
        ...(account.holdings || []),
        { symbol, shares, avgCost, currentPrice },
      ]);
    }

    console.log(colorize(`\n  ✓ Added ${shares} shares of ${symbol}!\n`, 'green'));
    await this.prompt('Press Enter to continue...');
    return this.manageAccounts();
  }

  async removeAccount() {
    console.log('');
    const accounts = this.store.accounts;
    accounts.forEach((a, i) => {
      console.log(`    [${i + 1}] ${a.name} (${a.institution}) - ${currency(a.getNetValue())}`);
    });

    const idx = parseInt(await this.prompt('\n  Select account to remove:')) - 1;
    if (idx < 0 || idx >= accounts.length) return this.manageAccounts();

    const confirm = await this.prompt(`Remove "${accounts[idx].name}"? (yes/no):`);
    if (confirm.toLowerCase() === 'yes') {
      this.store.removeAccount(accounts[idx].id);
      console.log(colorize('\n  ✓ Account removed.\n', 'green'));
    }
    await this.prompt('Press Enter to continue...');
    return this.manageAccounts();
  }

  async addTransaction() {
    console.clear();
    console.log(this.dashboard.renderHeader());
    console.log(colorize('  ── ADD TRANSACTION ──────────────────────────────────────────────', 'blue'));
    console.log('');

    const accounts = this.store.accounts;
    if (accounts.length === 0) {
      console.log(colorize('  No accounts found. Add an account first.\n', 'yellow'));
      await this.prompt('Press Enter to return...');
      return this.showDashboard();
    }

    accounts.forEach((a, i) => {
      console.log(`    [${i + 1}] ${a.name} (${a.institution})`);
    });

    const accIdx = parseInt(await this.prompt('\n  Select account:')) - 1;
    if (accIdx < 0 || accIdx >= accounts.length) return this.showDashboard();

    const date = (await this.prompt('Date (YYYY-MM-DD, Enter for today):')) || new Date().toISOString().split('T')[0];
    const description = await this.prompt('Description:');
    const amount = parseFloat(await this.prompt('Amount:')) || 0;

    console.log('');
    console.log('    Types: income, expense, transfer, payment, dividend, refund');
    const type = (await this.prompt('Type:')).toLowerCase() || 'expense';

    const categoryList = Object.values(CATEGORIES);
    console.log('');
    console.log('    Categories:');
    for (let i = 0; i < categoryList.length; i += 4) {
      const chunk = categoryList.slice(i, i + 4);
      console.log('      ' + chunk.map((c, j) => `[${i + j + 1}] ${pad(c, 18)}`).join(''));
    }
    console.log('');

    const catInput = await this.prompt('Category (number or name):');
    let category;
    const catNum = parseInt(catInput);
    if (!isNaN(catNum) && catNum > 0 && catNum <= categoryList.length) {
      category = categoryList[catNum - 1];
    } else {
      category = catInput || 'Other Expense';
    }

    let toAccountId = null;
    if (type === 'transfer' || type === 'payment') {
      console.log('');
      accounts.forEach((a, i) => {
        console.log(`    [${i + 1}] ${a.name}`);
      });
      const toIdx = parseInt(await this.prompt('Transfer to account:')) - 1;
      if (toIdx >= 0 && toIdx < accounts.length) {
        toAccountId = accounts[toIdx].id;
      }
    }

    const tags = (await this.prompt('Tags (comma-separated, optional):')).split(',').map(t => t.trim()).filter(Boolean);

    const tx = new Transaction({
      date,
      description,
      amount,
      type,
      category,
      accountId: accounts[accIdx].id,
      toAccountId,
      tags,
    });

    this.store.addTransaction(tx);
    console.log(colorize(`\n  ✓ Transaction added: ${description} ${currency(amount)}\n`, 'green'));
    await this.prompt('Press Enter to continue...');
    return this.showDashboard();
  }

  async manageBudget() {
    console.clear();
    console.log(this.dashboard.renderHeader());

    const month = monthKey(new Date());
    console.log(this.dashboard.renderBudgetSummary(month));

    console.log(colorize('  ── BUDGET MANAGEMENT ───────────────────────────────────────────', 'blue'));
    console.log('');
    console.log('    ' + colorize('[1]', 'cyan') + '  Create/Update Budget for Current Month');
    console.log('    ' + colorize('[2]', 'cyan') + '  Add Budget Category');
    console.log('    ' + colorize('[3]', 'cyan') + '  View Category Breakdown');
    console.log('    ' + colorize('[4]', 'cyan') + '  Copy Budget to Next Month');
    console.log('    ' + colorize('[5]', 'cyan') + '  View Spending Trends (3 months)');
    console.log('    ' + colorize('[6]', 'cyan') + '  Compare Months');
    console.log('    ' + colorize('[0]', 'cyan') + '  Back to Menu');
    console.log('');

    const choice = await this.prompt('Select option:');

    switch (choice) {
      case '1': return this.createBudget();
      case '2': return this.addBudgetCategory();
      case '3': return this.viewCategoryBreakdown();
      case '4': return this.copyBudget();
      case '5': return this.viewSpendingTrends();
      case '6': return this.compareBudgets();
      case '0': return this.showDashboard();
      default: return this.manageBudget();
    }
  }

  async createBudget() {
    const month = monthKey(new Date());
    const existing = this.store.getBudget(month);

    const income = parseFloat(await this.prompt('Monthly income:')) || 0;
    const savingsGoal = parseFloat(await this.prompt('Savings goal %:')) || 20;

    if (existing) {
      this.store.updateBudget(month, { totalMonthlyIncome: income, savingsGoalPercent: savingsGoal });
      console.log(colorize('\n  ✓ Budget updated!\n', 'green'));
    } else {
      this.budget.createBudget({ month, totalMonthlyIncome: income, categories: [], savingsGoalPercent: savingsGoal });
      console.log(colorize('\n  ✓ Budget created! Add categories next.\n', 'green'));
    }

    await this.prompt('Press Enter to continue...');
    return this.manageBudget();
  }

  async addBudgetCategory() {
    const month = monthKey(new Date());
    const budget = this.store.getBudget(month);

    if (!budget) {
      console.log(colorize('\n  No budget for this month. Create one first.\n', 'yellow'));
      await this.prompt('Press Enter to continue...');
      return this.manageBudget();
    }

    const expenseCategories = [
      'Housing', 'Utilities', 'Groceries', 'Dining Out', 'Transportation', 'Gas',
      'Insurance', 'Healthcare', 'Entertainment', 'Shopping', 'Subscriptions',
      'Travel', 'Education', 'Personal Care', 'Gifts & Donations', 'Other Expense',
    ];

    console.log('');
    expenseCategories.forEach((c, i) => {
      console.log(`    [${i + 1}] ${c}`);
    });

    const catInput = await this.prompt('\n  Category (number or custom name):');
    let category;
    const catNum = parseInt(catInput);
    if (!isNaN(catNum) && catNum > 0 && catNum <= expenseCategories.length) {
      category = expenseCategories[catNum - 1];
    } else {
      category = catInput;
    }

    const limit = parseFloat(await this.prompt('Monthly limit:')) || 0;

    budget.categories.push(new BudgetCategory({ category, monthlyLimit: limit }));
    this.store.save();

    console.log(colorize(`\n  ✓ Added ${category} with ${currency(limit)} budget.\n`, 'green'));
    await this.prompt('Press Enter to continue...');
    return this.manageBudget();
  }

  async viewCategoryBreakdown() {
    const month = monthKey(new Date());
    const breakdown = this.budget.getCategoryBreakdown(month);

    console.log('');
    if (breakdown.length === 0) {
      console.log(colorize('  No spending data for this month.\n', 'yellow'));
    } else {
      for (const cat of breakdown) {
        console.log(`    ${pad(cat.category, 20)} ${currency(cat.amount)} (${cat.percent.toFixed(1)}%) - ${cat.count} transactions`);
      }
      console.log('');
    }

    await this.prompt('Press Enter to continue...');
    return this.manageBudget();
  }

  async copyBudget() {
    const currentMonth = monthKey(new Date());
    const now = new Date();
    const nextMonth = monthKey(new Date(now.getFullYear(), now.getMonth() + 1, 1));

    const result = this.budget.cloneBudgetToMonth(currentMonth, nextMonth);
    if (result) {
      console.log(colorize(`\n  ✓ Budget copied to ${nextMonth}.\n`, 'green'));
    } else {
      console.log(colorize('\n  No budget found for current month to copy, or target month already has a budget.\n', 'yellow'));
    }

    await this.prompt('Press Enter to continue...');
    return this.manageBudget();
  }

  async viewSpendingTrends() {
    const now = new Date();
    const months = [];
    for (let i = 2; i >= 0; i--) {
      months.push(monthKey(new Date(now.getFullYear(), now.getMonth() - i, 1)));
    }

    const trends = this.budget.getSpendingTrends(months);
    console.log('');
    for (const [month, data] of Object.entries(trends)) {
      console.log(colorize(`    ${month}: `, 'bold') + colorize(currency(data.total), 'red'));
      for (const [cat, amount] of Object.entries(data.byCategory).sort((a, b) => b[1] - a[1])) {
        console.log(`      ${pad(cat, 20)} ${currency(amount)}`);
      }
      console.log('');
    }

    await this.prompt('Press Enter to continue...');
    return this.manageBudget();
  }

  async compareBudgets() {
    const now = new Date();
    const currentMonth = monthKey(now);
    const lastMonth = monthKey(new Date(now.getFullYear(), now.getMonth() - 1, 1));

    const comparison = this.budget.getBudgetComparison(lastMonth, currentMonth);
    console.log('');

    if (!comparison) {
      console.log(colorize('  Need budgets for both current and last month to compare.\n', 'yellow'));
      await this.prompt('Press Enter to continue...');
      return this.manageBudget();
    }

    console.log(colorize(`    Month-over-Month: ${comparison.month1} vs ${comparison.month2}`, 'bold'));
    console.log('');

    const incChange = comparison.income.change;
    const expChange = comparison.expenses.change;
    const savChange = comparison.savings.change;
    console.log(`    Income:   ${currency(comparison.income.m1)} -> ${currency(comparison.income.m2)}  ${colorize((incChange >= 0 ? '+' : '') + currency(incChange), incChange >= 0 ? 'green' : 'red')}`);
    console.log(`    Expenses: ${currency(comparison.expenses.m1)} -> ${currency(comparison.expenses.m2)}  ${colorize((expChange >= 0 ? '+' : '') + currency(expChange), expChange <= 0 ? 'green' : 'red')}`);
    console.log(`    Savings:  ${currency(comparison.savings.m1)} -> ${currency(comparison.savings.m2)}  ${colorize((savChange >= 0 ? '+' : '') + currency(savChange), savChange >= 0 ? 'green' : 'red')}`);
    console.log('');

    if (comparison.categories.length > 0) {
      console.log(colorize('    Category Changes:', 'bold'));
      for (const c of comparison.categories.slice(0, 8)) {
        const changeColor = c.change <= 0 ? 'green' : 'red';
        console.log(`      ${pad(c.category, 20)} ${currency(c.m1Spent)} -> ${currency(c.m2Spent)}  ${colorize((c.change >= 0 ? '+' : '') + currency(c.change), changeColor)}`);
      }
      console.log('');
    }

    await this.prompt('Press Enter to continue...');
    return this.manageBudget();
  }

  async showNetWorth() {
    console.clear();
    console.log(this.dashboard.renderHeader());
    console.log(this.dashboard.renderNetWorthSummary());

    const breakdown = this.netWorth.getBreakdownByInstitution();
    console.log(colorize('  ── NET WORTH BY INSTITUTION ─────────────────────────────────────', 'blue'));
    console.log('');
    for (const inst of breakdown) {
      console.log(`    ${pad(inst.institution, 15)} Assets: ${colorize(currency(inst.assets), 'green')}  Debt: ${colorize(currency(inst.liabilities), 'red')}  Net: ${colorize(currency(inst.netValue), inst.netValue >= 0 ? 'green' : 'red')} (${inst.percent.toFixed(1)}%)`);
    }
    console.log('');

    const typeBreakdown = this.netWorth.getBreakdownByType();
    console.log(colorize('  ── NET WORTH BY ACCOUNT TYPE ────────────────────────────────────', 'blue'));
    console.log('');
    for (const t of typeBreakdown) {
      const label = t.type.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase());
      console.log(`    ${pad(label, 18)} ${colorize(currency(t.total), t.total >= 0 ? 'green' : 'red')} (${t.count} accounts)`);
    }
    console.log('');

    console.log('    ' + colorize('[1]', 'cyan') + '  Take Net Worth Snapshot');
    console.log('    ' + colorize('[2]', 'cyan') + '  View Snapshot History');
    console.log('    ' + colorize('[0]', 'cyan') + '  Back to Menu');
    console.log('');

    const choice = await this.prompt('Select option:');
    if (choice === '1') {
      this.netWorth.takeSnapshot();
      console.log(colorize('\n  ✓ Net worth snapshot saved!\n', 'green'));
      await this.prompt('Press Enter to continue...');
    } else if (choice === '2') {
      const history = this.netWorth.getNetWorthHistory(12);
      console.log('');
      for (const s of history) {
        console.log(`    ${s.date}  Net Worth: ${colorize(currency(s.netWorth), s.netWorth >= 0 ? 'green' : 'red')}  Assets: ${currency(s.totalAssets)}  Debt: ${currency(s.totalLiabilities)}`);
      }
      console.log('');
      await this.prompt('Press Enter to continue...');
    }

    return this.showDashboard();
  }

  async showInvestments() {
    console.clear();
    console.log(this.dashboard.renderHeader());
    console.log(this.dashboard.renderInvestmentSummary());
    await this.prompt('Press Enter to return to menu...');
    return this.showDashboard();
  }

  async showCredit() {
    console.clear();
    console.log(this.dashboard.renderHeader());
    console.log(this.dashboard.renderCreditSummary());
    await this.prompt('Press Enter to return to menu...');
    return this.showDashboard();
  }

  async showReports() {
    console.clear();
    console.log(this.dashboard.renderHeader());
    console.log(colorize('  ── REPORTS & ANALYTICS ──────────────────────────────────────────', 'blue'));
    console.log('');
    console.log('    ' + colorize('[1]', 'cyan') + '  Monthly Report');
    console.log('    ' + colorize('[2]', 'cyan') + '  Yearly Report');
    console.log('    ' + colorize('[3]', 'cyan') + '  Spending Analysis');
    console.log('    ' + colorize('[4]', 'cyan') + '  Top Expenses');
    console.log('    ' + colorize('[0]', 'cyan') + '  Back to Menu');
    console.log('');

    const choice = await this.prompt('Select option:');

    switch (choice) {
      case '1': {
        const month = (await this.prompt('Month (YYYY-MM, Enter for current):')) || monthKey(new Date());
        const report = this.report.generateMonthlyReport(month);
        if (!report.budget) {
          console.log(colorize('\n  No budget data for this month.\n', 'yellow'));
        } else {
          console.log(this.dashboard.renderBudgetSummary(month));
        }
        break;
      }
      case '2': {
        const year = (await this.prompt('Year (Enter for current):')) || new Date().getFullYear().toString();
        const report = this.report.generateYearlyReport(year);
        console.log(this.report.renderYearlyReport(report));
        break;
      }
      case '3': {
        const start = await this.prompt('Start date (YYYY-MM-DD):');
        const end = (await this.prompt('End date (YYYY-MM-DD, Enter for today):')) || new Date().toISOString().split('T')[0];
        if (start) {
          const report = this.report.generateSpendingReport(start, end);
          console.log(this.report.renderSpendingReport(report));
        }
        break;
      }
      case '4': {
        const month = (await this.prompt('Month (YYYY-MM, Enter for current):')) || monthKey(new Date());
        const topExpenses = this.budget.getTopExpenses(month, 15);
        console.log('');
        if (topExpenses.length === 0) {
          console.log(colorize('  No expenses found for this month.\n', 'yellow'));
        } else {
          for (const tx of topExpenses) {
            console.log(`    ${tx.date}  ${pad(tx.description, 30)} ${colorize(currency(tx.amount), 'red')}  ${colorize(tx.category || '', 'gray')}`);
          }
          console.log('');
        }
        break;
      }
      case '0': return this.showDashboard();
    }

    await this.prompt('Press Enter to continue...');
    return this.showReports();
  }

  async importExport() {
    console.clear();
    console.log(this.dashboard.renderHeader());
    console.log(colorize('  ── IMPORT / EXPORT ──────────────────────────────────────────────', 'blue'));
    console.log('');
    console.log('    ' + colorize('[1]', 'cyan') + '  Export Transactions to CSV');
    console.log('    ' + colorize('[2]', 'cyan') + '  Export Full Report');
    console.log('    ' + colorize('[3]', 'cyan') + '  Import Transactions from CSV');
    console.log('    ' + colorize('[4]', 'cyan') + '  Export Net Worth History');
    console.log('    ' + colorize('[0]', 'cyan') + '  Back to Menu');
    console.log('');

    const choice = await this.prompt('Select option:');

    const fs = require('fs');
    const path = require('path');

    switch (choice) {
      case '1': {
        const txs = this.store.getTransactions();
        const csv = this.report.exportToCSV(txs);
        const filename = `transactions_${new Date().toISOString().split('T')[0]}.csv`;
        const filepath = path.join(process.cwd(), filename);
        fs.writeFileSync(filepath, csv);
        console.log(colorize(`\n  ✓ Exported ${txs.length} transactions to ${filename}\n`, 'green'));
        break;
      }
      case '2': {
        const month = monthKey(new Date());
        const report = this.report.generateMonthlyReport(month);
        const filename = `report_${month}.json`;
        const filepath = path.join(process.cwd(), filename);
        fs.writeFileSync(filepath, JSON.stringify(report, null, 2));
        console.log(colorize(`\n  ✓ Report exported to ${filename}\n`, 'green'));
        break;
      }
      case '3': {
        const filepath = await this.prompt('CSV file path:');
        if (filepath && fs.existsSync(filepath)) {
          const content = fs.readFileSync(filepath, 'utf-8');
          const txs = this.report.importFromCSV(content);
          console.log(`\n  Found ${txs.length} transactions to import.`);
          if (txs.length > 0) {
            const confirm = await this.prompt('Import all? (yes/no):');
            if (confirm.toLowerCase() === 'yes') {
              const accounts = this.store.accounts;
              if (accounts.length === 0) {
                console.log(colorize('  No accounts. Add an account first.\n', 'yellow'));
              } else {
                accounts.forEach((a, i) => console.log(`    [${i + 1}] ${a.name}`));
                const accIdx = parseInt(await this.prompt('Assign to account:')) - 1;
                if (accIdx >= 0 && accIdx < accounts.length) {
                  for (const txData of txs) {
                    const tx = new Transaction({ ...txData, accountId: accounts[accIdx].id });
                    this.store.addTransaction(tx);
                  }
                  console.log(colorize(`\n  ✓ Imported ${txs.length} transactions!\n`, 'green'));
                }
              }
            }
          }
        } else {
          console.log(colorize('  File not found.\n', 'red'));
        }
        break;
      }
      case '4': {
        const snapshots = this.netWorth.getNetWorthHistory();
        const csv = 'Date,Assets,Liabilities,Net Worth\n' +
          snapshots.map(s => `${s.date},${s.totalAssets.toFixed(2)},${s.totalLiabilities.toFixed(2)},${s.netWorth.toFixed(2)}`).join('\n');
        const filename = `net_worth_history_${new Date().toISOString().split('T')[0]}.csv`;
        fs.writeFileSync(path.join(process.cwd(), filename), csv);
        console.log(colorize(`\n  ✓ Net worth history exported to ${filename}\n`, 'green'));
        break;
      }
      case '0': return this.showDashboard();
    }

    await this.prompt('Press Enter to continue...');
    return this.importExport();
  }

  // ── RECURRING TRANSACTIONS ──────────────────────────────────────

  async manageRecurring() {
    console.clear();
    console.log(this.dashboard.renderHeader());
    console.log(this.dashboard.renderRecurringSummary());

    console.log(colorize('  ── RECURRING TRANSACTIONS ──────────────────────────────────────', 'blue'));
    console.log('');
    console.log('    ' + colorize('[1]', 'cyan') + '  Add Recurring Transaction');
    console.log('    ' + colorize('[2]', 'cyan') + '  View All Recurring');
    console.log('    ' + colorize('[3]', 'cyan') + '  Pause/Resume Recurring');
    console.log('    ' + colorize('[4]', 'cyan') + '  Remove Recurring');
    console.log('    ' + colorize('[5]', 'cyan') + '  Generate Pending Transactions');
    console.log('    ' + colorize('[6]', 'cyan') + '  View Upcoming (30 days)');
    console.log('    ' + colorize('[0]', 'cyan') + '  Back to Menu');
    console.log('');

    const choice = await this.prompt('Select option:');

    switch (choice) {
      case '1': return this.addRecurring();
      case '2': return this.viewRecurring();
      case '3': return this.toggleRecurring();
      case '4': return this.removeRecurring();
      case '5': return this.generateRecurring();
      case '6': return this.viewUpcoming();
      case '0': return this.showDashboard();
      default: return this.manageRecurring();
    }
  }

  async addRecurring() {
    console.log('');
    const accounts = this.store.accounts;
    if (accounts.length === 0) {
      console.log(colorize('  No accounts found. Add an account first.\n', 'yellow'));
      await this.prompt('Press Enter to continue...');
      return this.manageRecurring();
    }

    const description = await this.prompt('Description (e.g., Rent, Salary):');
    const amount = parseFloat(await this.prompt('Amount:')) || 0;

    console.log('    Types: income, expense, transfer, payment');
    const type = (await this.prompt('Type:')).toLowerCase() || 'expense';

    const categoryList = Object.values(CATEGORIES);
    console.log('');
    const shortList = ['Salary', 'Housing', 'Utilities', 'Insurance', 'Subscriptions', 'Groceries', 'Transportation', 'Investment'];
    shortList.forEach((c, i) => console.log(`    [${i + 1}] ${c}`));
    const catInput = await this.prompt('Category (number or name):');
    let category;
    const catNum = parseInt(catInput);
    if (!isNaN(catNum) && catNum > 0 && catNum <= shortList.length) {
      category = shortList[catNum - 1];
    } else {
      category = catInput || 'Other Expense';
    }

    console.log('');
    console.log('    Frequencies: weekly, biweekly, monthly, quarterly, yearly');
    const frequency = (await this.prompt('Frequency (default: monthly):')).toLowerCase() || 'monthly';

    accounts.forEach((a, i) => console.log(`    [${i + 1}] ${a.name} (${a.institution})`));
    const accIdx = parseInt(await this.prompt('Account:')) - 1;
    if (accIdx < 0 || accIdx >= accounts.length) return this.manageRecurring();

    const dayOfMonth = parseInt(await this.prompt('Day of month (1-28, Enter for 1):')) || 1;

    this.recurring.createRecurring({
      description,
      amount,
      type,
      category,
      frequency,
      accountId: accounts[accIdx].id,
      dayOfMonth: Math.min(dayOfMonth, 28),
      startDate: new Date().toISOString().split('T')[0],
    });

    console.log(colorize(`\n  ✓ Recurring transaction added: ${description} ${currency(amount)} (${frequency})\n`, 'green'));
    await this.prompt('Press Enter to continue...');
    return this.manageRecurring();
  }

  async viewRecurring() {
    console.log('');
    const all = this.store.recurringTransactions;
    if (all.length === 0) {
      console.log(colorize('  No recurring transactions.\n', 'yellow'));
    } else {
      for (const r of all) {
        const status = r.active ? colorize('ACTIVE', 'green') : colorize('PAUSED', 'yellow');
        const account = this.store.getAccount(r.accountId);
        console.log(`    ${status}  ${pad(r.description, 25)} ${pad(currency(r.amount), 12, 'right')} ${pad(r.frequency, 10)} ${colorize(account ? account.name : '', 'gray')}`);
      }
      console.log('');
    }

    await this.prompt('Press Enter to continue...');
    return this.manageRecurring();
  }

  async toggleRecurring() {
    const all = this.store.recurringTransactions;
    if (all.length === 0) {
      console.log(colorize('\n  No recurring transactions.\n', 'yellow'));
      await this.prompt('Press Enter to continue...');
      return this.manageRecurring();
    }

    all.forEach((r, i) => {
      const status = r.active ? colorize('ACTIVE', 'green') : colorize('PAUSED', 'yellow');
      console.log(`    [${i + 1}] ${status}  ${r.description} - ${currency(r.amount)}`);
    });

    const idx = parseInt(await this.prompt('\n  Select:')) - 1;
    if (idx >= 0 && idx < all.length) {
      if (all[idx].active) {
        this.recurring.pauseRecurring(all[idx].id);
        console.log(colorize(`\n  ✓ Paused: ${all[idx].description}\n`, 'yellow'));
      } else {
        this.recurring.resumeRecurring(all[idx].id);
        console.log(colorize(`\n  ✓ Resumed: ${all[idx].description}\n`, 'green'));
      }
    }

    await this.prompt('Press Enter to continue...');
    return this.manageRecurring();
  }

  async removeRecurring() {
    const all = this.store.recurringTransactions;
    if (all.length === 0) {
      console.log(colorize('\n  No recurring transactions.\n', 'yellow'));
      await this.prompt('Press Enter to continue...');
      return this.manageRecurring();
    }

    all.forEach((r, i) => {
      console.log(`    [${i + 1}] ${r.description} - ${currency(r.amount)} (${r.frequency})`);
    });

    const idx = parseInt(await this.prompt('\n  Select to remove:')) - 1;
    if (idx >= 0 && idx < all.length) {
      const confirm = await this.prompt(`Remove "${all[idx].description}"? (yes/no):`);
      if (confirm.toLowerCase() === 'yes') {
        this.recurring.removeRecurring(all[idx].id);
        console.log(colorize('\n  ✓ Removed.\n', 'green'));
      }
    }

    await this.prompt('Press Enter to continue...');
    return this.manageRecurring();
  }

  async generateRecurring() {
    const generated = this.recurring.generatePendingTransactions();
    if (generated.length > 0) {
      console.log(colorize(`\n  ✓ Generated ${generated.length} transaction(s):\n`, 'green'));
      for (const tx of generated) {
        console.log(`    ${tx.date}  ${pad(tx.description, 25)} ${currency(tx.amount)}`);
      }
    } else {
      console.log(colorize('\n  No pending recurring transactions to generate.\n', 'yellow'));
    }
    console.log('');

    await this.prompt('Press Enter to continue...');
    return this.manageRecurring();
  }

  async viewUpcoming() {
    const upcoming = this.recurring.getUpcoming(30);
    console.log('');
    if (upcoming.length === 0) {
      console.log(colorize('  No upcoming recurring transactions in the next 30 days.\n', 'yellow'));
    } else {
      let totalUpcoming = 0;
      for (const item of upcoming) {
        const typeColor = item.recurring.type === 'income' ? 'green' : 'red';
        console.log(`    ${colorize(item.date, 'gray')}  ${pad(item.recurring.description, 25)} ${colorize(currency(item.recurring.amount), typeColor)}  ${colorize(item.recurring.frequency, 'gray')}`);
        if (item.recurring.type === 'expense') totalUpcoming += item.recurring.amount;
        else totalUpcoming -= item.recurring.amount;
      }
      console.log('');
      console.log(`    Expected net outflow: ${colorize(currency(totalUpcoming), totalUpcoming > 0 ? 'red' : 'green')}`);
      console.log('');
    }

    await this.prompt('Press Enter to continue...');
    return this.manageRecurring();
  }

  // ── FINANCIAL GOALS ─────────────────────────────────────────────

  async manageGoals() {
    console.clear();
    console.log(this.dashboard.renderHeader());
    console.log(this.dashboard.renderGoalsSummary());

    console.log(colorize('  ── FINANCIAL GOALS ─────────────────────────────────────────────', 'blue'));
    console.log('');
    console.log('    ' + colorize('[1]', 'cyan') + '  Add New Goal');
    console.log('    ' + colorize('[2]', 'cyan') + '  Update Goal Progress');
    console.log('    ' + colorize('[3]', 'cyan') + '  Remove Goal');
    console.log('    ' + colorize('[4]', 'cyan') + '  Sync Goals with Accounts');
    console.log('    ' + colorize('[0]', 'cyan') + '  Back to Menu');
    console.log('');

    const choice = await this.prompt('Select option:');

    switch (choice) {
      case '1': return this.addGoal();
      case '2': return this.updateGoal();
      case '3': return this.removeGoal();
      case '4': return this.syncGoals();
      case '0': return this.showDashboard();
      default: return this.manageGoals();
    }
  }

  async addGoal() {
    console.log('');
    const name = await this.prompt('Goal name (e.g., Emergency Fund, Pay off Amex):');
    const targetAmount = parseFloat(await this.prompt('Target amount:')) || 0;

    const goalTypes = Object.values(GOAL_TYPES);
    goalTypes.forEach((t, i) => console.log(`    [${i + 1}] ${t.replace('_', ' ')}`));
    const typeIdx = parseInt(await this.prompt('Goal type:')) - 1;
    const type = (typeIdx >= 0 && typeIdx < goalTypes.length) ? goalTypes[typeIdx] : 'savings';

    const currentAmount = parseFloat(await this.prompt('Current progress ($0 if starting fresh):')) || 0;
    const deadline = (await this.prompt('Deadline (YYYY-MM-DD, Enter for none):')) || null;

    // Optionally link to an account
    let accountId = null;
    const linkAccount = await this.prompt('Link to account? (yes/no):');
    if (linkAccount.toLowerCase() === 'yes') {
      const accounts = this.store.accounts;
      accounts.forEach((a, i) => console.log(`    [${i + 1}] ${a.name} (${a.institution})`));
      const accIdx = parseInt(await this.prompt('Select account:')) - 1;
      if (accIdx >= 0 && accIdx < accounts.length) {
        accountId = accounts[accIdx].id;
      }
    }

    console.log('    Priorities: low, medium, high');
    const priority = (await this.prompt('Priority (default: medium):')) || 'medium';

    this.goals.createGoal({
      name,
      type,
      targetAmount,
      currentAmount,
      deadline,
      accountId,
      priority,
    });

    console.log(colorize(`\n  ✓ Goal created: "${name}" - Target ${currency(targetAmount)}\n`, 'green'));
    await this.prompt('Press Enter to continue...');
    return this.manageGoals();
  }

  async updateGoal() {
    const goals = this.store.goals;
    if (goals.length === 0) {
      console.log(colorize('\n  No goals set.\n', 'yellow'));
      await this.prompt('Press Enter to continue...');
      return this.manageGoals();
    }

    goals.forEach((g, i) => {
      console.log(`    [${i + 1}] ${g.name} - ${currency(g.currentAmount)} / ${currency(g.targetAmount)} (${g.getProgress().toFixed(0)}%)`);
    });

    const idx = parseInt(await this.prompt('\n  Select goal:')) - 1;
    if (idx < 0 || idx >= goals.length) return this.manageGoals();

    const newAmount = parseFloat(await this.prompt('New current amount:'));
    if (!isNaN(newAmount)) {
      this.goals.updateGoalProgress(goals[idx].id, newAmount);
      console.log(colorize(`\n  ✓ Updated "${goals[idx].name}" to ${currency(newAmount)}\n`, 'green'));
    }

    await this.prompt('Press Enter to continue...');
    return this.manageGoals();
  }

  async removeGoal() {
    const goals = this.store.goals;
    if (goals.length === 0) {
      console.log(colorize('\n  No goals set.\n', 'yellow'));
      await this.prompt('Press Enter to continue...');
      return this.manageGoals();
    }

    goals.forEach((g, i) => {
      console.log(`    [${i + 1}] ${g.name} - ${currency(g.targetAmount)}`);
    });

    const idx = parseInt(await this.prompt('\n  Select goal to remove:')) - 1;
    if (idx >= 0 && idx < goals.length) {
      const confirm = await this.prompt(`Remove "${goals[idx].name}"? (yes/no):`);
      if (confirm.toLowerCase() === 'yes') {
        this.goals.removeGoal(goals[idx].id);
        console.log(colorize('\n  ✓ Goal removed.\n', 'green'));
      }
    }

    await this.prompt('Press Enter to continue...');
    return this.manageGoals();
  }

  async syncGoals() {
    this.goals.syncGoalsWithAccounts();
    console.log(colorize('\n  ✓ Goals synced with current account balances.\n', 'green'));
    await this.prompt('Press Enter to continue...');
    return this.manageGoals();
  }

  // ── NET WORTH FORECAST ──────────────────────────────────────────

  async showForecast() {
    console.clear();
    console.log(this.dashboard.renderHeader());
    console.log(this.dashboard.renderForecast());
    await this.prompt('Press Enter to return to menu...');
    return this.showDashboard();
  }
}

module.exports = { InteractiveCLI };
