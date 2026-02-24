const { Account, ACCOUNT_TYPES, INSTITUTIONS } = require('../models/Account');

class RobinhoodManager {
  constructor(dataStore) {
    this.store = dataStore;
    this.institution = INSTITUTIONS.ROBINHOOD;
  }

  getAccounts() {
    return this.store.getAccountsByInstitution(this.institution);
  }

  createBrokerageAccount({ name, balance, holdings }) {
    const account = new Account({
      name: name || 'Robinhood Brokerage',
      institution: this.institution,
      type: ACCOUNT_TYPES.BROKERAGE,
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

  addHolding(accountId, { symbol, shares, avgCost, currentPrice }) {
    const account = this.store.getAccount(accountId);
    if (!account) return null;

    const existing = account.holdings.find(h => h.symbol === symbol);
    if (existing) {
      const totalShares = existing.shares + shares;
      existing.avgCost = ((existing.avgCost * existing.shares) + (avgCost * shares)) / totalShares;
      existing.shares = totalShares;
      existing.currentPrice = currentPrice || existing.currentPrice;
    } else {
      account.holdings.push({ symbol, shares, avgCost, currentPrice: currentPrice || avgCost });
    }

    account.balance = account.holdings.reduce((sum, h) => sum + (h.shares * h.currentPrice), 0);
    account.lastUpdated = new Date().toISOString();
    this.store.save();
    return account;
  }

  getPortfolioSummary(accountId) {
    const account = this.store.getAccount(accountId);
    if (!account) return null;

    const totalValue = account.holdings.reduce((sum, h) => sum + (h.shares * h.currentPrice), 0);
    const totalCost = account.holdings.reduce((sum, h) => sum + (h.shares * h.avgCost), 0);
    const totalGain = totalValue - totalCost;
    const gainPercent = totalCost > 0 ? (totalGain / totalCost) * 100 : 0;

    return {
      holdings: account.holdings.map(h => ({
        symbol: h.symbol,
        shares: h.shares,
        avgCost: h.avgCost,
        currentPrice: h.currentPrice,
        marketValue: h.shares * h.currentPrice,
        gain: (h.currentPrice - h.avgCost) * h.shares,
        gainPercent: h.avgCost > 0 ? ((h.currentPrice - h.avgCost) / h.avgCost) * 100 : 0,
        allocation: totalValue > 0 ? ((h.shares * h.currentPrice) / totalValue) * 100 : 0,
      })),
      totalValue,
      totalCost,
      totalGain,
      gainPercent,
    };
  }
}

module.exports = { RobinhoodManager };
