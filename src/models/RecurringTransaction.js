const { generateId } = require('../utils/id');

const FREQUENCIES = {
  WEEKLY: 'weekly',
  BIWEEKLY: 'biweekly',
  MONTHLY: 'monthly',
  QUARTERLY: 'quarterly',
  YEARLY: 'yearly',
};

class RecurringTransaction {
  constructor({ id, description, amount, type, category, accountId, toAccountId, frequency, startDate, endDate, dayOfMonth, active, lastGenerated, tags, notes }) {
    this.id = id || generateId();
    this.description = description;
    this.amount = amount;
    this.type = type;
    this.category = category;
    this.accountId = accountId;
    this.toAccountId = toAccountId || null;
    this.frequency = frequency || FREQUENCIES.MONTHLY;
    this.startDate = startDate || new Date().toISOString().split('T')[0];
    this.endDate = endDate || null;
    this.dayOfMonth = dayOfMonth || null;
    this.active = active !== undefined ? active : true;
    this.lastGenerated = lastGenerated || null;
    this.tags = tags || [];
    this.notes = notes || '';
  }

  isActive(asOfDate) {
    if (!this.active) return false;
    const now = asOfDate || new Date().toISOString().split('T')[0];
    if (this.startDate > now) return false;
    if (this.endDate && this.endDate < now) return false;
    return true;
  }

  getNextDueDate(afterDate) {
    const after = afterDate || this.lastGenerated || this.startDate;
    const d = new Date(after + 'T00:00:00');

    switch (this.frequency) {
      case FREQUENCIES.WEEKLY:
        d.setDate(d.getDate() + 7);
        break;
      case FREQUENCIES.BIWEEKLY:
        d.setDate(d.getDate() + 14);
        break;
      case FREQUENCIES.MONTHLY:
        d.setMonth(d.getMonth() + 1);
        if (this.dayOfMonth) {
          const maxDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
          d.setDate(Math.min(this.dayOfMonth, maxDay));
        }
        break;
      case FREQUENCIES.QUARTERLY:
        d.setMonth(d.getMonth() + 3);
        if (this.dayOfMonth) {
          const maxDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
          d.setDate(Math.min(this.dayOfMonth, maxDay));
        }
        break;
      case FREQUENCIES.YEARLY:
        d.setFullYear(d.getFullYear() + 1);
        break;
    }

    return d.toISOString().split('T')[0];
  }

  toJSON() {
    return {
      id: this.id,
      description: this.description,
      amount: this.amount,
      type: this.type,
      category: this.category,
      accountId: this.accountId,
      toAccountId: this.toAccountId,
      frequency: this.frequency,
      startDate: this.startDate,
      endDate: this.endDate,
      dayOfMonth: this.dayOfMonth,
      active: this.active,
      lastGenerated: this.lastGenerated,
      tags: this.tags,
      notes: this.notes,
    };
  }

  static fromJSON(data) {
    return new RecurringTransaction(data);
  }
}

module.exports = { RecurringTransaction, FREQUENCIES };
