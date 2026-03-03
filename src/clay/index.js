#!/usr/bin/env node

/**
 * Clay Automation Hub
 *
 * Connects Dealcloud, Zoom, Outreach.io, and Gmail through Clay
 * to automate 40-60% of daily workflow.
 *
 * Usage:
 *   node src/clay/index.js                  — Start full automation (sync + webhooks)
 *   node src/clay/index.js --sync           — Run a one-time full sync
 *   node src/clay/index.js --status         — Show current sync status
 *   node src/clay/index.js --recipes        — List available automation recipes
 *   node src/clay/index.js --digest         — Generate weekly engagement digest
 *   node src/clay/index.js --validate       — Validate configuration
 */

const { CONFIG, validateConfig } = require('./config');
const { SyncEngine } = require('./workflows/sync-engine');
const { AutomationRecipes } = require('./workflows/automation-recipes');
const { WebhookServer } = require('./workflows/webhook-server');
const logger = require('./utils/logger');

const SOURCE = 'main';

async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || '--start';

  console.log('');
  console.log('  Clay Automation Hub');
  console.log('  ═══════════════════════════════════════');
  console.log('  Dealcloud + Zoom + Outreach.io + Gmail');
  console.log('');

  // Validate configuration
  if (command === '--validate') {
    return runValidation();
  }

  const validation = validateConfig();
  if (!validation.valid) {
    console.log('  Configuration incomplete. Missing:');
    for (const key of validation.missing) {
      console.log(`    - ${key}`);
    }
    console.log('');
    console.log('  Set environment variables or create a .env file.');
    console.log('  Run with --validate for full details.');

    if (command !== '--recipes') {
      console.log('');
      return;
    }
  }

  if (command === '--recipes') {
    return showRecipes();
  }

  // Initialize engine
  const engine = new SyncEngine();
  const recipes = new AutomationRecipes(engine);

  try {
    await engine.initialize();
  } catch (err) {
    logger.error(SOURCE, 'Failed to initialize sync engine', { error: err.message });
    console.log('  Initialization failed. Check your API credentials.');
    return;
  }

  switch (command) {
    case '--sync':
      return runOneTimeSync(engine);
    case '--status':
      return showStatus(engine);
    case '--digest':
      return runDigest(recipes);
    case '--start':
    default:
      return startFullAutomation(engine, recipes);
  }
}

function runValidation() {
  const validation = validateConfig();

  console.log('  Configuration Status:');
  console.log('  ─────────────────────');

  const checks = [
    { name: 'Clay API', ok: !!CONFIG.clay.apiKey },
    { name: 'Clay Workspace', ok: !!CONFIG.clay.workspaceId },
    { name: 'Dealcloud', ok: !!(CONFIG.dealcloud.apiKey || CONFIG.dealcloud.clientId) },
    { name: 'Zoom', ok: !!(CONFIG.zoom.clientId && CONFIG.zoom.clientSecret) },
    { name: 'Outreach.io', ok: !!(CONFIG.outreach.clientId || CONFIG.outreach.apiKey) },
    { name: 'Gmail', ok: !!(CONFIG.gmail.clientId && CONFIG.gmail.refreshToken) },
  ];

  for (const check of checks) {
    const icon = check.ok ? '[OK]' : '[--]';
    console.log(`    ${icon} ${check.name}`);
  }

  console.log('');
  if (validation.valid) {
    console.log('  All integrations configured.');
  } else {
    console.log('  Missing credentials:');
    for (const key of validation.missing) {
      console.log(`    - ${key}`);
    }
  }
  console.log('');
}

function showRecipes() {
  const recipes = new AutomationRecipes(null);
  const available = recipes.getAvailableRecipes();

  console.log('  Available Automation Recipes:');
  console.log('  ─────────────────────────────');
  console.log('');

  let totalTimeSaved = 0;
  for (const recipe of available) {
    const pct = parseInt(recipe.timeSaved.replace(/[^0-9]/g, ''));
    totalTimeSaved += pct;

    console.log(`  [${recipe.id}]`);
    console.log(`    ${recipe.name}`);
    console.log(`    Trigger: ${recipe.trigger}`);
    console.log(`    Time saved: ${recipe.timeSaved}`);
    console.log(`    ${recipe.description}`);
    console.log('');
  }

  console.log(`  ─────────────────────────────`);
  console.log(`  Total estimated time saved: ~${totalTimeSaved}% of daily workflow`);
  console.log('');
  console.log('  Combined with Clay enrichment and table management,');
  console.log('  this targets 40-60% workflow automation.');
  console.log('');
}

