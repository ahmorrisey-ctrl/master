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
}

module.exports = { BudgetEngine };
