const { currency, percentage, colorize, progressBar, sparkline, table, pad, monthKey } = require('../utils/format');

class Dashboard {
  constructor(dataStore, budgetEngine, netWorthEngine, managers, goalsEngine, recurringEngine) {
    this.store = dataStore;
    this.budget = budgetEngine;
    this.netWorth = netWorthEngine;
    this.managers = managers;
    this.goals = goalsEngine || null;
    this.recurring = recurringEngine || null;
  }

  renderHeader() {
    const lines = [];
    lines.push('');
    lines.push(colorize('  ╔══════════════════════════════════════════════════════════════════╗', 'cyan'));
    lines.push(colorize('  ║', 'cyan') + colorize('       💰 BUDGET & NET WORTH TRACKER                          ', 'bold') + colorize('║', 'cyan'));
    lines.push(colorize('  ║', 'cyan') + colorize('       Robinhood • Chase • Vanguard • Amex                    ', 'gray') + colorize('║', 'cyan'));
    lines.push(colorize('  ╚══════════════════════════════════════════════════════════════════╝', 'cyan'));
    lines.push('');
    return lines.join('\n');
  }

  renderNetWorthSummary() {
    const nw = this.netWorth.calculateCurrentNetWorth();
    const change = this.netWorth.getNetWorthChange('month');
    const lines = [];

    lines.push(colorize('  ── NET WORTH OVERVIEW ───────────────────────────────────────────', 'blue'));
    lines.push('');

    const nwColor = nw.netWorth >= 0 ? 'green' : 'red';
    lines.push('    Net Worth:       ' + colorize(currency(nw.netWorth), nwColor) + colorize(' ' + (nwColor === 'green' ? '▲' : '▼'), nwColor));
    lines.push('    Total Assets:    ' + colorize(currency(nw.totalAssets), 'green'));
    lines.push('    Total Debt:      ' + colorize(currency(nw.totalLiabilities), 'red'));
    lines.push('');

    if (change.change !== 0) {
      const changeColor = change.change >= 0 ? 'green' : 'red';
      const arrow = change.change >= 0 ? '▲' : '▼';
      lines.push('    Monthly Change:  ' +
        colorize(`${arrow} ${currency(Math.abs(change.change))} (${change.changePercent.toFixed(1)}%)`, changeColor));
      lines.push('');
    }

    // Sparkline of net worth history
    const snapshots = this.netWorth.getNetWorthHistory(12);
    if (snapshots.length > 1) {
      const values = snapshots.reverse().map(s => s.netWorth);
      lines.push('    12-Month Trend:  ' + colorize(sparkline(values), 'cyan'));
      lines.push('');
    }

    // Forecast
    const forecast = this.netWorth.forecast(12);
    if (forecast.avgMonthlyGrowth !== 0) {
      const growthColor = forecast.avgMonthlyGrowth >= 0 ? 'green' : 'red';
      const arrow = forecast.avgMonthlyGrowth >= 0 ? '▲' : '▼';
      lines.push(`    Avg Growth/Mo:   ${colorize(`${arrow} ${currency(Math.abs(forecast.avgMonthlyGrowth))}`, growthColor)}    12-Mo Forecast: ${colorize(currency(forecast.projections[11].projected), growthColor)}`);
      lines.push('');
    }

    return lines.join('\n');
  }

  renderAccountsSummary() {
    const lines = [];
    lines.push(colorize('  ── ACCOUNTS BY INSTITUTION ──────────────────────────────────────', 'blue'));
    lines.push('');

    const breakdown = this.netWorth.getBreakdownByInstitution();

    for (const inst of breakdown) {
      const icon = {
        Robinhood: '🪶',
        Chase: '🏦',
        Vanguard: '⚓',
        Amex: '💳',
      }[inst.institution] || '📊';

      lines.push(`    ${icon} ${colorize(inst.institution, 'bold')}  ${colorize(currency(inst.netValue), inst.netValue >= 0 ? 'green' : 'red')}`);

      for (const acc of inst.accounts) {
        const valueColor = acc.value >= 0 ? 'white' : 'red';
        const typeLabel = acc.type.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase());
        lines.push(`       ${colorize('•', 'gray')} ${pad(acc.name, 28)} ${colorize(currency(acc.value), valueColor)}  ${colorize(`(${typeLabel})`, 'gray')}`);
      }
      lines.push('');
    }

