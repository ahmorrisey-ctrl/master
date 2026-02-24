const { generateId } = require('../utils/id');

const GOAL_TYPES = {
  SAVINGS: 'savings',
  DEBT_PAYOFF: 'debt_payoff',
  NET_WORTH: 'net_worth',
  INVESTMENT: 'investment',
  EMERGENCY_FUND: 'emergency_fund',
};

class Goal {
  constructor({ id, name, type, targetAmount, currentAmount, deadline, accountId, priority, createdDate, notes }) {
    this.id = id || generateId();
    this.name = name;
    this.type = type || GOAL_TYPES.SAVINGS;
    this.targetAmount = targetAmount;
    this.currentAmount = currentAmount || 0;
    this.deadline = deadline || null;
    this.accountId = accountId || null;
    this.priority = priority || 'medium';
    this.createdDate = createdDate || new Date().toISOString().split('T')[0];
    this.notes = notes || '';
  }

  getProgress() {
    if (this.targetAmount === 0) return 100;
    return Math.min((this.currentAmount / this.targetAmount) * 100, 100);
  }

  getRemaining() {
    return Math.max(this.targetAmount - this.currentAmount, 0);
  }

  isComplete() {
    return this.currentAmount >= this.targetAmount;
  }

  getDaysRemaining() {
    if (!this.deadline) return null;
    const now = new Date();
    const deadlineDate = new Date(this.deadline + 'T00:00:00');
    const diff = deadlineDate.getTime() - now.getTime();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  }

  getMonthlyTargetNeeded() {
    const remaining = this.getRemaining();
    if (remaining <= 0) return 0;
    const daysLeft = this.getDaysRemaining();
    if (daysLeft === null || daysLeft <= 0) return remaining;
    const monthsLeft = daysLeft / 30.44;
    if (monthsLeft < 1) return remaining;
    return remaining / monthsLeft;
  }

  isOnTrack() {
    if (!this.deadline) return null;
    const daysLeft = this.getDaysRemaining();
    if (daysLeft === null) return null;
    if (this.isComplete()) return true;
    if (daysLeft <= 0) return false;

    const totalDays = Math.ceil(
      (new Date(this.deadline + 'T00:00:00').getTime() - new Date(this.createdDate + 'T00:00:00').getTime()) / (1000 * 60 * 60 * 24)
    );
    if (totalDays <= 0) return null;
    const expectedProgress = ((totalDays - daysLeft) / totalDays) * 100;
    return this.getProgress() >= expectedProgress * 0.9;
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      type: this.type,
      targetAmount: this.targetAmount,
      currentAmount: this.currentAmount,
      deadline: this.deadline,
      accountId: this.accountId,
      priority: this.priority,
      createdDate: this.createdDate,
      notes: this.notes,
    };
  }

  static fromJSON(data) {
    return new Goal(data);
  }
}

module.exports = { Goal, GOAL_TYPES };
