const { currency, percentage, monthKey, table, colorize, pad, sparkline } = require('../utils/format');

class ReportEngine {
  constructor(dataStore, budgetEngine, netWorthEngine) {
    this.store = dataStore;
    this.budget = budgetEngine;
    this.netWorth = netWorthEngine;
  }

  generateMonthlyReport(month) {
    const budgetReport = this.budget.getMonthlyReport(month);
    const categoryBreakdown = this.budget.getCategoryBreakdown(month);
    const incomeBreakdown = this.budget.getIncomeBreakdown(month);
    const topExpenses = this.budget.getTopExpenses(month, 10);
    const nwBreakdown = this.netWorth.getBreakdownByInstitution();

    return {
      month,
      budget: budgetReport,
      categories: categoryBreakdown,
      income: incomeBreakdown,
      topExpenses,
      netWorthByInstitution: nwBreakdown,
    };
  }

  generateYearlyReport(year) {
    const months = [];
    for (let m = 1; m <= 12; m++) {
      months.push(`${year}-${String(m).padStart(2, '0')}`);
    }

    const monthlyData = months.map(month => {
      const txs = this.store.getTransactionsByMonth(month);
      const income = txs.filter(t => t.isIncome()).reduce((s, t) => s + t.amount, 0);
      const expenses = txs.filter(t => t.isExpense()).reduce((s, t) => s + t.amount, 0);
      return { month, income, expenses, net: income - expenses, txCount: txs.length };
    });

    const totalIncome = monthlyData.reduce((s, m) => s + m.income, 0);
    const totalExpenses = monthlyData.reduce((s, m) => s + m.expenses, 0);

    return {
      year,
      months: monthlyData,
      totalIncome,
      totalExpenses,
      totalNet: totalIncome - totalExpenses,
      avgMonthlyIncome: totalIncome / 12,
      avgMonthlyExpenses: totalExpenses / 12,
      savingsRate: totalIncome > 0 ? ((totalIncome - totalExpenses) / totalIncome) * 100 : 0,
    };
  }

  generateSpendingReport(startDate, endDate) {
    const txs = this.store.getTransactions({ startDate, endDate })
      .filter(t => t.isExpense());

    const byCategory = {};
    const byAccount = {};
    const byDay = {};
    let total = 0;

    for (const tx of txs) {
      total += tx.amount;

      const cat = tx.category || 'Other';
      if (!byCategory[cat]) byCategory[cat] = 0;
      byCategory[cat] += tx.amount;

      const acc = this.store.getAccount(tx.accountId);
      const accName = acc ? acc.name : 'Unknown';
      if (!byAccount[accName]) byAccount[accName] = 0;
      byAccount[accName] += tx.amount;

      if (!byDay[tx.date]) byDay[tx.date] = 0;
      byDay[tx.date] += tx.amount;
    }

    return {
      startDate,
      endDate,
      total,
      transactionCount: txs.length,
      avgPerTransaction: txs.length > 0 ? total / txs.length : 0,
      byCategory: Object.entries(byCategory)
        .map(([cat, amount]) => ({ category: cat, amount, percent: (amount / total) * 100 }))
        .sort((a, b) => b.amount - a.amount),
      byAccount: Object.entries(byAccount)
        .map(([account, amount]) => ({ account, amount, percent: (amount / total) * 100 }))
        .sort((a, b) => b.amount - a.amount),
      dailySpending: Object.entries(byDay)
        .map(([date, amount]) => ({ date, amount }))
        .sort((a, b) => a.date.localeCompare(b.date)),
    };
  }

