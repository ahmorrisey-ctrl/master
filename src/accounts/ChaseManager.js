const { Account, ACCOUNT_TYPES, INSTITUTIONS } = require('../models/Account');

class ChaseManager {
  constructor(dataStore) {
    this.store = dataStore;
    this.institution = INSTITUTIONS.CHASE;
  }

  getAccounts() {
    return this.store.getAccountsByInstitution(this.institution);
  }

  createCheckingAccount({ name, balance }) {
    const account = new Account({
      name: name || 'Chase Checking',
      institution: this.institution,
      type: ACCOUNT_TYPES.CHECKING,
      balance: balance || 0,
    });
    return this.store.addAccount(account);
  }

  createSavingsAccount({ name, balance }) {
    const account = new Account({
      name: name || 'Chase Savings',
      institution: this.institution,
      type: ACCOUNT_TYPES.SAVINGS,
      balance: balance || 0,
    });
    return this.store.addAccount(account);
  }

  createCreditCardAccount({ name, balance, creditLimit, apr }) {
    const account = new Account({
      name: name || 'Chase Credit Card',
      institution: this.institution,
      type: ACCOUNT_TYPES.CREDIT_CARD,
      balance: balance || 0,
      creditLimit: creditLimit || 10000,
      apr: apr || 24.99,
    });
    return this.store.addAccount(account);
  }

  getAccountSummary() {
    const accounts = this.getAccounts();
    const checking = accounts.filter(a => a.type === ACCOUNT_TYPES.CHECKING);
    const savings = accounts.filter(a => a.type === ACCOUNT_TYPES.SAVINGS);
    const cards = accounts.filter(a => a.type === ACCOUNT_TYPES.CREDIT_CARD);

    return {
      checking: {
        count: checking.length,
        totalBalance: checking.reduce((sum, a) => sum + a.balance, 0),
      },
      savings: {
        count: savings.length,
        totalBalance: savings.reduce((sum, a) => sum + a.balance, 0),
      },
      creditCards: {
        count: cards.length,
        totalBalance: cards.reduce((sum, a) => sum + a.balance, 0),
        totalCreditLimit: cards.reduce((sum, a) => sum + (a.creditLimit || 0), 0),
      },
      totalDeposits: checking.reduce((sum, a) => sum + a.balance, 0) + savings.reduce((sum, a) => sum + a.balance, 0),
    };
  }
}

module.exports = { ChaseManager };
