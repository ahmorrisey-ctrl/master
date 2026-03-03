/**
 * Outreach.io Integration for Clay
 *
 * Manages sales engagement sequences, prospect data, and email activity.
 * Syncs prospect engagement data into Clay for enrichment and decisioning.
 *
 * Automatable tasks (~10% of workflow):
 * - Auto-add contacts from Dealcloud/Clay to Outreach sequences
 * - Sync email open/click/reply data back to Clay tables
 * - Trigger sequence changes based on deal stage updates
 * - Pause/resume sequences based on meeting bookings
 */

const { ApiClient } = require('../utils/api-client');
const { CONFIG } = require('../config');
const logger = require('../utils/logger');

const SOURCE = 'outreach';

class OutreachIntegration {
  constructor() {
    this.config = CONFIG.outreach;
    this.client = null;
    this.accessToken = null;
    this.refreshToken = null;
    this.tokenExpiry = 0;
  }

  async initialize() {
    await this._authenticate();
    this.client = new ApiClient(this.config.baseUrl, {
      Authorization: `Bearer ${this.accessToken}`,
    });
    logger.info(SOURCE, 'Outreach integration initialized');
  }

  async _authenticate() {
    if (this.refreshToken || this.config.apiKey) {
      if (this.config.apiKey) {
        this.accessToken = this.config.apiKey;
        this.tokenExpiry = Date.now() + 86400000;
      } else {
        await this._refreshAccessToken();
      }
    } else {
      logger.warn(SOURCE, 'No refresh token available — use OAuth flow to authenticate');
    }
  }

  async _refreshAccessToken() {
    const authClient = new ApiClient('https://api.outreach.io');
    const response = await authClient.post('/oauth/token', {
      grant_type: 'refresh_token',
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      refresh_token: this.refreshToken,
      redirect_uri: this.config.redirectUri,
    });
    this.accessToken = response.data.access_token;
    this.refreshToken = response.data.refresh_token;
    this.tokenExpiry = Date.now() + (response.data.expires_in * 1000);
    logger.info(SOURCE, 'Refreshed Outreach access token');
  }

  async _ensureAuth() {
    if (Date.now() >= this.tokenExpiry - 60000) {
      await this._authenticate();
      this.client = new ApiClient(this.config.baseUrl, {
        Authorization: `Bearer ${this.accessToken}`,
      });
    }
  }

  // ── Prospect Operations ──

  async getProspects(filters = {}) {
    await this._ensureAuth();
    const params = new URLSearchParams();
    if (filters.email) params.set('filter[emails]', filters.email);
    if (filters.updatedSince) params.set('filter[updatedAt]', `${filters.updatedSince}..inf`);
    params.set('page[size]', String(filters.limit || 50));
    const query = params.toString();
    const response = await this.client.get(`/prospects${query ? `?${query}` : ''}`);
    logger.info(SOURCE, `Fetched ${response.data.data?.length || 0} prospects`);
    return response.data.data || [];
  }

  async getProspectById(prospectId) {
    await this._ensureAuth();
    const response = await this.client.get(`/prospects/${prospectId}`);
    return response.data.data;
  }

  async createProspect(prospectData) {
    await this._ensureAuth();
    const response = await this.client.post('/prospects', {
      data: {
        type: 'prospect',
        attributes: {
          firstName: prospectData.firstName,
          lastName: prospectData.lastName,
          emails: prospectData.emails || [prospectData.email],
          title: prospectData.title,
          company: prospectData.company,
          linkedInUrl: prospectData.linkedinUrl,
          tags: prospectData.tags || ['clay-synced'],
          custom1: prospectData.dealcloudId || null,
        },
      },
    });
    logger.info(SOURCE, `Created prospect: ${prospectData.firstName} ${prospectData.lastName}`);
    return response.data.data;
  }

  async updateProspect(prospectId, updates) {
    await this._ensureAuth();
    const response = await this.client.patch(`/prospects/${prospectId}`, {
      data: {
        type: 'prospect',
        id: prospectId,
        attributes: updates,
      },
    });
    logger.info(SOURCE, `Updated prospect ${prospectId}`);
    return response.data.data;
  }

  async findProspectByEmail(email) {
    const prospects = await this.getProspects({ email });
    return prospects.length > 0 ? prospects[0] : null;
  }

  // ── Sequence Operations ──

  async getSequences() {
    await this._ensureAuth();
    const response = await this.client.get('/sequences?page[size]=100');
    logger.info(SOURCE, `Fetched ${response.data.data?.length || 0} sequences`);
    return response.data.data || [];
  }