  renderSpendingReport(report) {
    const lines = [];
    lines.push(colorize(`\n  ── SPENDING REPORT: ${report.startDate} to ${report.endDate} ──`, 'blue'));
    lines.push('');
    lines.push(`    Total Spending:    ${colorize(currency(report.total), 'red')}`);
    lines.push(`    Transactions:      ${report.transactionCount}`);
    lines.push(`    Avg/Transaction:   ${currency(report.avgPerTransaction)}`);
    lines.push('');

    if (report.byCategory.length > 0) {
      lines.push('    ' + colorize('By Category:', 'bold'));
      for (const c of report.byCategory) {
        const bar = '█'.repeat(Math.round(c.percent / 3));
        lines.push(`      ${pad(c.category, 20)} ${pad(currency(c.amount), 12, 'right')} ${pad(c.percent.toFixed(1) + '%', 7, 'right')} ${colorize(bar, 'cyan')}`);
      }
      lines.push('');
    }

    if (report.byAccount.length > 0) {
      lines.push('    ' + colorize('By Account:', 'bold'));
      for (const a of report.byAccount) {
        lines.push(`      ${pad(a.account, 25)} ${pad(currency(a.amount), 12, 'right')} ${pad(a.percent.toFixed(1) + '%', 7, 'right')}`);
      }
      lines.push('');
    }

    if (report.dailySpending.length > 1) {
      const values = report.dailySpending.map(d => d.amount);
      lines.push('    ' + colorize('Daily Trend: ', 'bold') + colorize(sparkline(values), 'cyan'));
      lines.push('');
    }

    return lines.join('\n');
  }

  renderYearlyReport(report) {
    const lines = [];
    lines.push(colorize(`\n  ── YEARLY REPORT: ${report.year} ──`, 'blue'));
    lines.push('');
    lines.push(`    Total Income:      ${colorize(currency(report.totalIncome), 'green')}`);
    lines.push(`    Total Expenses:    ${colorize(currency(report.totalExpenses), 'red')}`);
    lines.push(`    Net Savings:       ${colorize(currency(report.totalNet), report.totalNet >= 0 ? 'green' : 'red')}`);
    lines.push(`    Savings Rate:      ${report.savingsRate.toFixed(1)}%`);
    lines.push('');

    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    lines.push('    ' + colorize(pad('Month', 8), 'bold') + colorize(pad('Income', 14, 'right'), 'bold') + colorize(pad('Expenses', 14, 'right'), 'bold') + colorize(pad('Net', 14, 'right'), 'bold'));
    lines.push('    ' + colorize('─'.repeat(52), 'gray'));

    for (let i = 0; i < report.months.length; i++) {
      const m = report.months[i];
      if (m.txCount === 0) continue;
      const netColor = m.net >= 0 ? 'green' : 'red';
      lines.push(
        '    ' +
        pad(monthNames[i], 8) +
        colorize(pad(currency(m.income), 14, 'right'), 'green') +
        colorize(pad(currency(m.expenses), 14, 'right'), 'red') +
        colorize(pad(currency(m.net), 14, 'right'), netColor)
      );
    }
    lines.push('');

    const incomeValues = report.months.map(m => m.income);
    const expenseValues = report.months.map(m => m.expenses);
    lines.push('    Income Trend:   ' + colorize(sparkline(incomeValues), 'green'));
    lines.push('    Expense Trend:  ' + colorize(sparkline(expenseValues), 'red'));
    lines.push('');

    return lines.join('\n');
  }

  exportToCSV(transactions) {
    const headers = ['Date', 'Description', 'Amount', 'Type', 'Category', 'Account', 'Notes'];
    const rows = transactions.map(tx => {
      const account = this.store.getAccount(tx.accountId);
      return [
        tx.date,
        `"${tx.description}"`,
        tx.amount.toFixed(2),
        tx.type,
        tx.category || '',
        account ? account.name : '',
        `"${tx.notes || ''}"`,
      ].join(',');
    });
    return [headers.join(','), ...rows].join('\n');
  }

  importFromCSV(csvContent) {
    const lines = csvContent.trim().split('\n');
    if (lines.length < 2) return [];

    const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
    const transactions = [];

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].match(/(".*?"|[^,]+)/g) || [];
      const row = {};
      headers.forEach((h, idx) => {
        row[h] = (values[idx] || '').replace(/^"|"$/g, '').trim();
      });

      if (row.date && row.amount) {
        transactions.push({
          date: row.date,
          description: row.description || 'Imported transaction',
          amount: parseFloat(row.amount) || 0,
          type: row.type || 'expense',
          category: row.category || 'Other Expense',
          notes: row.notes || 'Imported',
        });
      }
    }

    return transactions;
  }
}

module.exports = { ReportEngine };
