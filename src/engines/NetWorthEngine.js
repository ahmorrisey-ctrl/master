const { NetWorthSnapshot } = require('../models/NetWorthSnapshot');

class NetWorthEngine {
  constructor(dataStore) {
    this.store = dataStore;
  }

  calculateCurrentNetWorth() {
    const accounts = this.store.accounts;
    let totalAssets = 0;
    let totalLiabilities = 0;
    const accountDetails = [];

    for (const account of accounts) {
      const value = account.getNetValue();

      if (account.isAsset()) {
        totalAssets += Math.abs(value);
      } else {
        totalLiabilities += Math.abs(value);
      }

      accountDetails.push({
        id: account.id,
        name: account.name,
        institution: account.institution,
        type: account.type,
        value: value,
        isAsset: account.isAsset(),
      });
    }

    return {
      totalAssets,
      totalLiabilities,
      netWorth: totalAssets - totalLiabilities,
      accounts: accountDetails,
    };
  }

  takeSnapshot() {
    const current = this.calculateCurrentNetWorth();
    const snapshot = new NetWorthSnapshot({
      date: new Date().toISOString().split('T')[0],
      accounts: current.accounts,
      totalAssets: current.totalAssets,
      totalLiabilities: current.totalLiabilities,
      netWorth: current.netWorth,
    });
    return this.store.addSnapshot(snapshot);
  }

  getNetWorthHistory(limit) {
    return this.store.getSnapshots(limit);
  }

  getNetWorthChange(period = 'month') {
    const snapshots = this.store.getSnapshots();
    if (snapshots.length < 2) {
      const current = this.calculateCurrentNetWorth();
      return {
        current: current.netWorth,
        previous: current.netWorth,
        change: 0,
        changePercent: 0,
        period,
      };
    }

    const now = new Date();
    let cutoffDate;
    switch (period) {
      case 'week':
        cutoffDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case 'month':
        cutoffDate = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
        break;
      case 'quarter':
        cutoffDate = new Date(now.getFullYear(), now.getMonth() - 3, now.getDate());
        break;
      case 'year':
        cutoffDate = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
        break;
      default:
        cutoffDate = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
    }

    const cutoff = cutoffDate.toISOString().split('T')[0];
    const previous = snapshots.find(s => s.date <= cutoff) || snapshots[snapshots.length - 1];
    const current = snapshots[0];

    const change = current.netWorth - previous.netWorth;
    const changePercent = previous.netWorth !== 0 ? (change / Math.abs(previous.netWorth)) * 100 : 0;

    return {
      current: current.netWorth,
      previous: previous.netWorth,
      change,
      changePercent,
      period,
      currentDate: current.date,
      previousDate: previous.date,
    };
  }

  getBreakdownByInstitution() {
    const accounts = this.store.accounts;
    const byInstitution = {};

    for (const account of accounts) {
      const inst = account.institution;
      if (!byInstitution[inst]) {
        byInstitution[inst] = { assets: 0, liabilities: 0, accounts: [] };
      }

      const value = account.getNetValue();
      if (account.isAsset()) {
        byInstitution[inst].assets += Math.abs(value);
      } else {
        byInstitution[inst].liabilities += Math.abs(value);
      }

      byInstitution[inst].accounts.push({
        name: account.name,
        type: account.type,
        value: value,
      });
    }

    const total = Object.values(byInstitution).reduce(
      (sum, inst) => sum + inst.assets - inst.liabilities, 0
    );

    return Object.entries(byInstitution).map(([institution, data]) => ({
      institution,
      assets: data.assets,
      liabilities: data.liabilities,
      netValue: data.assets - data.liabilities,
      percent: total > 0 ? ((data.assets - data.liabilities) / total) * 100 : 0,
      accounts: data.accounts,
    })).sort((a, b) => b.netValue - a.netValue);
  }

