const { Transaction } = require('../models/Transaction');
const { RecurringTransaction } = require('../models/RecurringTransaction');

class RecurringEngine {
  constructor(dataStore) {
    this.store = dataStore;
  }

  createRecurring(data) {
    const recurring = new RecurringTransaction(data);
    return this.store.addRecurring(recurring);
  }

  removeRecurring(id) {
    this.store.recurringTransactions = this.store.recurringTransactions.filter(r => r.id !== id);
    this.store.save();
  }

  pauseRecurring(id) {
    const recurring = this.store.recurringTransactions.find(r => r.id === id);
    if (recurring) {
      recurring.active = false;
      this.store.save();
    }
    return recurring;
  }

  resumeRecurring(id) {
    const recurring = this.store.recurringTransactions.find(r => r.id === id);
    if (recurring) {
      recurring.active = true;
      this.store.save();
    }
    return recurring;
  }

  getActiveRecurring() {
    return this.store.recurringTransactions.filter(r => r.isActive());
  }

  getPendingTransactions(asOfDate) {
    const now = asOfDate || new Date().toISOString().split('T')[0];
    const pending = [];

    for (const recurring of this.getActiveRecurring()) {
      const lastGen = recurring.lastGenerated || recurring.startDate;
      let nextDue = recurring.getNextDueDate(lastGen);

      // Generate all pending occurrences up to the current date
      while (nextDue <= now) {
        pending.push({
          recurring,
          date: nextDue,
        });
        nextDue = recurring.getNextDueDate(nextDue);
      }
    }

    return pending.sort((a, b) => a.date.localeCompare(b.date));
  }

  generatePendingTransactions(asOfDate) {
    const pending = this.getPendingTransactions(asOfDate);
    const generated = [];

    for (const item of pending) {
      const tx = new Transaction({
        date: item.date,
        description: item.recurring.description,
        amount: item.recurring.amount,
        type: item.recurring.type,
        category: item.recurring.category,
        accountId: item.recurring.accountId,
        toAccountId: item.recurring.toAccountId,
        tags: [...(item.recurring.tags || []), 'recurring'],
        notes: `Auto-generated from recurring: ${item.recurring.description}`,
      });

      this.store.addTransaction(tx);
      item.recurring.lastGenerated = item.date;
      generated.push(tx);
    }

    if (generated.length > 0) {
      this.store.save();
    }

    return generated;
  }

  getUpcoming(days = 30) {
    const now = new Date();
    const future = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
    const futureStr = future.toISOString().split('T')[0];
    const nowStr = now.toISOString().split('T')[0];
    const upcoming = [];

    for (const recurring of this.getActiveRecurring()) {
      const lastGen = recurring.lastGenerated || recurring.startDate;
      let nextDue = recurring.getNextDueDate(lastGen);

      while (nextDue <= futureStr) {
        if (nextDue >= nowStr) {
          upcoming.push({
            recurring,
            date: nextDue,
          });
        }
        nextDue = recurring.getNextDueDate(nextDue);
      }
    }

    return upcoming.sort((a, b) => a.date.localeCompare(b.date));
  }

  getMonthlyProjection() {
    const active = this.getActiveRecurring();
    let totalIncome = 0;
    let totalExpenses = 0;
    const byCategory = {};

    for (const r of active) {
      let monthlyAmount = r.amount;

      switch (r.frequency) {
        case 'weekly':
          monthlyAmount = r.amount * 4.33;
          break;
        case 'biweekly':
          monthlyAmount = r.amount * 2.17;
          break;
        case 'quarterly':
          monthlyAmount = r.amount / 3;
          break;
        case 'yearly':
          monthlyAmount = r.amount / 12;
          break;
      }

      if (r.type === 'income' || r.type === 'dividend' || r.type === 'interest') {
        totalIncome += monthlyAmount;
      } else if (r.type === 'expense') {
        totalExpenses += monthlyAmount;
      }

      const cat = r.category || 'Other';
      if (!byCategory[cat]) byCategory[cat] = 0;
      byCategory[cat] += monthlyAmount;
    }

    return {
      totalIncome,
      totalExpenses,
      netMonthly: totalIncome - totalExpenses,
      count: active.length,
      byCategory,
    };
  }
}

module.exports = { RecurringEngine };
