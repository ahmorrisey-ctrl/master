const { Goal } = require('../models/Goal');

class GoalsEngine {
  constructor(dataStore, netWorthEngine) {
    this.store = dataStore;
    this.netWorth = netWorthEngine;
  }

  createGoal(data) {
    const goal = new Goal(data);
    return this.store.addGoal(goal);
  }

  removeGoal(id) {
    this.store.goals = this.store.goals.filter(g => g.id !== id);
    this.store.save();
  }

  updateGoalProgress(id, amount) {
    const goal = this.store.goals.find(g => g.id === id);
    if (goal) {
      goal.currentAmount = amount;
      this.store.save();
    }
    return goal;
  }

  syncGoalsWithAccounts() {
    for (const goal of this.store.goals) {
      if (goal.accountId) {
        const account = this.store.getAccount(goal.accountId);
        if (account) {
          if (goal.type === 'debt_payoff') {
            // For debt payoff, progress is how much we've paid down
            goal.currentAmount = Math.max(goal.targetAmount - account.balance, 0);
          } else {
            goal.currentAmount = account.balance;
          }
        }
      }

      if (goal.type === 'net_worth') {
        const nw = this.netWorth.calculateCurrentNetWorth();
        goal.currentAmount = nw.netWorth;
      }

      if (goal.type === 'emergency_fund') {
        // Sum all checking + savings
        const cashAccounts = this.store.accounts.filter(
          a => a.type === 'checking' || a.type === 'savings'
        );
        if (!goal.accountId) {
          goal.currentAmount = cashAccounts.reduce((sum, a) => sum + a.balance, 0);
        }
      }
    }
    this.store.save();
  }

  getGoalsSummary() {
    this.syncGoalsWithAccounts();

    const goals = this.store.goals;
    const active = goals.filter(g => !g.isComplete());
    const completed = goals.filter(g => g.isComplete());

    const totalTarget = active.reduce((sum, g) => sum + g.targetAmount, 0);
    const totalCurrent = active.reduce((sum, g) => sum + g.currentAmount, 0);
    const overallProgress = totalTarget > 0 ? (totalCurrent / totalTarget) * 100 : 0;

    return {
      totalGoals: goals.length,
      activeCount: active.length,
      completedCount: completed.length,
      totalTarget,
      totalCurrent,
      overallProgress,
      goals: goals.map(g => ({
        id: g.id,
        name: g.name,
        type: g.type,
        targetAmount: g.targetAmount,
        currentAmount: g.currentAmount,
        progress: g.getProgress(),
        remaining: g.getRemaining(),
        isComplete: g.isComplete(),
        daysRemaining: g.getDaysRemaining(),
        monthlyNeeded: g.getMonthlyTargetNeeded(),
        onTrack: g.isOnTrack(),
        deadline: g.deadline,
        priority: g.priority,
      })),
    };
  }

  getGoalById(id) {
    return this.store.goals.find(g => g.id === id);
  }
}

module.exports = { GoalsEngine };
