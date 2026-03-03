/**
 * Zoom Integration for Clay
 *
 * Pulls meeting data, participant info, recordings, and transcripts
 * into Clay tables for relationship tracking and follow-up automation.
 *
 * Automatable tasks (~10% of workflow):
 * - Auto-log meetings with contacts in Clay/Dealcloud
 * - Extract action items from transcripts
 * - Trigger post-meeting follow-up sequences in Outreach
 * - Track meeting frequency per contact/company
 */

const { ApiClient } = require('../utils/api-client');
const { CONFIG } = require('../config');
const logger = require('../utils/logger');

const SOURCE = 'zoom';

class ZoomIntegration {
  constructor() {
    this.config = CONFIG.zoom;
    this.client = null;
    this.accessToken = null;
    this.tokenExpiry = 0;
  }

  async initialize() {
    await this._authenticate();
    this.client = new ApiClient(this.config.baseUrl, {
      Authorization: `Bearer ${this.accessToken}`,
    });
    logger.info(SOURCE, 'Zoom integration initialized');
  }

  async _authenticate() {
    const credentials = Buffer.from(
      `${this.config.clientId}:${this.config.clientSecret}`
    ).toString('base64');

    const authClient = new ApiClient('https://zoom.us');
    const response = await authClient.post(
      `/oauth/token?grant_type=account_credentials&account_id=${this.config.accountId}`,
      null,
      { Authorization: `Basic ${credentials}` }
    );
    this.accessToken = response.data.access_token;
    this.tokenExpiry = Date.now() + (response.data.expires_in * 1000);
    logger.info(SOURCE, 'Authenticated with Zoom');
  }

  async _ensureAuth() {
    if (Date.now() >= this.tokenExpiry - 60000) {
      await this._authenticate();
      this.client = new ApiClient(this.config.baseUrl, {
        Authorization: `Bearer ${this.accessToken}`,
      });
    }
  }

  // ── Meeting Operations ──

  async listMeetings(userId = 'me', options = {}) {
    await this._ensureAuth();
    const params = new URLSearchParams();
    params.set('type', options.type || 'scheduled');
    if (options.from) params.set('from', options.from);
    if (options.to) params.set('to', options.to);
    params.set('page_size', String(options.pageSize || 30));

    const response = await this.client.get(
      `/users/${userId}/meetings?${params.toString()}`
    );
    logger.info(SOURCE, `Listed ${response.data.meetings?.length || 0} meetings`);
    return response.data.meetings || [];
  }

  async getPastMeetings(userId = 'me', fromDate, toDate) {
    return this.listMeetings(userId, {
      type: 'past',
      from: fromDate,
      to: toDate,
    });
  }

  async getMeetingDetails(meetingId) {
    await this._ensureAuth();
    const response = await this.client.get(`/meetings/${meetingId}`);
    return response.data;
  }

  async getMeetingParticipants(meetingId) {
    await this._ensureAuth();
    const response = await this.client.get(
      `/past_meetings/${meetingId}/participants?page_size=100`
    );
    return response.data.participants || [];
  }

  // ── Recording & Transcript Operations ──

  async getMeetingRecordings(meetingId) {
    await this._ensureAuth();
    const response = await this.client.get(`/meetings/${meetingId}/recordings`);
    return response.data;
  }

  async listRecordings(userId = 'me', fromDate, toDate) {
    await this._ensureAuth();
    const params = new URLSearchParams();
    if (fromDate) params.set('from', fromDate);
    if (toDate) params.set('to', toDate);
    params.set('page_size', '100');

    const response = await this.client.get(
      `/users/${userId}/recordings?${params.toString()}`
    );
    return response.data.meetings || [];
  }

  async getTranscript(meetingId) {
    await this._ensureAuth();
    try {
      const recordings = await this.getMeetingRecordings(meetingId);
      const transcriptFile = recordings.recording_files?.find(
        f => f.file_type === 'TRANSCRIPT'
      );
      if (!transcriptFile) return null;

      const response = await this.client.get(
        transcriptFile.download_url.replace(this.config.baseUrl, ''),
        { Authorization: `Bearer ${this.accessToken}` }
      );
      return response.data;
    } catch (err) {
      logger.warn(SOURCE, `No transcript available for meeting ${meetingId}`);
      return null;
    }
  }

  // ── Sync for Clay Tables ──

  async pullAllForClaySync(lastSyncTime) {
    await this._ensureAuth();

    const fromDate = lastSyncTime
      ? lastSyncTime.toISOString().split('T')[0]
      : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const toDate = new Date().toISOString().split('T')[0];

    const meetings = await this.getPastMeetings('me', fromDate, toDate);
    const enrichedMeetings = [];

    for (const meeting of meetings) {
      try {
        const [participants, transcript] = await Promise.all([
          this.getMeetingParticipants(meeting.id).catch(() => []),
          this.config.pullTranscripts ? this.getTranscript(meeting.id) : null,
        ]);

        enrichedMeetings.push(this._normalizeMeetingRecord(meeting, participants, transcript));
      } catch (err) {
        logger.warn(SOURCE, `Failed to enrich meeting ${meeting.id}`, { error: err.message });
        enrichedMeetings.push(this._normalizeMeetingRecord(meeting, [], null));
      }
    }

    logger.info(SOURCE, `Pulled ${enrichedMeetings.length} meetings for Clay sync`);
    return { meetings: enrichedMeetings };
  }

  _normalizeMeetingRecord(meeting, participants, transcript) {
    return {
      sourceId: String(meeting.id || meeting.uuid),
      source: SOURCE,
      topic: meeting.topic,
      startTime: meeting.start_time,
      duration: meeting.duration,
      participantCount: participants.length,
      participants: participants.map(p => ({
        name: p.name,
        email: p.user_email || p.email,
        joinTime: p.join_time,
        leaveTime: p.leave_time,
        duration: p.duration,
      })),
      hasRecording: meeting.recording_count > 0,
      hasTranscript: !!transcript,
      transcriptSummary: transcript ? this._summarizeTranscript(transcript) : null,
      hostEmail: meeting.host_email,
      meetingType: meeting.type,
    };
  }

  _summarizeTranscript(transcript) {
    if (typeof transcript === 'string') {
      return transcript.substring(0, 2000);
    }
    if (transcript?.content) {
      return transcript.content.substring(0, 2000);
    }
    return null;
  }

  // ── Webhook Handler ──

  handleWebhook(event) {
    const eventType = event.event;
    const payload = event.payload?.object;

    switch (eventType) {
      case 'meeting.ended':
        return { action: 'sync_meeting', meetingId: payload?.id, data: payload };
      case 'recording.completed':
        return { action: 'sync_recording', meetingId: payload?.id, data: payload };
      default:
        logger.debug(SOURCE, `Unhandled webhook event: ${eventType}`);
        return null;
    }
  }
}

module.exports = { ZoomIntegration };
