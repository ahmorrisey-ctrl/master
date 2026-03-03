/**
 * Clay Sync Engine
 *
 * Orchestrates data flow between all integrations and Clay tables.
 * Runs periodic syncs and handles webhook-triggered updates.
 *
 * Sync flow:
 * 1. Pull new/updated data from each integration
 * 2. Normalize records to Clay table schemas
 * 3. Upsert into Clay tables (deduplicated by email/sourceId)
 * 4. Trigger enrichments on new rows
 * 5. Fire automation rules for changed data
 */

const { DealcloudIntegration } = require('../integrations/dealcloud');
const { ZoomIntegration } = require('../integrations/zoom');
const { OutreachIntegration } = require('../integrations/outreach');
const { GmailIntegration } = require('../integrations/gmail');
const { ClayTableManager, TABLE_SCHEMAS } = require('../tables/clay-table');
const logger = require('../utils/logger');

const SOURCE = 'sync-engine';

class SyncEngine {
  constructor() {
    this.dealcloud = new DealcloudIntegration();
    this.zoom = new ZoomIntegration();
    this.outreach = new OutreachIntegration();
    this.gmail = new GmailIntegration();
    this.tables = new ClayTableManager();

    this.tableIds = {};
    this.lastSyncTimes = {};
    this.syncIntervals = {};
  }

  async initialize() {
    logger.info(SOURCE, 'Initializing sync engine...');

    // Initialize all integrations in parallel
    await Promise.all([
      this.dealcloud.initialize().catch(e => logger.error(SOURCE, 'Dealcloud init failed', { error: e.message })),
      this.zoom.initialize().catch(e => logger.error(SOURCE, 'Zoom init failed', { error: e.message })),
      this.outreach.initialize().catch(e => logger.error(SOURCE, 'Outreach init failed', { error: e.message })),
      this.gmail.initialize().catch(e => logger.error(SOURCE, 'Gmail init failed', { error: e.message })),
    ]);

    // Ensure Clay tables exist
    await this._ensureTables();

    logger.info(SOURCE, 'Sync engine initialized');
  }

  async _ensureTables() {
    const existingTables = await this.tables.listTables();
    const existingNames = new Set(Array.isArray(existingTables) ? existingTables.map(t => t.name) : []);

    for (const [key, schema] of Object.entries(TABLE_SCHEMAS)) {
      if (existingNames.has(schema.name)) {
        const existing = existingTables.find(t => t.name === schema.name);
        this.tableIds[key] = existing.id;
        logger.info(SOURCE, `Table exists: ${schema.name} (${existing.id})`);
      } else {
        try {
          const created = await this.tables.createTable(schema.name, schema.columns);
          this.tableIds[key] = created.id;
          logger.info(SOURCE, `Created table: ${schema.name}`);
        } catch (err) {
          logger.error(SOURCE, `Failed to create table: ${schema.name}`, { error: err.message });
        }
      }
    }
  }

  // ── Full Sync ──

  async runFullSync() {
    logger.info(SOURCE, '=== Starting full sync ===');
    const startTime = Date.now();

    const results = {
      dealcloud: null,
      zoom: null,
      outreach: null,
      gmail: null,
      errors: [],
    };

    // Pull data from all sources in parallel
    const [dcData, zoomData, outreachData, gmailData] = await Promise.all([
      this._syncDealcloud().catch(e => { results.errors.push({ source: 'dealcloud', error: e.message }); return null; }),
      this._syncZoom().catch(e => { results.errors.push({ source: 'zoom', error: e.message }); return null; }),
      this._syncOutreach().catch(e => { results.errors.push({ source: 'outreach', error: e.message }); return null; }),
      this._syncGmail().catch(e => { results.errors.push({ source: 'gmail', error: e.message }); return null; }),
    ]);

    results.dealcloud = dcData;
    results.zoom = zoomData;
    results.outreach = outreachData;
    results.gmail = gmailData;

    // Cross-reference and merge contact records
    await this._mergeContactRecords(dcData, outreachData, gmailData, zoomData);

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    logger.info(SOURCE, `=== Full sync completed in ${elapsed}s ===`, {
      errors: results.errors.length,
    });

    this.lastSyncTimes.full = new Date();
    return results;
  }

