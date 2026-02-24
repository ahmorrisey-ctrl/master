const { generateId } = require('../utils/id');

class BudgetCategory {
  constructor({ id, category, monthlyLimit, rollover }) {
    this.id = id || generateId();
    this.category = category;
    this.monthlyLimit = monthlyLimit;
    this.rollover = rollover || false;
  }

  toJSON() {
    return {
      id: this.id,
      category: this.category,
      monthlyLimit: this.monthlyLimit,
      rollover: this.rollover,
    };
  }

  static fromJSON(data) {
    return new BudgetCategory(data);
  }
}

class Budget {
  constructor({ id, name, month, categories, totalMonthlyIncome, savingsGoalPercent }) {
    this.id = id || generateId();
    this.name = name || 'Monthly Budget';
    this.month = month;
    this.categories = (categories || []).map(c => c instanceof BudgetCategory ? c : BudgetCategory.fromJSON(c));
    this.totalMonthlyIncome = totalMonthlyIncome || 0;
    this.savingsGoalPercent = savingsGoalPercent || 20;
  }

  getTotalBudgeted() {
    return this.categories.reduce((sum, c) => sum + c.monthlyLimit, 0);
  }

  getUnallocated() {
    return this.totalMonthlyIncome - this.getTotalBudgeted();
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      month: this.month,
      categories: this.categories.map(c => c.toJSON()),
      totalMonthlyIncome: this.totalMonthlyIncome,
      savingsGoalPercent: this.savingsGoalPercent,
    };
  }

  static fromJSON(data) {
    return new Budget(data);
  }
}

module.exports = { Budget, BudgetCategory };
