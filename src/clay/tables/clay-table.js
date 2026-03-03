/**
 * Clay Table Manager
 *
 * Manages Clay tables — the central data structure where all integrations
 * converge. Each table represents an entity type (contacts, companies,
 * deals, meetings, email activity) with rows enriched from multiple sources.
 */

const { ApiClient } = require('../utils/api-client');
const { CONFIG } = require('../config');
const logger = require('../utils/logger');

const SOURCE = 'clay-tables';

class ClayTableManager {
  constructor() {
    this.client = new ApiClient(CONFIG.clay.baseUrl, {
      Authorization: `Bearer ${CONFIG.clay.apiKey}`,
      'X-Workspace-Id': CONFIG.clay.workspaceId,
    }, {
      rateLimitPerMinute: CONFIG.clay.rateLimitPerMinute,
    });
  }

  // ── Table CRUD ──

  async listTables() {
    const response = await this.client.get('/tables');
    return response.data.tables || response.data || [];
  }

  async getTable(tableId) {
    const response = await this.client.get(`/tables/${tableId}`);
    return response.data;
  }

  async createTable(name, columns) {
    const response = await this.client.post('/tables', { name, columns });
    logger.info(SOURCE, `Created table: ${name}`);
    return response.data;
  }

  async addColumn(tableId, column) {
    const response = await this.client.post(`/tables/${tableId}/columns`, column);
    logger.info(SOURCE, `Added column ${column.name} to table ${tableId}`);
    return response.data;
  }

  // ── Row Operations ──

  async getRows(tableId, options = {}) {
    const params = new URLSearchParams();
    if (options.limit) params.set('limit', String(options.limit));
    if (options.offset) params.set('offset', String(options.offset));
    if (options.filter) params.set('filter', JSON.stringify(options.filter));
    const query = params.toString();
    const response = await this.client.get(`/tables/${tableId}/rows${query ? `?${query}` : ''}`);
    return response.data.rows || response.data || [];
  }

  async addRow(tableId, rowData) {
    const response = await this.client.post(`/tables/${tableId}/rows`, rowData);
    return response.data;
  }

  async addRows(tableId, rows) {
    const results = [];
    const batchSize = CONFIG.automation.batchSize;
    for (let i = 0; i < rows.length; i += batchSize) {
      const batch = rows.slice(i, i + batchSize);
      const response = await this.client.post(`/tables/${tableId}/rows/bulk`, { rows: batch });
      results.push(response.data);
      logger.info(SOURCE, `Added batch of ${batch.length} rows to table ${tableId}`);
    }
    return results;
  }

  async updateRow(tableId, rowId, updates) {
    const response = await this.client.patch(`/tables/${tableId}/rows/${rowId}`, updates);
    return response.data;
  }

  async upsertRow(tableId, matchField, rowData) {
    const existing = await this.getRows(tableId, {
      filter: { [matchField]: rowData[matchField] },
      limit: 1,
    });

    if (existing.length > 0) {
      return this.updateRow(tableId, existing[0].id, rowData);
    }
    return this.addRow(tableId, rowData);
  }

  async upsertRows(tableId, matchField, rows) {
    const results = [];
    for (const row of rows) {
      const result = await this.upsertRow(tableId, matchField, row);
      results.push(result);
    }
    logger.info(SOURCE, `Upserted ${results.length} rows in table ${tableId}`);
    return results;
  }

  // ── Enrichment ──

  async triggerEnrichment(tableId, rowId, enrichmentType) {
    const response = await this.client.post(`/tables/${tableId}/rows/${rowId}/enrich`, {
      type: enrichmentType,
    });
    logger.info(SOURCE, `Triggered ${enrichmentType} enrichment for row ${rowId}`);
    return response.data;
  }

  async bulkEnrich(tableId, enrichmentType, filter = {}) {
    const response = await this.client.post(`/tables/${tableId}/enrich`, {
      type: enrichmentType,
      filter,
    });
    logger.info(SOURCE, `Triggered bulk ${enrichmentType} enrichment on table ${tableId}`);
    return response.data;
  }

  // ── Search / Query ──

  async findRowsByField(tableId, field, value) {
    return this.getRows(tableId, { filter: { [field]: value } });
  }