  async _syncDealcloud() {
    const data = await this.dealcloud.pullAllForClaySync(this.lastSyncTimes.dealcloud);
    this.lastSyncTimes.dealcloud = new Date();

    if (this.tableIds.deals && data.deals?.length) {
      await this.tables.upsertRows(this.tableIds.deals, 'dealcloudId', data.deals.map(d => ({
        ...d,
        dealcloudId: d.sourceId,
        lastSyncedAt: new Date().toISOString(),
      })));
    }

    if (this.tableIds.companies && data.companies?.length) {
      await this.tables.upsertRows(this.tableIds.companies, 'dealcloudId', data.companies.map(c => ({
        ...c,
        dealcloudId: c.sourceId,
        lastSyncedAt: new Date().toISOString(),
      })));
    }

    if (this.tableIds.contacts && data.contacts?.length) {
      await this.tables.upsertRows(this.tableIds.contacts, 'email', data.contacts.map(c => ({
        ...c,
        dealcloudId: c.sourceId,
        lastSyncedAt: new Date().toISOString(),
      })));
    }

    logger.info(SOURCE, 'Dealcloud sync complete');
    return data;
  }

  async _syncZoom() {
    const data = await this.zoom.pullAllForClaySync(this.lastSyncTimes.zoom);
    this.lastSyncTimes.zoom = new Date();

    if (this.tableIds.meetings && data.meetings?.length) {
      await this.tables.upsertRows(this.tableIds.meetings, 'zoomMeetingId', data.meetings.map(m => ({
        topic: m.topic,
        date: m.startTime,
        duration: m.duration,
        hostEmail: m.hostEmail,
        participantCount: m.participantCount,
        participants: JSON.stringify(m.participants),
        hasRecording: m.hasRecording,
        hasTranscript: m.hasTranscript,
        transcriptSummary: m.transcriptSummary,
        zoomMeetingId: m.sourceId,
        followUpStatus: 'pending',
        lastSyncedAt: new Date().toISOString(),
      })));
    }

    logger.info(SOURCE, 'Zoom sync complete');
    return data;
  }

  async _syncOutreach() {
    const data = await this.outreach.pullAllForClaySync(this.lastSyncTimes.outreach);
    this.lastSyncTimes.outreach = new Date();

    if (this.tableIds.contacts && data.prospects?.length) {
      await this.tables.upsertRows(this.tableIds.contacts, 'email', data.prospects.map(p => ({
        firstName: p.firstName,
        lastName: p.lastName,
        email: p.email,
        title: p.title,
        company: p.company,
        outreachId: p.sourceId,
        engagementScore: p.engagementScore,
        tags: p.tags,
        lastSyncedAt: new Date().toISOString(),
      })));
    }

    if (this.tableIds.emailActivity && data.emailActivity?.length) {
      await this.tables.upsertRows(this.tableIds.emailActivity, 'sourceId', data.emailActivity.map(m => ({
        sourceId: m.sourceId,
        source: 'outreach',
        subject: m.subject,
        opened: m.openCount > 0,
        clicked: m.clickCount > 0,
        replied: !!m.repliedAt,
        date: m.deliveredAt,
        lastSyncedAt: new Date().toISOString(),
      })));
    }

    logger.info(SOURCE, 'Outreach sync complete');
    return data;
  }

