#!/usr/bin/env node

const { DataStore } = require('./models/DataStore');
const { RobinhoodManager } = require('./accounts/RobinhoodManager');
const { ChaseManager } = require('./accounts/ChaseManager');
const { VanguardManager } = require('./accounts/VanguardManager');
const { AmexManager } = require('./accounts/AmexManager');
const { BudgetEngine } = require('./engines/BudgetEngine');
const { NetWorthEngine } = require('./engines/NetWorthEngine');
const { ReportEngine } = require('./engines/ReportEngine');
const { RecurringEngine } = require('./engines/RecurringEngine');
const { GoalsEngine } = require('./engines/GoalsEngine');
const { Dashboard } = require('./ui/Dashboard');
const { InteractiveCLI } = require('./ui/InteractiveCLI');
const { generateDemoData } = require('./demo');
const { colorize } = require('./utils/format');

function main() {
  const args = process.argv.slice(2);
  const isDemo = args.includes('--demo');
  const isDashboard = args.includes('--dashboard');

  // Initialize data store
  const store = new DataStore();
  store.load();

  // Load demo data if requested or if no data exists
  if (isDemo || (store.accounts.length === 0 && !args.includes('--empty'))) {
    if (store.accounts.length === 0) {
      console.log(colorize('\n  No existing data found. Loading demo data...\n', 'yellow'));
      generateDemoData(store);
    } else if (isDemo) {
      console.log(colorize('\n  Reloading demo data...\n', 'yellow'));
      generateDemoData(store);
    }
  }

  // Initialize managers
  const managers = {
    robinhood: new RobinhoodManager(store),
    chase: new ChaseManager(store),
    vanguard: new VanguardManager(store),
    amex: new AmexManager(store),
  };

  // Initialize engines
  const budgetEngine = new BudgetEngine(store);
  const netWorthEngine = new NetWorthEngine(store);
  const reportEngine = new ReportEngine(store, budgetEngine, netWorthEngine);
  const recurringEngine = new RecurringEngine(store);
  const goalsEngine = new GoalsEngine(store, netWorthEngine);

  // Initialize UI
  const dashboard = new Dashboard(store, budgetEngine, netWorthEngine, managers, goalsEngine, recurringEngine);

  if (isDashboard) {
    // Non-interactive: just print dashboard and exit
    console.log(dashboard.renderFullDashboard());
    process.exit(0);
  }

  // Interactive mode
  const cli = new InteractiveCLI(dashboard, store, budgetEngine, netWorthEngine, reportEngine, managers, goalsEngine, recurringEngine);
  cli.start();
}

main();