  async searchRows(tableId, query) {
    const response = await this.client.get(
      `/tables/${tableId}/search?q=${encodeURIComponent(query)}`
    );
    return response.data.rows || response.data || [];
  }
}

// ── Pre-defined Table Schemas ──

const TABLE_SCHEMAS = {
  contacts: {
    name: 'Contacts — Master',
    columns: [
      { name: 'firstName', type: 'text' },
      { name: 'lastName', type: 'text' },
      { name: 'email', type: 'email' },
      { name: 'phone', type: 'phone' },
      { name: 'title', type: 'text' },
      { name: 'company', type: 'text' },
      { name: 'linkedinUrl', type: 'url' },
      { name: 'source', type: 'select', options: ['dealcloud', 'outreach', 'gmail', 'zoom', 'manual'] },
      { name: 'dealcloudId', type: 'text' },
      { name: 'outreachId', type: 'text' },
      { name: 'lastMeetingDate', type: 'date' },
      { name: 'lastEmailDate', type: 'date' },
      { name: 'emailCount', type: 'number' },
      { name: 'meetingCount', type: 'number' },
      { name: 'outreachSequence', type: 'text' },
      { name: 'engagementScore', type: 'number' },
      { name: 'tags', type: 'multi_select' },
      { name: 'lastSyncedAt', type: 'date' },
    ],
  },

  companies: {
    name: 'Companies — Master',
    columns: [
      { name: 'name', type: 'text' },
      { name: 'domain', type: 'url' },
      { name: 'industry', type: 'text' },
      { name: 'employeeCount', type: 'number' },
      { name: 'location', type: 'text' },
      { name: 'dealcloudId', type: 'text' },
      { name: 'activeDeals', type: 'number' },
      { name: 'totalDealValue', type: 'currency' },
      { name: 'contactCount', type: 'number' },
      { name: 'lastActivityDate', type: 'date' },
      { name: 'tags', type: 'multi_select' },
      { name: 'lastSyncedAt', type: 'date' },
    ],
  },

  deals: {
    name: 'Deals — Pipeline',
    columns: [
      { name: 'name', type: 'text' },
      { name: 'stage', type: 'select' },
      { name: 'value', type: 'currency' },
      { name: 'company', type: 'text' },
      { name: 'owner', type: 'text' },
      { name: 'dealcloudId', type: 'text' },
      { name: 'contactCount', type: 'number' },
      { name: 'meetingCount', type: 'number' },
      { name: 'lastActivityDate', type: 'date' },
      { name: 'createdAt', type: 'date' },
      { name: 'lastSyncedAt', type: 'date' },
    ],
  },

  meetings: {
    name: 'Meetings — Activity Log',
    columns: [
      { name: 'topic', type: 'text' },
      { name: 'date', type: 'date' },
      { name: 'duration', type: 'number' },
      { name: 'hostEmail', type: 'email' },
      { name: 'participantCount', type: 'number' },
      { name: 'participants', type: 'text' },
      { name: 'hasRecording', type: 'checkbox' },
      { name: 'hasTranscript', type: 'checkbox' },
      { name: 'transcriptSummary', type: 'long_text' },
      { name: 'zoomMeetingId', type: 'text' },
      { name: 'relatedDeal', type: 'text' },
      { name: 'followUpStatus', type: 'select', options: ['pending', 'sent', 'completed', 'skipped'] },
      { name: 'lastSyncedAt', type: 'date' },
    ],
  },

  emailActivity: {
    name: 'Email Activity — Engagement',
    columns: [
      { name: 'contactEmail', type: 'email' },
      { name: 'subject', type: 'text' },
      { name: 'direction', type: 'select', options: ['inbound', 'outbound'] },
      { name: 'date', type: 'date' },
      { name: 'source', type: 'select', options: ['gmail', 'outreach'] },
      { name: 'opened', type: 'checkbox' },
      { name: 'clicked', type: 'checkbox' },
      { name: 'replied', type: 'checkbox' },
      { name: 'sequenceName', type: 'text' },
      { name: 'threadId', type: 'text' },
      { name: 'lastSyncedAt', type: 'date' },
    ],
  },
};

module.exports = { ClayTableManager, TABLE_SCHEMAS };