  async _syncGmail() {
    const data = await this.gmail.pullAllForClaySync(this.lastSyncTimes.gmail);
    this.lastSyncTimes.gmail = new Date();

    if (this.tableIds.contacts && data.contacts?.length) {
      await this.tables.upsertRows(this.tableIds.contacts, 'email', data.contacts.map(c => ({
        email: c.email,
        firstName: c.name?.split(' ')[0] || '',
        lastName: c.name?.split(' ').slice(1).join(' ') || '',
        emailCount: c.emailCount,
        lastEmailDate: c.lastEmailDate,
        lastSyncedAt: new Date().toISOString(),
      })));
    }

    if (this.tableIds.emailActivity && data.emails?.length) {
      await this.tables.upsertRows(this.tableIds.emailActivity, 'threadId', data.emails.map(e => ({
        contactEmail: e.from,
        subject: e.subject,
        date: e.date,
        source: 'gmail',
        threadId: e.threadId,
        direction: e.labels?.includes('SENT') ? 'outbound' : 'inbound',
        lastSyncedAt: new Date().toISOString(),
      })));
    }

    logger.info(SOURCE, 'Gmail sync complete');
    return data;
  }

  // ── Contact Merging ──

  async _mergeContactRecords(dcData, outreachData, gmailData, zoomData) {
    if (!this.tableIds.contacts) return;

    // Build email-based contact map from meetings
    if (zoomData?.meetings) {
      for (const meeting of zoomData.meetings) {
        for (const participant of (meeting.participants || [])) {
          if (participant.email) {
            await this.tables.upsertRow(this.tableIds.contacts, 'email', {
              email: participant.email,
              firstName: participant.name?.split(' ')[0] || '',
              lastName: participant.name?.split(' ').slice(1).join(' ') || '',
              lastMeetingDate: meeting.startTime,
              lastSyncedAt: new Date().toISOString(),
            });
          }
        }
      }
    }

    logger.info(SOURCE, 'Contact merge complete');
  }

  // ── Scheduled Sync ──

  startScheduledSync() {
    const { dealcloud, zoom, outreach, gmail } = {
      dealcloud: CONFIG.dealcloud.syncIntervalMinutes,
      zoom: CONFIG.zoom.syncIntervalMinutes,
      outreach: CONFIG.outreach.syncIntervalMinutes,
      gmail: CONFIG.gmail.syncIntervalMinutes,
    };

    this.syncIntervals.dealcloud = setInterval(() => this._syncDealcloud().catch(e =>
      logger.error(SOURCE, 'Scheduled Dealcloud sync failed', { error: e.message })
    ), dealcloud * 60 * 1000);

    this.syncIntervals.zoom = setInterval(() => this._syncZoom().catch(e =>
      logger.error(SOURCE, 'Scheduled Zoom sync failed', { error: e.message })
    ), zoom * 60 * 1000);

    this.syncIntervals.outreach = setInterval(() => this._syncOutreach().catch(e =>
      logger.error(SOURCE, 'Scheduled Outreach sync failed', { error: e.message })
    ), outreach * 60 * 1000);

    this.syncIntervals.gmail = setInterval(() => this._syncGmail().catch(e =>
      logger.error(SOURCE, 'Scheduled Gmail sync failed', { error: e.message })
    ), gmail * 60 * 1000);

    logger.info(SOURCE, 'Scheduled syncs started', {
      dealcloud: `every ${dealcloud}m`,
      zoom: `every ${zoom}m`,
      outreach: `every ${outreach}m`,
      gmail: `every ${gmail}m`,
    });
  }

  stopScheduledSync() {
    for (const [name, interval] of Object.entries(this.syncIntervals)) {
      clearInterval(interval);
      logger.info(SOURCE, `Stopped scheduled sync: ${name}`);
    }
    this.syncIntervals = {};
  }

  getStatus() {
    return {
      lastSyncTimes: { ...this.lastSyncTimes },
      tableIds: { ...this.tableIds },
      scheduledSyncs: Object.keys(this.syncIntervals),
    };
  }
}

module.exports = { SyncEngine };
