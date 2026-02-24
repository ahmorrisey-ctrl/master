const { generateId } = require('../utils/id');

class NetWorthSnapshot {
  constructor({ id, date, accounts, totalAssets, totalLiabilities, netWorth }) {
    this.id = id || generateId();
    this.date = date || new Date().toISOString().split('T')[0];
    this.accounts = accounts || [];
    this.totalAssets = totalAssets || 0;
    this.totalLiabilities = totalLiabilities || 0;
    this.netWorth = netWorth || 0;
  }

  toJSON() {
    return {
      id: this.id,
      date: this.date,
      accounts: this.accounts,
      totalAssets: this.totalAssets,
      totalLiabilities: this.totalLiabilities,
      netWorth: this.netWorth,
    };
  }

  static fromJSON(data) {
    return new NetWorthSnapshot(data);
  }
}

module.exports = { NetWorthSnapshot };
