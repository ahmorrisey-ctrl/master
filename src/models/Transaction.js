const { generateId } = require('../utils/id');

const TRANSACTION_TYPES = {
  INCOME: 'income',
  EXPENSE: 'expense',
  TRANSFER: 'transfer',
  INVESTMENT_BUY: 'investment_buy',
  INVESTMENT_SELL: 'investment_sell',
  DIVIDEND: 'dividend',
  INTEREST: 'interest',
  PAYMENT: 'payment',
  REFUND: 'refund',
};

const CATEGORIES = {
  // Income
  SALARY: 'Salary',
  FREELANCE: 'Freelance',
  DIVIDENDS: 'Dividends',
  INTEREST_INCOME: 'Interest Income',
  CAPITAL_GAINS: 'Capital Gains',
  OTHER_INCOME: 'Other Income',

  // Expenses
  HOUSING: 'Housing',
  UTILITIES: 'Utilities',
  GROCERIES: 'Groceries',
  DINING: 'Dining Out',
  TRANSPORTATION: 'Transportation',
  GAS: 'Gas',
  INSURANCE: 'Insurance',
  HEALTHCARE: 'Healthcare',
  ENTERTAINMENT: 'Entertainment',
  SHOPPING: 'Shopping',
  SUBSCRIPTIONS: 'Subscriptions',
  TRAVEL: 'Travel',
  EDUCATION: 'Education',
  PERSONAL_CARE: 'Personal Care',
  GIFTS: 'Gifts & Donations',
  TAXES: 'Taxes',
  FEES: 'Fees & Charges',
  OTHER_EXPENSE: 'Other Expense',

  // Transfers / Investment
  TRANSFER: 'Transfer',
  INVESTMENT: 'Investment',
  CREDIT_PAYMENT: 'Credit Card Payment',
};

class Transaction {
  constructor({ id, date, description, amount, type, category, accountId, toAccountId, tags, notes }) {
    this.id = id || generateId();
    this.date = date || new Date().toISOString().split('T')[0];
    this.description = description;
    this.amount = amount;
    this.type = type;
    this.category = category;
    this.accountId = accountId;
    this.toAccountId = toAccountId || null;
    this.tags = tags || [];
    this.notes = notes || '';
  }

  isExpense() {
    return this.type === TRANSACTION_TYPES.EXPENSE;
  }

  isIncome() {
    return this.type === TRANSACTION_TYPES.INCOME || this.type === TRANSACTION_TYPES.DIVIDEND;
  }

  toJSON() {
    return {
      id: this.id,
      date: this.date,
      description: this.description,
      amount: this.amount,
      type: this.type,
      category: this.category,
      accountId: this.accountId,
      toAccountId: this.toAccountId,
      tags: this.tags,
      notes: this.notes,
    };
  }

  static fromJSON(data) {
    return new Transaction(data);
  }
}

module.exports = { Transaction, TRANSACTION_TYPES, CATEGORIES };