  getBreakdownByType() {
    const accounts = this.store.accounts;
    const byType = {};

    for (const account of accounts) {
      const type = account.type;
      if (!byType[type]) byType[type] = { total: 0, count: 0 };
      byType[type].total += account.getNetValue();
      byType[type].count++;
    }

    const netWorth = Object.values(byType).reduce((sum, t) => sum + t.total, 0);

    return Object.entries(byType).map(([type, data]) => ({
      type,
      total: data.total,
      count: data.count,
      percent: netWorth !== 0 ? (data.total / netWorth) * 100 : 0,
    })).sort((a, b) => b.total - a.total);
  }

  getAssetAllocation() {
    const accounts = this.store.accounts;
    const allocation = {};

    for (const account of accounts) {
      if (!account.isAsset()) continue;
      if (account.holdings && account.holdings.length > 0) {
        for (const h of account.holdings) {
          const type = h.type || 'Stocks';
          if (!allocation[type]) allocation[type] = 0;
          allocation[type] += h.shares * h.currentPrice;
        }
      } else {
        const type = account.type === 'checking' || account.type === 'savings' ? 'Cash' : 'Other';
        if (!allocation[type]) allocation[type] = 0;
        allocation[type] += account.balance;
      }
    }

    const total = Object.values(allocation).reduce((sum, v) => sum + v, 0);
    return Object.entries(allocation).map(([type, value]) => ({
      type,
      value,
      percent: total > 0 ? (value / total) * 100 : 0,
    })).sort((a, b) => b.value - a.value);
  }

  forecast(months = 12) {
    const snapshots = this.store.getSnapshots();
    const current = this.calculateCurrentNetWorth();

    if (snapshots.length < 2) {
      // Not enough data, project flat
      const projections = [];
      const now = new Date();
      for (let i = 1; i <= months; i++) {
        const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
        projections.push({
          date: d.toISOString().split('T')[0],
          projected: current.netWorth,
          monthsOut: i,
        });
      }
      return { currentNetWorth: current.netWorth, avgMonthlyGrowth: 0, projections };
    }

    // Calculate average monthly growth from snapshot history
    const sorted = [...snapshots].sort((a, b) => a.date.localeCompare(b.date));
    const monthlyChanges = [];
    for (let i = 1; i < sorted.length; i++) {
      monthlyChanges.push(sorted[i].netWorth - sorted[i - 1].netWorth);
    }

    const avgMonthlyGrowth = monthlyChanges.reduce((s, v) => s + v, 0) / monthlyChanges.length;

    const projections = [];
    const now = new Date();
    for (let i = 1; i <= months; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      projections.push({
        date: d.toISOString().split('T')[0],
        projected: current.netWorth + (avgMonthlyGrowth * i),
        monthsOut: i,
      });
    }

    return {
      currentNetWorth: current.netWorth,
      avgMonthlyGrowth,
      projections,
    };
  }

  getMilestones() {
    const current = this.calculateCurrentNetWorth();
    const forecast = this.forecast(60); // 5 years
    const nw = current.netWorth;
    const milestoneValues = [];

    // Generate round-number milestones ahead
    const base = Math.pow(10, Math.floor(Math.log10(Math.max(nw, 1))));
    const step = base;
    let m = Math.ceil(nw / step) * step;
    for (let i = 0; i < 5; i++) {
      if (m > nw) milestoneValues.push(m);
      m += step;
    }

    // Also add common milestone targets
    for (const target of [100000, 250000, 500000, 750000, 1000000]) {
      if (target > nw && !milestoneValues.includes(target)) {
        milestoneValues.push(target);
      }
    }
    milestoneValues.sort((a, b) => a - b);

    const milestones = [];
    for (const target of milestoneValues.slice(0, 5)) {
      if (forecast.avgMonthlyGrowth <= 0) {
        milestones.push({ target, monthsAway: null, estimatedDate: null });
        continue;
      }
      const monthsAway = Math.ceil((target - nw) / forecast.avgMonthlyGrowth);
      const estDate = new Date();
      estDate.setMonth(estDate.getMonth() + monthsAway);
      milestones.push({
        target,
        monthsAway,
        estimatedDate: estDate.toISOString().split('T')[0],
      });
    }

    return milestones;
  }
}

module.exports = { NetWorthEngine };
