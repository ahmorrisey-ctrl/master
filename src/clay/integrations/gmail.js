/**
 * Gmail Integration for Clay
 *
 * Tracks email conversations, syncs contact activity, and enables
 * sending follow-ups directly from Clay automation workflows.
 *
 * Automatable tasks (~10% of workflow):
 * - Auto-log email threads with Dealcloud contacts
 * - Track response times and engagement patterns
 * - Detect warm intros and auto-enrich new contacts
 * - Draft and queue follow-up emails via templates
 */

const { ApiClient } = require('../utils/api-client');
const { CONFIG } = require('../config');
const logger = require('../utils/logger');

const SOURCE = 'gmail';

class GmailIntegration {
  constructor() {
    this.config = CONFIG.gmail;
    this.client = null;
    this.accessToken = null;
    this.tokenExpiry = 0;
  }

  async initialize() {
    await this._authenticate();
    this.client = new ApiClient('https://gmail.googleapis.com', {
      Authorization: `Bearer ${this.accessToken}`,
    });
    logger.info(SOURCE, 'Gmail integration initialized');
  }

  async _authenticate() {
    const authClient = new ApiClient('https://oauth2.googleapis.com');
    const response = await authClient.post('/token', {
      grant_type: 'refresh_token',
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      refresh_token: this.config.refreshToken,
    });
    this.accessToken = response.data.access_token;
    this.tokenExpiry = Date.now() + (response.data.expires_in * 1000);
    logger.info(SOURCE, 'Authenticated with Gmail');
  }

  async _ensureAuth() {
    if (Date.now() >= this.tokenExpiry - 60000) {
      await this._authenticate();
      this.client = new ApiClient('https://gmail.googleapis.com', {
        Authorization: `Bearer ${this.accessToken}`,
      });
    }
  }

  // ── Message Operations ──

  async listMessages(query = '', maxResults = 50) {
    await this._ensureAuth();
    const params = new URLSearchParams();
    if (query) params.set('q', query);
    params.set('maxResults', String(maxResults));

    const response = await this.client.get(
      `/gmail/v1/users/me/messages?${params.toString()}`
    );
    const messageIds = response.data.messages || [];
    logger.info(SOURCE, `Found ${messageIds.length} messages matching query`);
    return messageIds;
  }

  async getMessage(messageId, format = 'full') {
    await this._ensureAuth();
    const response = await this.client.get(
      `/gmail/v1/users/me/messages/${messageId}?format=${format}`
    );
    return response.data;
  }

  async getThread(threadId) {
    await this._ensureAuth();
    const response = await this.client.get(
      `/gmail/v1/users/me/threads/${threadId}?format=full`
    );
    return response.data;
  }

  async getRecentEmails(afterDate, labels = ['INBOX', 'SENT']) {
    const dateStr = afterDate instanceof Date
      ? Math.floor(afterDate.getTime() / 1000)
      : afterDate;
    const labelQuery = labels.map(l => `label:${l}`).join(' OR ');
    const query = `after:${dateStr} (${labelQuery})`;
    const messageRefs = await this.listMessages(query, 100);

    const messages = [];
    // Fetch in batches to avoid rate limits
    const batchSize = 10;
    for (let i = 0; i < messageRefs.length; i += batchSize) {
      const batch = messageRefs.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map(ref => this.getMessage(ref.id, 'metadata').catch(() => null))
      );
      messages.push(...batchResults.filter(Boolean));
    }