async function runOneTimeSync(engine) {
  console.log('  Running one-time full sync...');
  console.log('');

  const results = await engine.runFullSync();

  console.log('  Sync Results:');
  console.log('  ─────────────');
  if (results.dealcloud) {
    console.log(`    Dealcloud: ${results.dealcloud.deals?.length || 0} deals, ${results.dealcloud.contacts?.length || 0} contacts, ${results.dealcloud.companies?.length || 0} companies`);
  }
  if (results.zoom) {
    console.log(`    Zoom: ${results.zoom.meetings?.length || 0} meetings`);
  }
  if (results.outreach) {
    console.log(`    Outreach: ${results.outreach.prospects?.length || 0} prospects, ${results.outreach.emailActivity?.length || 0} email events`);
  }
  if (results.gmail) {
    console.log(`    Gmail: ${results.gmail.emails?.length || 0} emails, ${results.gmail.contacts?.length || 0} contacts`);
  }
  if (results.errors.length) {
    console.log(`    Errors: ${results.errors.map(e => `${e.source}: ${e.error}`).join(', ')}`);
  }
  console.log('');
}

function showStatus(engine) {
  const status = engine.getStatus();

  console.log('  Sync Status:');
  console.log('  ────────────');
  console.log(`    Tables: ${Object.keys(status.tableIds).join(', ') || 'none'}`);
  console.log(`    Scheduled syncs: ${status.scheduledSyncs.join(', ') || 'none'}`);

  console.log('    Last sync times:');
  for (const [source, time] of Object.entries(status.lastSyncTimes)) {
    console.log(`      ${source}: ${time}`);
  }
  console.log('');
}

async function runDigest(recipes) {
  console.log('  Generating weekly engagement digest...');
  console.log('');

  const digest = await recipes.generateWeeklyDigest();

  console.log('  Weekly Digest:');
  console.log('  ──────────────');
  console.log(`    Period: ${digest.period.from.split('T')[0]} → ${digest.period.to.split('T')[0]}`);
  console.log(`    Meetings: ${digest.meetings.total}`);
  console.log(`    Emails: ${digest.emails.total} (${digest.emails.inbound} in, ${digest.emails.outbound} out, ${digest.emails.replies} replies)`);
  console.log(`    Active deals: ${digest.deals.active}`);

  if (digest.deals.items?.length) {
    console.log('    Deal activity:');
    for (const deal of digest.deals.items) {
      console.log(`      - ${deal.name} [${deal.stage}] $${deal.value || '?'}`);
    }
  }
  console.log('');
}

async function startFullAutomation(engine, recipes) {
  console.log('  Starting full automation...');
  console.log('');

  // Initial full sync
  await engine.runFullSync();

  // Start scheduled syncs
  engine.startScheduledSync();

  // Start webhook server
  const webhooks = new WebhookServer(engine, recipes);
  webhooks.start();

  console.log('');
  console.log('  Automation running. Press Ctrl+C to stop.');
  console.log('');
  console.log('  Webhook endpoints:');
  console.log(`    POST http://localhost:${CONFIG.automation.webhookPort}/webhooks/zoom`);
  console.log(`    POST http://localhost:${CONFIG.automation.webhookPort}/webhooks/outreach`);
  console.log(`    POST http://localhost:${CONFIG.automation.webhookPort}/webhooks/dealcloud`);
  console.log('');

  // Graceful shutdown
  process.on('SIGINT', () => {
    console.log('');
    console.log('  Shutting down...');
    engine.stopScheduledSync();
    webhooks.stop();
    process.exit(0);
  });
}

main().catch(err => {
  logger.error(SOURCE, 'Fatal error', { error: err.message, stack: err.stack });
  process.exit(1);
});
