/**
 * Webhook Server
 *
 * Receives real-time events from Zoom, Outreach, and Dealcloud
 * to trigger automation recipes immediately instead of waiting for polling.
 */

const http = require('http');
const { CONFIG } = require('../config');
const logger = require('../utils/logger');

const SOURCE = 'webhooks';

class WebhookServer {
  constructor(syncEngine, recipes) {
    this.engine = syncEngine;
    this.recipes = recipes;
    this.server = null;
  }

  start() {
    const port = CONFIG.automation.webhookPort;

    this.server = http.createServer(async (req, res) => {
      if (req.method !== 'POST') {
        res.writeHead(405);
        res.end('Method not allowed');
        return;
      }

      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', async () => {
        try {
          const payload = JSON.parse(body);
          const result = await this._routeWebhook(req.url, payload);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, result }));
        } catch (err) {
          logger.error(SOURCE, `Webhook error: ${req.url}`, { error: err.message });
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: err.message }));
        }
      });
    });

    this.server.listen(port, () => {
      logger.info(SOURCE, `Webhook server listening on port ${port}`);
      logger.info(SOURCE, 'Registered endpoints:');
      logger.info(SOURCE, `  POST /webhooks/zoom     — Zoom meeting events`);
      logger.info(SOURCE, `  POST /webhooks/outreach — Outreach engagement events`);
      logger.info(SOURCE, `  POST /webhooks/dealcloud — Dealcloud pipeline events`);
    });
  }

  async _routeWebhook(url, payload) {
    switch (url) {
      case '/webhooks/zoom':
        return this._handleZoomWebhook(payload);
      case '/webhooks/outreach':
        return this._handleOutreachWebhook(payload);
      case '/webhooks/dealcloud':
        return this._handleDealcloudWebhook(payload);
      default:
        logger.warn(SOURCE, `Unknown webhook endpoint: ${url}`);
        return { ignored: true };
    }
  }

  async _handleZoomWebhook(payload) {
    const event = this.engine.zoom.handleWebhook(payload);
    if (!event) return { ignored: true };

    if (event.action === 'sync_meeting') {
      // Fetch full meeting details and trigger follow-up recipe
      const meeting = await this.engine.zoom.getMeetingDetails(event.meetingId);
      const participants = await this.engine.zoom.getMeetingParticipants(event.meetingId);
      const transcript = await this.engine.zoom.getTranscript(event.meetingId);

      const normalized = {
        sourceId: String(event.meetingId),
        topic: meeting.topic,
        startTime: meeting.start_time,
        duration: meeting.duration,
        hostEmail: meeting.host_email,
        participants: participants.map(p => ({
          name: p.name,
          email: p.user_email || p.email,
        })),
        participantCount: participants.length,
        hasRecording: false,
        hasTranscript: !!transcript,
        transcriptSummary: transcript ? transcript.toString().substring(0, 2000) : null,
      };

      return this.recipes.postMeetingFollowUp(normalized);
    }

    return { event: event.action };
  }

  async _handleOutreachWebhook(payload) {
    const eventType = payload.meta?.eventName || payload.event;

    if (eventType === 'prospect.replied') {
      const prospect = payload.data;
      return this.recipes.emailReplyDetected({
        from: prospect?.attributes?.emails?.[0],
        subject: 'Outreach reply',
        date: new Date().toISOString(),
        source: 'outreach',
      });
    }

    return { event: eventType, ignored: true };
  }

  async _handleDealcloudWebhook(payload) {
    const eventType = payload.event || payload.type;

    if (eventType === 'deal.created') {
      return this.recipes.newDealEnrichAndOutreach(payload.data);
    }

    if (eventType === 'deal.stage_changed') {
      return this.recipes.dealStageChanged(
        payload.data,
        payload.data.previousStage,
        payload.data.currentStage || payload.data.stage
      );
    }

    if (eventType === 'contact.created') {
      return this.recipes.enrichNewContact(payload.data);
    }

    return { event: eventType, ignored: true };
  }

  stop() {
    if (this.server) {
      this.server.close();
      logger.info(SOURCE, 'Webhook server stopped');
    }
  }
}

module.exports = { WebhookServer };