    return messages;
  }

  // ── Send Operations ──

  async sendEmail(to, subject, body, options = {}) {
    await this._ensureAuth();

    const headers = [
      `To: ${to}`,
      `Subject: ${subject}`,
      'Content-Type: text/html; charset=utf-8',
    ];
    if (options.cc) headers.push(`Cc: ${options.cc}`);
    if (options.bcc) headers.push(`Bcc: ${options.bcc}`);
    if (options.replyToMessageId) {
      headers.push(`In-Reply-To: ${options.replyToMessageId}`);
      headers.push(`References: ${options.replyToMessageId}`);
    }

    const emailContent = headers.join('\r\n') + '\r\n\r\n' + body;
    const encodedMessage = Buffer.from(emailContent).toString('base64url');

    const payload = { raw: encodedMessage };
    if (options.threadId) payload.threadId = options.threadId;

    const response = await this.client.post(
      '/gmail/v1/users/me/messages/send',
      payload
    );
    logger.info(SOURCE, `Sent email to ${to}: ${subject}`);
    return response.data;
  }

  async createDraft(to, subject, body, options = {}) {
    await this._ensureAuth();

    const headers = [
      `To: ${to}`,
      `Subject: ${subject}`,
      'Content-Type: text/html; charset=utf-8',
    ];
    if (options.cc) headers.push(`Cc: ${options.cc}`);

    const emailContent = headers.join('\r\n') + '\r\n\r\n' + body;
    const encodedMessage = Buffer.from(emailContent).toString('base64url');

    const payload = { message: { raw: encodedMessage } };
    if (options.threadId) payload.message.threadId = options.threadId;

    const response = await this.client.post(
      '/gmail/v1/users/me/drafts',
      payload
    );
    logger.info(SOURCE, `Created draft for ${to}: ${subject}`);
    return response.data;
  }

  // ── Label Operations ──

  async getLabels() {
    await this._ensureAuth();
    const response = await this.client.get('/gmail/v1/users/me/labels');
    return response.data.labels || [];
  }

  // ── Contact Extraction ──

  extractContactsFromMessages(messages) {
    const contactMap = new Map();

    for (const msg of messages) {
      const headers = msg.payload?.headers || [];
      const fromHeader = headers.find(h => h.name.toLowerCase() === 'from');
      const toHeader = headers.find(h => h.name.toLowerCase() === 'to');
      const dateHeader = headers.find(h => h.name.toLowerCase() === 'date');

      for (const header of [fromHeader, toHeader].filter(Boolean)) {
        const parsed = this._parseEmailHeader(header.value);
        for (const contact of parsed) {
          if (!contactMap.has(contact.email)) {
            contactMap.set(contact.email, {
              email: contact.email,
              name: contact.name,
              messageCount: 0,
              lastMessageDate: null,
              threadIds: new Set(),
            });
          }
          const entry = contactMap.get(contact.email);
          entry.messageCount++;
          if (dateHeader) entry.lastMessageDate = dateHeader.value;
          if (msg.threadId) entry.threadIds.add(msg.threadId);
        }
      }
    }

    return Array.from(contactMap.values()).map(c => ({
      ...c,
      threadIds: Array.from(c.threadIds),
    }));
  }

  _parseEmailHeader(headerValue) {
    if (!headerValue) return [];
    const results = [];
    const parts = headerValue.split(',');
    for (const part of parts) {
      const match = part.match(/(?:"?([^"]*)"?\s)?<?([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})>?/);
      if (match) {
        results.push({ name: (match[1] || '').trim(), email: match[2].toLowerCase() });
      }
    }
    return results;
  }

  // ── Sync for Clay Tables ──

  async pullAllForClaySync(lastSyncTime) {
    await this._ensureAuth();

    const afterDate = lastSyncTime || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const messages = await this.getRecentEmails(afterDate);
    const contacts = this.extractContactsFromMessages(messages);

    logger.info(SOURCE, 'Pulled data for Clay sync', {
      messages: messages.length,
      uniqueContacts: contacts.length,
    });

    return {
      emails: this._normalizeEmailRecords(messages),
      contacts: this._normalizeGmailContacts(contacts),
    };
  }

  _normalizeEmailRecords(messages) {
    return messages.map(msg => {
      const headers = msg.payload?.headers || [];
      const getHeader = (name) => headers.find(h => h.name.toLowerCase() === name)?.value;

      return {
        sourceId: msg.id,
        source: SOURCE,
        threadId: msg.threadId,
        from: getHeader('from'),
        to: getHeader('to'),
        subject: getHeader('subject'),
        date: getHeader('date'),
        snippet: msg.snippet,
        labels: msg.labelIds || [],
      };
    });
  }

  _normalizeGmailContacts(contacts) {
    return contacts.map(c => ({
      source: SOURCE,
      email: c.email,
      name: c.name,
      emailCount: c.messageCount,
      lastEmailDate: c.lastMessageDate,
      threadCount: c.threadIds.length,
    }));
  }
}

module.exports = { GmailIntegration };
