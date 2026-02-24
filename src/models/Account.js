const { generateId } = require('../utils/id');

const ACCOUNT_TYPES = {
  CHECKING: 'checking',
  SAVINGS: 'savings',
  CREDIT_CARD: 'credit_card',
  BROKERAGE: 'brokerage',
  RETIREMENT: 'retirement',
  INVESTMENT: 'investment',
};

const INSTITUTIONS = {
  ROBINHOOD: 'Robinhood',
  CHASE: 'Chase',
  VANGUARD: 'Vanguard',
  AMEX: 'Amex',
};

class Account {
  constructor({ id, name, institution, type, balance, holdings, creditLimit, apr, lastUpdated, notes }) {
    this.id = id || generateId();
    this.name = name;
    this.institution = institution;
    this.type = type;
    this.balance = balance || 0;
    this.holdings = holdings || [];
    this.creditLimit = creditLimit || null;
    this.apr = apr || null;
    this.lastUpdated = lastUpdated || new Date().toISOString();
    this.notes = notes || '';
  }

  isAsset() {
    return this.type !== ACCOUNT_TYPES.CREDIT_CARD;
  }

  isLiability() {
    return this.type === ACCOUNT_TYPES.CREDIT_CARD;
  }

  getNetValue() {
    if (this.type === ACCOUNT_TYPES.CREDIT_CARD) {
      return -Math.abs(this.balance);
    }
    if (this.holdings && this.holdings.length > 0) {
      return this.holdings.reduce((sum, h) => sum + (h.shares * h.currentPrice), 0);
    }
    return this.balance;
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      institution: this.institution,
      type: this.type,
      balance: this.balance,
      holdings: this.holdings,
      creditLimit: this.creditLimit,
      apr: this.apr,
      lastUpdated: this.lastUpdated,
      notes: this.notes,
    };
  }

  static fromJSON(data) {
    return new Account(data);
  }
}

module.exports = { Account, ACCOUNT_TYPES, INSTITUTIONS };
