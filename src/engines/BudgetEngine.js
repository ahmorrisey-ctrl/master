const { Budget, BudgetCategory } = require('../models/Budget');
const { monthKey } = require('../utils/format');

class BudgetEngine {
  constructor(dataStore) {
    this.store = dataStore;
  }

  createBudget({ month, totalMonthlyIncome, categories, savingsGoalPercent }) {
    const budget = new Budget({
      month,
      totalMonthlyIncome,
      savingsGoalPercent: savingsGoalPercent || 20,
      categories: categories.map(c => new BudgetCategory(c)),
    });
    return this.store.addBudget(budget);
  }

  getMonthlyReport(month) {
    const budget = this.store.getBudget(month);
    if (!budget) return null;

    const transactions = this.store.getTransactionsByMonth(month);
    const expenses = transactions.filter(t => t.isExpense());
    const income = transactions.filter(t => t.isIncome());

    const totalIncome = income.reduce((sum, t) => sum + t.amount, 0);
    const totalExpenses = expenses.reduce((sum, t) => sum + t.amount, 0);

    const categorySpending = {};
    for (const tx of expenses) {
      const cat = tx.category || 'Other Expense';
      if (!categorySpending[cat]) categorySpending[cat] = 0;
      categorySpending[cat] += tx.amount;
    }

    const categoryReports = budget.categories.map(bc => {
      const spent = categorySpending[bc.category] || 0;
      const remaining = bc.monthlyLimit - spent;
      const percentUsed = bc.monthlyLimit > 0 ? (spent / bc.monthlyLimit) * 100 : 0;
      let status;
      if (percentUsed > 100) status = 'over';
      else if (percentUsed > 80) status = 'warning';
      else status = 'ok';

      return {
        category: bc.category,
        budgeted: bc.monthlyLimit,
        spent,
        remaining,
        percentUsed,
        status,
      };
    });

    // Find unbudgeted spending
    const budgetedCategories = new Set(budget.categories.map(c => c.category));
    const unbudgetedSpending = {};
    for (const [cat, amount] of Object.entries(categorySpending)) {
      if (!budgetedCategories.has(cat)) {
        unbudgetedSpending[cat] = amount;
      }
    }

    const totalBudgeted = budget.getTotalBudgeted();
    const savingsTarget = (budget.savingsGoalPercent / 100) * totalIncome;
    const actualSavings = totalIncome - totalExpenses;

    return {
      month,
      totalIncome,
      totalExpenses,
      totalBudgeted,
      netIncome: totalIncome - totalExpenses,
      savingsTarget,
      actualSavings,
      savingsRate: totalIncome > 0 ? (actualSavings / totalIncome) * 100 : 0,
      categoryReports,
      unbudgetedSpending,
      transactionCount: transactions.length,
    };
  }

  getSpendingTrends(months) {
    const trends = {};
    for (const month of months) {
      const transactions = this.store.getTransactionsByMonth(month);
      const expenses = transactions.filter(t => t.isExpense());

      const monthData = { total: 0, byCategory: {} };
      for (const tx of expenses) {
        monthData.total += tx.amount;
        const cat = tx.category || 'Other';
        if (!monthData.byCategory[cat]) monthData.byCategory[cat] = 0;
        monthData.byCategory[cat] += tx.amount;
      }
      trends[month] = monthData;
    }
    return trends;
  }

  getTopExpenses(month, limit = 10) {
    return this.store.getTransactionsByMonth(month)
      .filter(t => t.isExpense())
      .sort((a, b) => b.amount - a.amount)
      .slice(0, limit);
  }

  getCategoryBreakdown(month) {
    const transactions = this.store.getTransactionsByMonth(month);
    const expenses = transactions.filter(t => t.isExpense());

    const breakdown = {};
    let total = 0;
    for (const tx of expenses) {
      const cat = tx.category || 'Other';
      if (!breakdown[cat]) breakdown[cat] = { amount: 0, count: 0, transactions: [] };
      breakdown[cat].amount += tx.amount;
      breakdown[cat].count++;
      breakdown[cat].transactions.push(tx);
      total += tx.amount;
    }

    return Object.entries(breakdown)
      .map(([category, data]) => ({
        category,
        amount: data.amount,
        count: data.count,
        percent: total > 0 ? (data.amount / total) * 100 : 0,
        transactions: data.transactions,
      }))
      .sort((a, b) => b.amount - a.amount);
  }

  getIncomeBreakdown(month) {
    const transactions = this.store.getTransactionsByMonth(month);
    const income = transactions.filter(t => t.isIncome());

    const breakdown = {};
    let total = 0;
    for (const tx of income) {
      const cat = tx.category || 'Other Income';
      if (!breakdown[cat]) breakdown[cat] = { amount: 0, count: 0 };
      breakdown[cat].amount += tx.amount;
      breakdown[cat].count++;
      total += tx.amount;
    }

    return Object.entries(breakdown)
      .map(([category, data]) => ({
        category,
        amount: data.amount,
        count: data.count,
        percent: total > 0 ? (data.amount / total) * 100 : 0,
      }))
      .sort((a, b) => b.amount - a.amount);
  }

  cloneBudgetToMonth(sourceMonth, targetMonth) {
    const source = this.store.getBudget(sourceMonth);
    if (!source) return null;

    // Don't clone if target already exists
    if (this.store.getBudget(targetMonth)) return null;

    const newBudget = new Budget({
      month: targetMonth,
      totalMonthlyIncome: source.totalMonthlyIncome,
      savingsGoalPercent: source.savingsGoalPercent,
      categories: source.categories.map(c => new BudgetCategory({
        category: c.category,
        monthlyLimit: c.monthlyLimit,
        rollover: c.rollover,
      })),
    });

    return this.store.addBudget(newBudget);
  }

  autoCloneCurrentMonth() {
    const now = new Date();
    const currentMonth = monthKey(now);

    // If current month already has a budget, nothing to do
    if (this.store.getBudget(currentMonth)) return null;

    // Find the most recent budget to clone from
    const sortedBudgets = [...this.store.budgets].sort((a, b) => b.month.localeCompare(a.month));
    if (sortedBudgets.length === 0) return null;

    const source = sortedBudgets[0];
    return this.cloneBudgetToMonth(source.month, currentMonth);
  }

  getBudgetComparison(month1, month2) {
    const report1 = this.getMonthlyReport(month1);
    const report2 = this.getMonthlyReport(month2);
    if (!report1 || !report2) return null;

    const comparison = {
      month1,
      month2,
      income: { m1: report1.totalIncome, m2: report2.totalIncome, change: report2.totalIncome - report1.totalIncome },
      expenses: { m1: report1.totalExpenses, m2: report2.totalExpenses, change: report2.totalExpenses - report1.totalExpenses },
      savings: { m1: report1.actualSavings, m2: report2.actualSavings, change: report2.actualSavings - report1.actualSavings },
      categories: [],
    };

    const allCategories = new Set([
      ...report1.categoryReports.map(c => c.category),
      ...report2.categoryReports.map(c => c.category),
    ]);

    for (const cat of allCategories) {
      const r1 = report1.categoryReports.find(c => c.category === cat);
      const r2 = report2.categoryReports.find(c => c.category === cat);
      comparison.categories.push({
        category: cat,
        m1Spent: r1 ? r1.spent : 0,
        m2Spent: r2 ? r2.spent : 0,
        change: (r2 ? r2.spent : 0) - (r1 ? r1.spent : 0),
      });
    }

    comparison.categories.sort((a, b) => Math.abs(b.change) - Math.abs(a.change));
    return comparison;
  }
}

module.exports = { BudgetEngine };
