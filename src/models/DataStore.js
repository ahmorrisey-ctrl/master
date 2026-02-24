const { loadJSON, saveJSON } = require('../utils/storage');
const { Account } = require('./Account');
const { Transaction } = require('./Transaction');
const { Budget, BudgetCategory } = require('./Budget');
const { NetWorthSnapshot } = require('./NetWorthSnapshot');

class DataStore {
  constructor() {
    this.accounts = [];
    this.transactions = [];
    this.budgets = [];
    this.snapshots = [];
    this.settings = {};
  }

  load() {
    const accountsData = loadJSON('accounts.json');
    if (accountsData) {
      this.accounts = accountsData.map(a => Account.fromJSON(a));
    }

    const txData = loadJSON('transactions.json');
    if (txData) {
      this.transactions = txData.map(t => Transaction.fromJSON(t));
    }

    const budgetData = loadJSON('budgets.json');
    if (budgetData) {
      this.budgets = budgetData.map(b => Budget.fromJSON(b));
    }

    const snapshotData = loadJSON('snapshots.json');
    if (snapshotData) {
      this.snapshots = snapshotData.map(s => NetWorthSnapshot.fromJSON(s));
    }

    const settings = loadJSON('settings.json');
    if (settings) {
      this.settings = settings;
    }
  }

  save() {
    saveJSON('accounts.json', this.accounts.map(a => a.toJSON()));
    saveJSON('transactions.json', this.transactions.map(t => t.toJSON()));
    saveJSON('budgets.json', this.budgets.map(b => b.toJSON()));
    saveJSON('snapshots.json', this.snapshots.map(s => s.toJSON()));
    saveJSON('settings.json', this.settings);
  }

  // Account operations
  addAccount(account) {
    this.accounts.push(account);
    this.save();
    return account;
  }

  getAccount(id) {
    return this.accounts.find(a => a.id === id);
  }

  getAccountsByInstitution(institution) {
    return this.accounts.filter(a => a.institution === institution);
  }

  updateAccount(id, updates) {
    const account = this.getAccount(id);
    if (!account) return null;
    Object.assign(account, updates, { lastUpdated: new Date().toISOString() });
    this.save();
    return account;
  }

  removeAccount(id) {
    this.accounts = this.accounts.filter(a => a.id !== id);
    this.transactions = this.transactions.filter(t => t.accountId !== id && t.toAccountId !== id);
    this.save();
  }

  // Transaction operations
  addTransaction(transaction) {
    this.transactions.push(transaction);
    this._updateAccountBalance(transaction);
    this.save();
    return transaction;
  }

  getTransactions({ accountId, startDate, endDate, category, type } = {}) {
    let txs = [...this.transactions];
    if (accountId) txs = txs.filter(t => t.accountId === accountId || t.toAccountId === accountId);
    if (startDate) txs = txs.filter(t => t.date >= startDate);
    if (endDate) txs = txs.filter(t => t.date <= endDate);
    if (category) txs = txs.filter(t => t.category === category);
    if (type) txs = txs.filter(t => t.type === type);
    return txs.sort((a, b) => b.date.localeCompare(a.date));
  }

  getTransactionsByMonth(month) {
    return this.transactions
      .filter(t => t.date.startsWith(month))
      .sort((a, b) => b.date.localeCompare(a.date));
  }

  _updateAccountBalance(tx) {
    const account = this.getAccount(tx.accountId);
    if (!account) return;

    switch (tx.type) {
      case 'income':
      case 'dividend':
      case 'interest':
      case 'refund':
        account.balance += tx.amount;
        break;
      case 'expense':
        if (account.type === 'credit_card') {
          account.balance += tx.amount; // increases balance owed
        } else {
          account.balance -= tx.amount;
        }
        break;
      case 'transfer':
        account.balance -= tx.amount;
        if (tx.toAccountId) {
          const toAccount = this.getAccount(tx.toAccountId);
          if (toAccount) toAccount.balance += tx.amount;
        }
        break;
      case 'payment':
        account.balance -= tx.amount;
        if (tx.toAccountId) {
          const toAccount = this.getAccount(tx.toAccountId);
          if (toAccount) toAccount.balance -= tx.amount; // reduce credit card balance
        }
        break;
      case 'investment_buy':
        account.balance -= tx.amount;
        break;
      case 'investment_sell':
        account.balance += tx.amount;
        break;
    }
    account.lastUpdated = new Date().toISOString();
  }

  // Budget operations
  addBudget(budget) {
    this.budgets.push(budget);
    this.save();
    return budget;
  }

  getBudget(month) {
    return this.budgets.find(b => b.month === month);
  }

  getCurrentBudget() {
    const now = new Date();
    const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    return this.getBudget(month);
  }

  updateBudget(month, updates) {
    const budget = this.getBudget(month);
    if (!budget) return null;
    Object.assign(budget, updates);
    this.save();
    return budget;
  }

  // Snapshot operations
  addSnapshot(snapshot) {
    this.snapshots.push(snapshot);
    this.save();
    return snapshot;
  }

  getSnapshots(limit) {
    const sorted = [...this.snapshots].sort((a, b) => b.date.localeCompare(a.date));
    return limit ? sorted.slice(0, limit) : sorted;
  }

  getLatestSnapshot() {
    return this.getSnapshots(1)[0] || null;
  }
}

module.exports = { DataStore };
