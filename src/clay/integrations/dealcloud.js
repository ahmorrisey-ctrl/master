/**
 * Dealcloud Integration for Clay
 *
 * Syncs deals, contacts, companies, and pipeline stages from Dealcloud
 * into Clay tables for enrichment and automation.
 *
 * Automatable tasks (~15% of workflow):
 * - Auto-sync new deals/contacts into Clay tables
 * - Enrich company data when new deals enter pipeline
 * - Trigger outreach sequences when deal stage changes
 * - Log meeting notes back to Dealcloud contact records
 */

const { ApiClient } = require('../utils/api-client');
const { CONFIG } = require('../config');
const logger = require('../utils/logger');

const SOURCE = 'dealcloud';

class DealcloudIntegration {
  constructor() {
    this.config = CONFIG.dealcloud;
    this.client = null;
    this.accessToken = null;
    this.tokenExpiry = 0;
  }

  async initialize() {
    await this._authenticate();
    this.client = new ApiClient(this.config.baseUrl, {
      Authorization: `Bearer ${this.accessToken}`,
    });
    logger.info(SOURCE, 'Dealcloud integration initialized');
  }

  async _authenticate() {
    const authClient = new ApiClient('https://auth.dealcloud.com');
    const response = await authClient.post('/oauth/token', {
      grant_type: 'client_credentials',
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
    });
    this.accessToken = response.data.access_token;
    this.tokenExpiry = Date.now() + (response.data.expires_in * 1000);
    logger.info(SOURCE, 'Authenticated with Dealcloud');
  }

  async _ensureAuth() {
    if (Date.now() >= this.tokenExpiry - 60000) {
      await this._authenticate();
      this.client = new ApiClient(this.config.baseUrl, {
        Authorization: `Bearer ${this.accessToken}`,
      });
    }
  }

  // ── Deal Operations ──

  async getDeals(filters = {}) {
    await this._ensureAuth();
    const params = new URLSearchParams();
    if (filters.stage) params.set('stage', filters.stage);
    if (filters.modifiedSince) params.set('modifiedSince', filters.modifiedSince);
    if (filters.limit) params.set('limit', String(filters.limit));
    const query = params.toString();
    const path = `/deals${query ? `?${query}` : ''}`;
    const response = await this.client.get(path);
    logger.info(SOURCE, `Fetched ${response.data.length || 0} deals`);
    return response.data;
  }

  async getDealById(dealId) {
    await this._ensureAuth();
    const response = await this.client.get(`/deals/${dealId}`);
    return response.data;
  }

  async getDealsByStage(stage) {
    return this.getDeals({ stage });
  }

  async updateDealField(dealId, fieldName, value) {
    await this._ensureAuth();
    const response = await this.client.patch(`/deals/${dealId}`, {
      [fieldName]: value,
    });
    logger.info(SOURCE, `Updated deal ${dealId} field ${fieldName}`);
    return response.data;
  }

  // ── Contact Operations ──

  async getContacts(filters = {}) {
    await this._ensureAuth();
    const params = new URLSearchParams();
    if (filters.modifiedSince) params.set('modifiedSince', filters.modifiedSince);
    if (filters.limit) params.set('limit', String(filters.limit));
    const query = params.toString();
    const path = `/contacts${query ? `?${query}` : ''}`;
    const response = await this.client.get(path);
    logger.info(SOURCE, `Fetched ${response.data.length || 0} contacts`);
    return response.data;
  }

  async getContactById(contactId) {
    await this._ensureAuth();
    const response = await this.client.get(`/contacts/${contactId}`);
    return response.data;
  }

  async addNoteToContact(contactId, note) {
    await this._ensureAuth();
    const response = await this.client.post(`/contacts/${contactId}/notes`, {
      content: note,
      createdAt: new Date().toISOString(),
      source: 'clay-automation',
    });
    logger.info(SOURCE, `Added note to contact ${contactId}`);
    return response.data;
  }

  // ── Company Operations ──

  async getCompanies(filters = {}) {
    await this._ensureAuth();
    const params = new URLSearchParams();
    if (filters.modifiedSince) params.set('modifiedSince', filters.modifiedSince);
    if (filters.limit) params.set('limit', String(filters.limit));
    const query = params.toString();
    const path = `/companies${query ? `?${query}` : ''}`;
    const response = await this.client.get(path);
    logger.info(SOURCE, `Fetched ${response.data.length || 0} companies`);
    return response.data;
  }

  // ── Pipeline Operations ──

  async getPipelineStages() {
    await this._ensureAuth();
    const response = await this.client.get('/pipelines/stages');
    return response.data;
  }

  async getDealsModifiedSince(sinceDate) {
    return this.getDeals({ modifiedSince: sinceDate.toISOString() });
  }

  // ── Sync for Clay Tables ──

  async pullAllForClaySync(lastSyncTime) {
    await this._ensureAuth();
    const since = lastSyncTime ? lastSyncTime.toISOString() : undefined;

    const [deals, contacts, companies] = await Promise.all([
      this.getDeals({ modifiedSince: since }),
      this.getContacts({ modifiedSince: since }),
      this.getCompanies({ modifiedSince: since }),
    ]);

    logger.info(SOURCE, 'Pulled data for Clay sync', {
      deals: deals.length || 0,
      contacts: contacts.length || 0,
      companies: companies.length || 0,
    });

    return {
      deals: this._normalizeDealRecords(deals),
      contacts: this._normalizeContactRecords(contacts),
      companies: this._normalizeCompanyRecords(companies),
    };
  }

  _normalizeDealRecords(deals) {
    if (!Array.isArray(deals)) return [];
    return deals.map(d => ({
      sourceId: d.id,
      source: SOURCE,
      name: d.name || d.dealName,
      stage: d.stage || d.pipelineStage,
      value: d.value || d.dealSize,
      company: d.company || d.companyName,
      owner: d.owner || d.assignedTo,
      createdAt: d.createdAt,
      updatedAt: d.updatedAt || d.modifiedAt,
      customFields: d.customFields || {},
    }));
  }

  _normalizeContactRecords(contacts) {
    if (!Array.isArray(contacts)) return [];
    return contacts.map(c => ({
      sourceId: c.id,
      source: SOURCE,
      firstName: c.firstName,
      lastName: c.lastName,
      email: c.email,
      phone: c.phone,
      title: c.title || c.jobTitle,
      company: c.company || c.companyName,
      linkedinUrl: c.linkedinUrl || c.linkedin,
      updatedAt: c.updatedAt || c.modifiedAt,
    }));
  }

  _normalizeCompanyRecords(companies) {
    if (!Array.isArray(companies)) return [];
    return companies.map(co => ({
      sourceId: co.id,
      source: SOURCE,
      name: co.name || co.companyName,
      domain: co.domain || co.website,
      industry: co.industry,
      size: co.employeeCount || co.size,
      location: co.location || co.headquarters,
      updatedAt: co.updatedAt || co.modifiedAt,
    }));
  }
}

module.exports = { DealcloudIntegration };
