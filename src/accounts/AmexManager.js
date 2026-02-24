const { Account, ACCOUNT_TYPES, INSTITUTIONS } = require('../models/Account');

class AmexManager {
  constructor(dataStore) {
    this.store = dataStore;
    this.institution = INSTITUTIONS.AMEX;
  }

  getAccounts() {
    return this.store.getAccountsByInstitution(this.institution);
  }

  createCreditCardAccount({ name, balance, creditLimit, apr, rewardsRate }) {
    const account = new Account({
      name: name || 'Amex Credit Card',
      institution: this.institution,
      type: ACCOUNT_TYPES.CREDIT_CARD,
      balance: balance || 0,
      creditLimit: creditLimit || 15000,
      apr: apr || 22.99,
      notes: rewardsRate ? `Rewards: ${rewardsRate}` : '',
    });
    return this.store.addAccount(account);
  }

  getStatementSummary(accountId, month) {
    const account = this.store.getAccount(accountId);
    if (!account) return null;

    const transactions = this.store.getTransactions({ accountId }).filter(t => t.date.startsWith(month));
    const charges = transactions.filter(t => t.type === 'expense');
    const payments = transactions.filter(t => t.type === 'payment' || t.type === 'refund');

    const totalCharges = charges.reduce((sum, t) => sum + t.amount, 0);
    const totalPayments = payments.reduce((sum, t) => sum + t.amount, 0);

    const byCategory = {};
    for (const tx of charges) {
      const cat = tx.category || 'Other';
      if (!byCategory[cat]) byCategory[cat] = 0;
      byCategory[cat] += tx.amount;
    }

    return {
      currentBalance: account.balance,
      creditLimit: account.creditLimit,
      availableCredit: (account.creditLimit || 0) - account.balance,
      utilizationPercent: account.creditLimit ? (account.balance / account.creditLimit) * 100 : 0,
      monthlyCharges: totalCharges,
      monthlyPayments: totalPayments,
      transactionCount: transactions.length,
      spendingByCategory: byCategory,
      apr: account.apr,
    };
  }

  getCreditUtilization() {
    const accounts = this.getAccounts();
    const totalBalance = accounts.reduce((sum, a) => sum + a.balance, 0);
    const totalLimit = accounts.reduce((sum, a) => sum + (a.creditLimit || 0), 0);
    return {
      totalBalance,
      totalLimit,
      utilization: totalLimit > 0 ? (totalBalance / totalLimit) * 100 : 0,
      accounts: accounts.map(a => ({
        name: a.name,
        balance: a.balance,
        limit: a.creditLimit,
        utilization: a.creditLimit ? (a.balance / a.creditLimit) * 100 : 0,
      })),
    };
  }
}

module.exports = { AmexManager };
