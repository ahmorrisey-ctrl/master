/**
 * Clay Automation Configuration
 *
 * Central configuration for all Clay integrations:
 * - Dealcloud (CRM / deal pipeline)
 * - Zoom (meeting intelligence)
 * - Outreach.io (sales engagement)
 * - Gmail (email tracking)
 *
 * Set environment variables or update .env to configure API keys.
 */

const CONFIG = {
  clay: {
    apiKey: process.env.CLAY_API_KEY || '',
    baseUrl: 'https://api.clay.com/v1',
    workspaceId: process.env.CLAY_WORKSPACE_ID || '',
    rateLimitPerMinute: 100,
  },

  dealcloud: {
    apiKey: process.env.DEALCLOUD_API_KEY || '',
    baseUrl: process.env.DEALCLOUD_BASE_URL || 'https://api.dealcloud.com/api/v1',
    clientId: process.env.DEALCLOUD_CLIENT_ID || '',
    clientSecret: process.env.DEALCLOUD_CLIENT_SECRET || '',
    syncIntervalMinutes: 15,
    entities: ['deals', 'contacts', 'companies', 'pipelines'],
  },

  zoom: {
    accountId: process.env.ZOOM_ACCOUNT_ID || '',
    clientId: process.env.ZOOM_CLIENT_ID || '',
    clientSecret: process.env.ZOOM_CLIENT_SECRET || '',
    baseUrl: 'https://api.zoom.us/v2',
    webhookSecret: process.env.ZOOM_WEBHOOK_SECRET || '',
    pullRecordings: true,
    pullTranscripts: true,
    syncIntervalMinutes: 10,
  },

  outreach: {
    apiKey: process.env.OUTREACH_API_KEY || '',
    baseUrl: 'https://api.outreach.io/api/v2',
    clientId: process.env.OUTREACH_CLIENT_ID || '',
    clientSecret: process.env.OUTREACH_CLIENT_SECRET || '',
    redirectUri: process.env.OUTREACH_REDIRECT_URI || 'http://localhost:3000/auth/outreach/callback',
    syncSequences: true,
    syncIntervalMinutes: 10,
  },

  gmail: {
    clientId: process.env.GMAIL_CLIENT_ID || '',
    clientSecret: process.env.GMAIL_CLIENT_SECRET || '',
    redirectUri: process.env.GMAIL_REDIRECT_URI || 'http://localhost:3000/auth/gmail/callback',
    refreshToken: process.env.GMAIL_REFRESH_TOKEN || '',
    scopes: [
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/gmail.send',
      'https://www.googleapis.com/auth/gmail.labels',
    ],
    syncIntervalMinutes: 5,
    labelFilters: ['INBOX', 'SENT'],
  },

  automation: {
    enabled: true,
    logLevel: process.env.CLAY_LOG_LEVEL || 'info',
    maxRetries: 3,
    retryDelayMs: 2000,
    batchSize: 50,
    webhookPort: process.env.CLAY_WEBHOOK_PORT || 3000,
  },
};

function validateConfig() {
  const missing = [];

  if (!CONFIG.clay.apiKey) missing.push('CLAY_API_KEY');
  if (!CONFIG.dealcloud.apiKey && !CONFIG.dealcloud.clientId) missing.push('DEALCLOUD_API_KEY or DEALCLOUD_CLIENT_ID');
  if (!CONFIG.zoom.clientId) missing.push('ZOOM_CLIENT_ID');
  if (!CONFIG.outreach.clientId) missing.push('OUTREACH_CLIENT_ID');
  if (!CONFIG.gmail.clientId) missing.push('GMAIL_CLIENT_ID');

  return { valid: missing.length === 0, missing };
}

module.exports = { CONFIG, validateConfig };