    return lines.join('\n');
  }

  renderBudgetSummary(month) {
    month = month || monthKey(new Date());
    const report = this.budget.getMonthlyReport(month);
    const lines = [];

    lines.push(colorize(`  ── BUDGET: ${month} ──────────────────────────────────────────────`, 'blue'));
    lines.push('');

    if (!report) {
      lines.push('    No budget set for this month. Use "Create Budget" to get started.');
      lines.push('');
      return lines.join('\n');
    }

    lines.push(`    Income:     ${colorize(currency(report.totalIncome), 'green')}    Expenses:  ${colorize(currency(report.totalExpenses), 'red')}    Net: ${colorize(currency(report.netIncome), report.netIncome >= 0 ? 'green' : 'red')}`);
    lines.push(`    Budgeted:   ${colorize(currency(report.totalBudgeted), 'yellow')}    Savings:   ${colorize(currency(report.actualSavings), report.actualSavings >= 0 ? 'green' : 'red')} (${report.savingsRate.toFixed(1)}%)`);
    lines.push('');

    if (report.categoryReports.length > 0) {
      lines.push('    ' + colorize(pad('Category', 20), 'bold') + colorize(pad('Budget', 12, 'right'), 'bold') + colorize(pad('Spent', 12, 'right'), 'bold') + colorize(pad('Left', 12, 'right'), 'bold') + '  ' + colorize('Progress', 'bold'));
      lines.push('    ' + colorize('─'.repeat(78), 'gray'));

      for (const cr of report.categoryReports) {
        const statusColor = cr.status === 'over' ? 'red' : cr.status === 'warning' ? 'yellow' : 'green';
        lines.push(
          '    ' +
          pad(cr.category, 20) +
          pad(currency(cr.budgeted), 12, 'right') +
          pad(currency(cr.spent), 12, 'right') +
          colorize(pad(currency(cr.remaining), 12, 'right'), statusColor) +
          '  ' +
          progressBar(cr.spent, cr.budgeted, 20) +
          ' ' + colorize(`${cr.percentUsed.toFixed(0)}%`, statusColor)
        );
      }
      lines.push('');
    }

    if (Object.keys(report.unbudgetedSpending).length > 0) {
      lines.push('    ' + colorize('Unbudgeted Spending:', 'yellow'));
      for (const [cat, amount] of Object.entries(report.unbudgetedSpending)) {
        lines.push(`      ${colorize('!', 'yellow')} ${pad(cat, 20)} ${currency(amount)}`);
      }
      lines.push('');
    }

    return lines.join('\n');
  }

  renderInvestmentSummary() {
    const lines = [];
    lines.push(colorize('  ── INVESTMENT PORTFOLIO ─────────────────────────────────────────', 'blue'));
    lines.push('');

    const investmentAccounts = this.store.accounts.filter(
      a => a.holdings && a.holdings.length > 0
    );

    if (investmentAccounts.length === 0) {
      lines.push('    No investment holdings tracked yet.');
      lines.push('');
      return lines.join('\n');
    }

    let allHoldings = [];
    for (const account of investmentAccounts) {
      for (const h of account.holdings) {
        allHoldings.push({ ...h, accountName: account.name, institution: account.institution });
      }
    }

    // Sort by market value
    allHoldings.sort((a, b) => (b.shares * b.currentPrice) - (a.shares * a.currentPrice));

    const totalValue = allHoldings.reduce((sum, h) => sum + (h.shares * h.currentPrice), 0);
    const totalCost = allHoldings.reduce((sum, h) => sum + (h.shares * h.avgCost), 0);
    const totalGain = totalValue - totalCost;

    lines.push(`    Total Portfolio Value: ${colorize(currency(totalValue), 'bold')}   Total Gain/Loss: ${colorize(currency(totalGain), totalGain >= 0 ? 'green' : 'red')} (${(totalCost > 0 ? (totalGain / totalCost) * 100 : 0).toFixed(1)}%)`);
    lines.push('');

    lines.push('    ' + colorize(pad('Symbol', 8), 'bold') + colorize(pad('Shares', 10, 'right'), 'bold') + colorize(pad('Price', 12, 'right'), 'bold') + colorize(pad('Value', 14, 'right'), 'bold') + colorize(pad('Gain', 14, 'right'), 'bold') + colorize(pad('Alloc', 8, 'right'), 'bold') + '  ' + colorize('Account', 'bold'));
    lines.push('    ' + colorize('─'.repeat(82), 'gray'));

    for (const h of allHoldings.slice(0, 15)) {
      const value = h.shares * h.currentPrice;
      const gain = (h.currentPrice - h.avgCost) * h.shares;
      const gainPct = h.avgCost > 0 ? ((h.currentPrice - h.avgCost) / h.avgCost) * 100 : 0;
      const gainColor = gain >= 0 ? 'green' : 'red';
      const alloc = totalValue > 0 ? (value / totalValue) * 100 : 0;

      lines.push(
        '    ' +
        colorize(pad(h.symbol, 8), 'cyan') +
        pad(h.shares.toFixed(2), 10, 'right') +
        pad(currency(h.currentPrice), 12, 'right') +
        pad(currency(value), 14, 'right') +
        colorize(pad(`${currency(gain)} (${gainPct.toFixed(1)}%)`, 14, 'right'), gainColor) +
        pad(`${alloc.toFixed(1)}%`, 8, 'right') +
        '  ' + colorize(h.institution, 'gray')
      );
    }
    lines.push('');

    // Asset allocation summary
    const allocation = this.netWorth.getAssetAllocation();
    if (allocation.length > 0) {
      lines.push('    ' + colorize('Asset Allocation:', 'bold'));
      for (const a of allocation) {
        const bar = progressBar(a.percent, 100, 15);
        lines.push(`      ${pad(a.type, 15)} ${bar} ${pad(a.percent.toFixed(1) + '%', 7, 'right')} ${colorize(currency(a.value), 'white')}`);
      }
      lines.push('');
    }

    return lines.join('\n');
  }

  renderCreditSummary() {
    const lines = [];
    lines.push(colorize('  ── CREDIT & DEBT ───────────────────────────────────────────────', 'blue'));
    lines.push('');

    const creditAccounts = this.store.accounts.filter(a => a.type === 'credit_card');
    if (creditAccounts.length === 0) {
      lines.push('    No credit card accounts tracked.');
      lines.push('');
      return lines.join('\n');
    }

    let totalBalance = 0;
    let totalLimit = 0;

    for (const acc of creditAccounts) {
      totalBalance += acc.balance;
      totalLimit += acc.creditLimit || 0;
      const util = acc.creditLimit ? (acc.balance / acc.creditLimit) * 100 : 0;
      const utilColor = util > 30 ? (util > 50 ? 'red' : 'yellow') : 'green';

      lines.push(`    ${colorize(acc.name, 'bold')} (${acc.institution})`);
      lines.push(`      Balance: ${colorize(currency(acc.balance), 'red')}  /  Limit: ${currency(acc.creditLimit || 0)}  |  APR: ${acc.apr || 'N/A'}%`);
      lines.push(`      Utilization: ${progressBar(acc.balance, acc.creditLimit || 1, 20)} ${colorize(`${util.toFixed(1)}%`, utilColor)}`);
      lines.push('');
    }

    const totalUtil = totalLimit > 0 ? (totalBalance / totalLimit) * 100 : 0;
    const totalUtilColor = totalUtil > 30 ? (totalUtil > 50 ? 'red' : 'yellow') : 'green';
    lines.push(`    ${colorize('Total Credit Utilization:', 'bold')} ${colorize(currency(totalBalance), 'red')} / ${currency(totalLimit)} = ${colorize(`${totalUtil.toFixed(1)}%`, totalUtilColor)}`);
    lines.push('');

    return lines.join('\n');
  }

  renderRecentTransactions(limit = 10) {
    const lines = [];
    lines.push(colorize('  ── RECENT TRANSACTIONS ──────────────────────────────────────────', 'blue'));
    lines.push('');

    const transactions = this.store.getTransactions().slice(0, limit);
    if (transactions.length === 0) {
      lines.push('    No transactions recorded yet.');
      lines.push('');
      return lines.join('\n');
    }

    lines.push('    ' + colorize(pad('Date', 12), 'bold') + colorize(pad('Description', 28), 'bold') + colorize(pad('Category', 18), 'bold') + colorize(pad('Amount', 14, 'right'), 'bold') + '  ' + colorize('Account', 'bold'));
    lines.push('    ' + colorize('─'.repeat(86), 'gray'));

    for (const tx of transactions) {
      const account = this.store.getAccount(tx.accountId);
      const amountColor = tx.isIncome() ? 'green' : tx.isExpense() ? 'red' : 'white';
      const sign = tx.isIncome() ? '+' : tx.isExpense() ? '-' : '';

      lines.push(
        '    ' +
        colorize(pad(tx.date, 12), 'gray') +
        pad(tx.description, 28) +
        colorize(pad(tx.category || '', 18), 'gray') +
        colorize(pad(sign + currency(tx.amount), 14, 'right'), amountColor) +
        '  ' + colorize(account ? account.name : '', 'gray')
      );
    }
    lines.push('');

    return lines.join('\n');
  }

  renderGoalsSummary() {
    const lines = [];
    lines.push(colorize('  ── FINANCIAL GOALS ─────────────────────────────────────────────', 'blue'));
    lines.push('');

    if (!this.goals || this.store.goals.length === 0) {
      lines.push('    No financial goals set. Use "Financial Goals" to get started.');
      lines.push('');
      return lines.join('\n');
    }

    const summary = this.goals.getGoalsSummary();

    lines.push(`    Active: ${colorize(String(summary.activeCount), 'cyan')}    Completed: ${colorize(String(summary.completedCount), 'green')}    Overall: ${colorize(summary.overallProgress.toFixed(1) + '%', 'yellow')}`);
    lines.push('');

    for (const g of summary.goals) {
      const statusIcon = g.isComplete ? colorize('✓', 'green') : g.onTrack === false ? colorize('!', 'red') : colorize('○', 'cyan');
      const progressColor = g.progress >= 100 ? 'green' : g.progress >= 50 ? 'yellow' : 'white';

      lines.push(`    ${statusIcon} ${pad(g.name, 30)} ${progressBar(g.progress, 100, 15)} ${colorize(g.progress.toFixed(0) + '%', progressColor)}`);
      lines.push(`      ${colorize(currency(g.currentAmount), 'green')} / ${currency(g.targetAmount)}` +
        (g.daysRemaining !== null ? `  ${colorize(g.daysRemaining + ' days left', g.daysRemaining < 30 ? 'red' : 'gray')}` : '') +
        (g.monthlyNeeded > 0 && !g.isComplete ? `  Need ${colorize(currency(g.monthlyNeeded) + '/mo', 'yellow')}` : ''));
    }
    lines.push('');

    return lines.join('\n');
  }

  renderRecurringSummary() {
    const lines = [];
    lines.push(colorize('  ── RECURRING TRANSACTIONS ──────────────────────────────────────', 'blue'));
    lines.push('');

    if (!this.recurring || this.store.recurringTransactions.length === 0) {
      lines.push('    No recurring transactions set up.');
      lines.push('');
      return lines.join('\n');
    }

    const projection = this.recurring.getMonthlyProjection();
    lines.push(`    Monthly Recurring:  Income ${colorize(currency(projection.totalIncome), 'green')}   Expenses ${colorize(currency(projection.totalExpenses), 'red')}   Net ${colorize(currency(projection.netMonthly), projection.netMonthly >= 0 ? 'green' : 'red')}`);
    lines.push('');

    const active = this.recurring.getActiveRecurring();
    for (const r of active.slice(0, 8)) {
      const typeIcon = r.type === 'income' || r.type === 'dividend' ? colorize('+', 'green') : colorize('-', 'red');
      const freqLabel = r.frequency.charAt(0).toUpperCase() + r.frequency.slice(1);
      lines.push(`    ${typeIcon} ${pad(r.description, 28)} ${pad(currency(r.amount), 12, 'right')} ${colorize(pad(freqLabel, 12), 'gray')}`);
    }
    if (active.length > 8) {
      lines.push(colorize(`      ... and ${active.length - 8} more`, 'gray'));
    }
    lines.push('');

    // Upcoming
    const upcoming = this.recurring.getUpcoming(14);
    if (upcoming.length > 0) {
      lines.push('    ' + colorize('Upcoming (14 days):', 'bold'));
      for (const item of upcoming.slice(0, 5)) {
        const typeColor = item.recurring.type === 'income' ? 'green' : 'red';
        lines.push(`      ${colorize(item.date, 'gray')}  ${pad(item.recurring.description, 25)} ${colorize(currency(item.recurring.amount), typeColor)}`);
      }
      lines.push('');
    }

    return lines.join('\n');
  }

  renderForecast() {
    const lines = [];
    lines.push(colorize('  ── NET WORTH FORECAST ──────────────────────────────────────────', 'blue'));
    lines.push('');

    const forecast = this.netWorth.forecast(12);
    if (forecast.avgMonthlyGrowth === 0) {
      lines.push('    Not enough snapshot data to generate a forecast.');
      lines.push('');
      return lines.join('\n');
    }

    const growthColor = forecast.avgMonthlyGrowth >= 0 ? 'green' : 'red';
    lines.push(`    Current Net Worth:    ${colorize(currency(forecast.currentNetWorth), 'bold')}`);
    lines.push(`    Avg Monthly Growth:   ${colorize(currency(forecast.avgMonthlyGrowth), growthColor)}`);
    lines.push(`    Projected (12 mo):    ${colorize(currency(forecast.projections[11].projected), growthColor)}`);
    lines.push('');

    // Sparkline of projected values
    const projValues = forecast.projections.map(p => p.projected);
    lines.push('    Projection:  ' + colorize(sparkline(projValues), 'cyan'));
    lines.push('');

    // Quarterly projections
    lines.push('    ' + colorize(pad('Month', 12), 'bold') + colorize(pad('Projected', 16, 'right'), 'bold'));
    lines.push('    ' + colorize('─'.repeat(30), 'gray'));
    for (const p of forecast.projections) {
      if (p.monthsOut % 3 === 0 || p.monthsOut === 1) {
        lines.push(`    ${pad(p.date.substring(0, 7), 12)} ${colorize(pad(currency(p.projected), 16, 'right'), growthColor)}`);
      }
    }
    lines.push('');

    // Milestones
    const milestones = this.netWorth.getMilestones();
    if (milestones.length > 0) {
      lines.push('    ' + colorize('Milestones:', 'bold'));
      for (const m of milestones.slice(0, 3)) {
        if (m.monthsAway !== null) {
          const years = Math.floor(m.monthsAway / 12);
          const months = m.monthsAway % 12;
          const timeStr = years > 0 ? `${years}y ${months}m` : `${months}m`;
          lines.push(`      ${colorize(currency(m.target), 'cyan')}  in ~${colorize(timeStr, 'yellow')} (${m.estimatedDate.substring(0, 7)})`);
        } else {
          lines.push(`      ${colorize(currency(m.target), 'cyan')}  ${colorize('needs positive growth', 'red')}`);
        }
      }
      lines.push('');
    }

    return lines.join('\n');
  }

  renderFullDashboard() {
    let output = '';
    output += this.renderHeader();
    output += this.renderNetWorthSummary();
    output += this.renderAccountsSummary();
    output += this.renderBudgetSummary();
    output += this.renderGoalsSummary();
    output += this.renderInvestmentSummary();
    output += this.renderCreditSummary();
    output += this.renderRecentTransactions();
    return output;
  }

  renderMenu() {
    const lines = [];
    lines.push(colorize('  ── MAIN MENU ───────────────────────────────────────────────────', 'blue'));
    lines.push('');
    lines.push('    ' + colorize('[1]', 'cyan') + '  Dashboard Overview');
    lines.push('    ' + colorize('[2]', 'cyan') + '  Manage Accounts');
    lines.push('    ' + colorize('[3]', 'cyan') + '  Add Transaction');
    lines.push('    ' + colorize('[4]', 'cyan') + '  Budget Manager');
    lines.push('    ' + colorize('[5]', 'cyan') + '  Net Worth Tracker');
    lines.push('    ' + colorize('[6]', 'cyan') + '  Investment Portfolio');
    lines.push('    ' + colorize('[7]', 'cyan') + '  Credit & Debt');
    lines.push('    ' + colorize('[8]', 'cyan') + '  Reports & Analytics');
    lines.push('    ' + colorize('[9]', 'cyan') + '  Import / Export Data');
    lines.push('    ' + colorize('[r]', 'cyan') + '  Recurring Transactions');
    lines.push('    ' + colorize('[g]', 'cyan') + '  Financial Goals');
    lines.push('    ' + colorize('[f]', 'cyan') + '  Net Worth Forecast');
    lines.push('    ' + colorize('[0]', 'cyan') + '  Exit');
    lines.push('');
    return lines.join('\n');
  }
}

module.exports = { Dashboard };