  async getSequenceById(sequenceId) {
    await this._ensureAuth();
    const response = await this.client.get(`/sequences/${sequenceId}`);
    return response.data.data;
  }

  async addProspectToSequence(prospectId, sequenceId, mailboxId) {
    await this._ensureAuth();
    const response = await this.client.post('/sequenceStates', {
      data: {
        type: 'sequenceState',
        relationships: {
          prospect: { data: { type: 'prospect', id: prospectId } },
          sequence: { data: { type: 'sequence', id: sequenceId } },
          mailbox: { data: { type: 'mailbox', id: mailboxId } },
        },
      },
    });
    logger.info(SOURCE, `Added prospect ${prospectId} to sequence ${sequenceId}`);
    return response.data.data;
  }

  async pauseProspectInSequence(sequenceStateId) {
    await this._ensureAuth();
    const response = await this.client.patch(`/sequenceStates/${sequenceStateId}`, {
      data: {
        type: 'sequenceState',
        id: sequenceStateId,
        attributes: { state: 'paused' },
      },
    });
    logger.info(SOURCE, `Paused sequence state ${sequenceStateId}`);
    return response.data.data;
  }

  async resumeProspectInSequence(sequenceStateId) {
    await this._ensureAuth();
    const response = await this.client.patch(`/sequenceStates/${sequenceStateId}`, {
      data: {
        type: 'sequenceState',
        id: sequenceStateId,
        attributes: { state: 'active' },
      },
    });
    logger.info(SOURCE, `Resumed sequence state ${sequenceStateId}`);
    return response.data.data;
  }

  // ── Activity / Email Tracking ──

  async getMailingActivity(filters = {}) {
    await this._ensureAuth();
    const params = new URLSearchParams();
    if (filters.prospectId) params.set('filter[prospect][id]', filters.prospectId);
    if (filters.updatedSince) params.set('filter[updatedAt]', `${filters.updatedSince}..inf`);
    params.set('page[size]', String(filters.limit || 50));
    const query = params.toString();
    const response = await this.client.get(`/mailings${query ? `?${query}` : ''}`);
    return response.data.data || [];
  }

  // ── Sync for Clay Tables ──

  async pullAllForClaySync(lastSyncTime) {
    await this._ensureAuth();
    const since = lastSyncTime ? lastSyncTime.toISOString() : undefined;

    const [prospects, sequences, mailings] = await Promise.all([
      this.getProspects({ updatedSince: since }),
      this.getSequences(),
      this.getMailingActivity({ updatedSince: since }),
    ]);

    logger.info(SOURCE, 'Pulled data for Clay sync', {
      prospects: prospects.length,
      sequences: sequences.length,
      mailings: mailings.length,
    });

    return {
      prospects: this._normalizeProspectRecords(prospects),
      sequences: this._normalizeSequenceRecords(sequences),
      emailActivity: this._normalizeMailingRecords(mailings),
    };
  }

  _normalizeProspectRecords(prospects) {
    return prospects.map(p => ({
      sourceId: p.id,
      source: SOURCE,
      firstName: p.attributes?.firstName,
      lastName: p.attributes?.lastName,
      email: p.attributes?.emails?.[0],
      title: p.attributes?.title,
      company: p.attributes?.company,
      tags: p.attributes?.tags || [],
      engagementScore: p.attributes?.engagedScore,
      lastContactedAt: p.attributes?.lastContactedAt,
      updatedAt: p.attributes?.updatedAt,
    }));
  }

  _normalizeSequenceRecords(sequences) {
    return sequences.map(s => ({
      sourceId: s.id,
      source: SOURCE,
      name: s.attributes?.name,
      enabled: s.attributes?.enabled,
      stepCount: s.attributes?.sequenceStepCount,
      openRate: s.attributes?.openRate,
      clickRate: s.attributes?.clickRate,
      replyRate: s.attributes?.replyRate,
    }));
  }

  _normalizeMailingRecords(mailings) {
    return mailings.map(m => ({
      sourceId: m.id,
      source: SOURCE,
      state: m.attributes?.state,
      openCount: m.attributes?.openCount,
      clickCount: m.attributes?.clickCount,
      repliedAt: m.attributes?.repliedAt,
      bouncedAt: m.attributes?.bouncedAt,
      deliveredAt: m.attributes?.deliveredAt,
      subject: m.attributes?.subject,
    }));
  }
}

module.exports = { OutreachIntegration };
