const { Account, ACCOUNT_TYPES, INSTITUTIONS } = require('../models/Account');

class VanguardManager {
  constructor(dataStore) {
    this.store = dataStore;
    this.institution = INSTITUTIONS.VANGUARD;
  }

  getAccounts() {
    return this.store.getAccountsByInstitution(this.institution);
  }

  createRetirementAccount({ name, balance, holdings, accountSubtype }) {
    const account = new Account({
      name: name || 'Vanguard 401k',
      institution: this.institution,
      type: ACCOUNT_TYPES.RETIREMENT,
      balance: balance || 0,
      holdings: holdings || [],
      notes: accountSubtype || '401k', // 401k, IRA, Roth IRA, etc.
    });
    return this.store.addAccount(account);
  }

  createInvestmentAccount({ name, balance, holdings }) {
    const account = new Account({
      name: name || 'Vanguard Brokerage',
      institution: this.institution,
      type: ACCOUNT_TYPES.INVESTMENT,
      balance: balance || 0,
      holdings: holdings || [],
    });
    return this.store.addAccount(account);
  }

  updateHoldings(accountId, holdings) {
    const account = this.store.getAccount(accountId);
    if (!account || account.institution !== this.institution) return null;
    account.holdings = holdings;
    account.balance = holdings.reduce((sum, h) => sum + (h.shares * h.currentPrice), 0);
    account.lastUpdated = new Date().toISOString();
    this.store.save();
    return account;
  }

  getPortfolioSummary(accountId) {
    const account = this.store.getAccount(accountId);
    if (!account) return null;

    const totalValue = account.holdings.reduce((sum, h) => sum + (h.shares * h.currentPrice), 0);
    const totalCost = account.holdings.reduce((sum, h) => sum + (h.shares * h.avgCost), 0);

    const byType = {};
    for (const h of account.holdings) {
      const type = h.type || 'Stock';
      if (!byType[type]) byType[type] = 0;
      byType[type] += h.shares * h.currentPrice;
    }

    return {
      holdings: account.holdings.map(h => ({
        symbol: h.symbol,
        name: h.name || h.symbol,
        shares: h.shares,
        avgCost: h.avgCost,
        currentPrice: h.currentPrice,
        marketValue: h.shares * h.currentPrice,
        gain: (h.currentPrice - h.avgCost) * h.shares,
        gainPercent: h.avgCost > 0 ? ((h.currentPrice - h.avgCost) / h.avgCost) * 100 : 0,
        type: h.type || 'Stock',
      })),
      totalValue,
      totalCost,
      totalGain: totalValue - totalCost,
      gainPercent: totalCost > 0 ? ((totalValue - totalCost) / totalCost) * 100 : 0,
      assetAllocation: byType,
      accountSubtype: account.notes,
    };
  }

  getTotalRetirementValue() {
    return this.getAccounts()
      .filter(a => a.type === ACCOUNT_TYPES.RETIREMENT)
      .reduce((sum, a) => sum + a.getNetValue(), 0);
  }
}

module.exports = { VanguardManager };
