/**
 * Tests for Clay Automation Hub
 */

const { CONFIG, validateConfig } = require('./config');
const { ApiClient } = require('./utils/api-client');
const { ClayTableManager, TABLE_SCHEMAS } = require('./tables/clay-table');
const { AutomationRecipes } = require('./workflows/automation-recipes');

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  PASS: ${message}`);
    passed++;
  } else {
    console.log(`  FAIL: ${message}`);
    failed++;
  }
}

function section(name) {
  console.log(`\n  ── ${name} ──`);
}

// ── Config Tests ──

section('Configuration');

assert(typeof CONFIG === 'object', 'CONFIG is an object');
assert(typeof CONFIG.clay === 'object', 'CONFIG.clay exists');
assert(typeof CONFIG.dealcloud === 'object', 'CONFIG.dealcloud exists');
assert(typeof CONFIG.zoom === 'object', 'CONFIG.zoom exists');
assert(typeof CONFIG.outreach === 'object', 'CONFIG.outreach exists');
assert(typeof CONFIG.gmail === 'object', 'CONFIG.gmail exists');
assert(typeof CONFIG.automation === 'object', 'CONFIG.automation exists');

assert(CONFIG.clay.baseUrl === 'https://api.clay.com/v1', 'Clay base URL is correct');
assert(CONFIG.dealcloud.entities.includes('deals'), 'Dealcloud entities include deals');
assert(CONFIG.dealcloud.entities.includes('contacts'), 'Dealcloud entities include contacts');
assert(CONFIG.zoom.baseUrl === 'https://api.zoom.us/v2', 'Zoom base URL is correct');
assert(CONFIG.outreach.baseUrl === 'https://api.outreach.io/api/v2', 'Outreach base URL is correct');
assert(CONFIG.gmail.scopes.length === 3, 'Gmail has 3 scopes configured');

assert(CONFIG.automation.maxRetries === 3, 'Max retries is 3');
assert(CONFIG.automation.batchSize === 50, 'Batch size is 50');
assert(typeof CONFIG.dealcloud.syncIntervalMinutes === 'number', 'Dealcloud sync interval is a number');
assert(typeof CONFIG.zoom.syncIntervalMinutes === 'number', 'Zoom sync interval is a number');

section('Config Validation');

const validation = validateConfig();
assert(typeof validation === 'object', 'validateConfig returns an object');
assert(typeof validation.valid === 'boolean', 'validation has valid property');
assert(Array.isArray(validation.missing), 'validation has missing array');
// Without env vars set, validation should report missing keys
assert(validation.missing.length > 0, 'Missing keys detected when env vars not set');

// ── API Client Tests ──

section('API Client');

const client = new ApiClient('https://api.example.com', { Authorization: 'Bearer test' }, { maxRetries: 2 });
assert(client.baseUrl === 'https://api.example.com', 'Base URL set correctly');
assert(client.defaultHeaders.Authorization === 'Bearer test', 'Default headers set correctly');
assert(client.maxRetries === 2, 'Max retries set correctly');
assert(typeof client.get === 'function', 'get method exists');
assert(typeof client.post === 'function', 'post method exists');
assert(typeof client.put === 'function', 'put method exists');
assert(typeof client.patch === 'function', 'patch method exists');
assert(typeof client.delete === 'function', 'delete method exists');

const retryable = client._isRetryable({ statusCode: 429 });
assert(retryable === true, '429 is retryable');
const retryable500 = client._isRetryable({ statusCode: 500 });
assert(retryable500 === true, '500 is retryable');
const notRetryable = client._isRetryable({ statusCode: 400 });
assert(notRetryable === false, '400 is not retryable');
const networkError = client._isRetryable({});
assert(networkError === true, 'Network errors are retryable');

// ── Table Schema Tests ──

section('Table Schemas');

assert(Object.keys(TABLE_SCHEMAS).length === 5, '5 table schemas defined');
assert(TABLE_SCHEMAS.contacts.name === 'Contacts — Master', 'Contacts table name correct');
assert(TABLE_SCHEMAS.companies.name === 'Companies — Master', 'Companies table name correct');
assert(TABLE_SCHEMAS.deals.name === 'Deals — Pipeline', 'Deals table name correct');
assert(TABLE_SCHEMAS.meetings.name === 'Meetings — Activity Log', 'Meetings table name correct');
assert(TABLE_SCHEMAS.emailActivity.name === 'Email Activity — Engagement', 'Email activity table name correct');

// Verify contacts table has key columns
const contactCols = TABLE_SCHEMAS.contacts.columns.map(c => c.name);
assert(contactCols.includes('email'), 'Contacts table has email column');
assert(contactCols.includes('firstName'), 'Contacts table has firstName column');
assert(contactCols.includes('company'), 'Contacts table has company column');
assert(contactCols.includes('dealcloudId'), 'Contacts table has dealcloudId column');
assert(contactCols.includes('outreachId'), 'Contacts table has outreachId column');
assert(contactCols.includes('lastMeetingDate'), 'Contacts table has lastMeetingDate column');
assert(contactCols.includes('engagementScore'), 'Contacts table has engagementScore column');

// Verify meetings table has key columns
const meetingCols = TABLE_SCHEMAS.meetings.columns.map(c => c.name);
assert(meetingCols.includes('zoomMeetingId'), 'Meetings table has zoomMeetingId column');
assert(meetingCols.includes('transcriptSummary'), 'Meetings table has transcriptSummary column');
assert(meetingCols.includes('followUpStatus'), 'Meetings table has followUpStatus column');

// ── Integration Module Tests ──

section('Integration Modules');

const { DealcloudIntegration } = require('./integrations/dealcloud');
const dc = new DealcloudIntegration();
assert(typeof dc.initialize === 'function', 'Dealcloud has initialize method');
assert(typeof dc.getDeals === 'function', 'Dealcloud has getDeals method');
assert(typeof dc.getContacts === 'function', 'Dealcloud has getContacts method');
assert(typeof dc.pullAllForClaySync === 'function', 'Dealcloud has pullAllForClaySync method');
assert(typeof dc.addNoteToContact === 'function', 'Dealcloud has addNoteToContact method');

const { ZoomIntegration } = require('./integrations/zoom');
const zm = new ZoomIntegration();
assert(typeof zm.initialize === 'function', 'Zoom has initialize method');
assert(typeof zm.listMeetings === 'function', 'Zoom has listMeetings method');
assert(typeof zm.getMeetingParticipants === 'function', 'Zoom has getMeetingParticipants method');
assert(typeof zm.getTranscript === 'function', 'Zoom has getTranscript method');
assert(typeof zm.pullAllForClaySync === 'function', 'Zoom has pullAllForClaySync method');
assert(typeof zm.handleWebhook === 'function', 'Zoom has handleWebhook method');

const { OutreachIntegration } = require('./integrations/outreach');
const or = new OutreachIntegration();
assert(typeof or.initialize === 'function', 'Outreach has initialize method');
assert(typeof or.getProspects === 'function', 'Outreach has getProspects method');
assert(typeof or.createProspect === 'function', 'Outreach has createProspect method');
assert(typeof or.addProspectToSequence === 'function', 'Outreach has addProspectToSequence method');
assert(typeof or.getSequences === 'function', 'Outreach has getSequences method');
assert(typeof or.pullAllForClaySync === 'function', 'Outreach has pullAllForClaySync method');

const { GmailIntegration } = require('./integrations/gmail');
const gm = new GmailIntegration();
assert(typeof gm.initialize === 'function', 'Gmail has initialize method');
assert(typeof gm.listMessages === 'function', 'Gmail has listMessages method');
assert(typeof gm.sendEmail === 'function', 'Gmail has sendEmail method');
assert(typeof gm.createDraft === 'function', 'Gmail has createDraft method');
assert(typeof gm.extractContactsFromMessages === 'function', 'Gmail has extractContactsFromMessages method');
assert(typeof gm.pullAllForClaySync === 'function', 'Gmail has pullAllForClaySync method');

// ── Gmail Contact Extraction Tests ──

section('Gmail Contact Extraction');

const testMessages = [
  {
    id: 'msg1',
    threadId: 'thread1',
    payload: {
      headers: [
        { name: 'From', value: 'John Doe <john@example.com>' },
        { name: 'To', value: 'jane@company.com' },
        { name: 'Date', value: '2024-01-15' },
      ],
    },
  },
  {
    id: 'msg2',
    threadId: 'thread1',
    payload: {
      headers: [
        { name: 'From', value: 'jane@company.com' },
        { name: 'To', value: '"John Doe" <john@example.com>' },
        { name: 'Date', value: '2024-01-16' },
      ],
    },
  },
];

const extractedContacts = gm.extractContactsFromMessages(testMessages);
assert(extractedContacts.length === 2, 'Extracted 2 unique contacts');
const johnContact = extractedContacts.find(c => c.email === 'john@example.com');
assert(johnContact !== undefined, 'Found john@example.com');
assert(johnContact.messageCount === 2, 'John appeared in 2 messages');
const janeContact = extractedContacts.find(c => c.email === 'jane@company.com');
assert(janeContact !== undefined, 'Found jane@company.com');

// ── Zoom Webhook Tests ──

section('Zoom Webhook Handling');

const meetingEndedEvent = zm.handleWebhook({
  event: 'meeting.ended',
  payload: { object: { id: '12345' } },
});
assert(meetingEndedEvent?.action === 'sync_meeting', 'meeting.ended triggers sync_meeting');
assert(meetingEndedEvent?.meetingId === '12345', 'Correct meeting ID extracted');

const recordingEvent = zm.handleWebhook({
  event: 'recording.completed',
  payload: { object: { id: '67890' } },
});
assert(recordingEvent?.action === 'sync_recording', 'recording.completed triggers sync_recording');

const unknownEvent = zm.handleWebhook({ event: 'unknown.event', payload: {} });
assert(unknownEvent === null, 'Unknown events return null');

// ── Automation Recipes Tests ──

section('Automation Recipes');

const recipes = new AutomationRecipes(null);
const available = recipes.getAvailableRecipes();
assert(available.length === 6, '6 automation recipes available');
assert(available.every(r => r.id && r.name && r.trigger), 'All recipes have id, name, trigger');
assert(available.every(r => r.timeSaved), 'All recipes have timeSaved estimate');
assert(available.some(r => r.id === 'post_meeting_followup'), 'Post-meeting follow-up recipe exists');
assert(available.some(r => r.id === 'new_deal_enrich'), 'New deal enrichment recipe exists');
assert(available.some(r => r.id === 'email_reply_detected'), 'Email reply detection recipe exists');
assert(available.some(r => r.id === 'weekly_digest'), 'Weekly digest recipe exists');

const emailExtract = recipes._extractEmail('John Doe <john@test.com>');
assert(emailExtract === 'john@test.com', 'Email extraction works with display name');
const plainEmail = recipes._extractEmail('plain@test.com');
assert(plainEmail === 'plain@test.com', 'Email extraction works with plain email');
const nullEmail = recipes._extractEmail(null);
assert(nullEmail === null, 'Email extraction handles null');

// ── Dealcloud Normalization Tests ──

section('Dealcloud Data Normalization');

const testDeals = [
  { id: 'd1', name: 'Big Deal', stage: 'Pipeline', value: 1000000, company: 'Acme', owner: 'Alice', createdAt: '2024-01-01' },
  { id: 'd2', dealName: 'Small Deal', pipelineStage: 'Closed', dealSize: 50000, companyName: 'Beta', assignedTo: 'Bob' },
];
const normalized = dc._normalizeDealRecords(testDeals);
assert(normalized.length === 2, 'Normalized 2 deal records');
assert(normalized[0].sourceId === 'd1', 'First deal sourceId correct');
assert(normalized[0].name === 'Big Deal', 'First deal name correct');
assert(normalized[1].name === 'Small Deal', 'Second deal uses dealName fallback');
assert(normalized[1].stage === 'Closed', 'Second deal uses pipelineStage fallback');
assert(normalized[1].value === 50000, 'Second deal uses dealSize fallback');

const emptyNorm = dc._normalizeDealRecords(null);
assert(Array.isArray(emptyNorm) && emptyNorm.length === 0, 'Normalization handles null input');

// ── Summary ──

console.log('');
console.log('  ═══════════════════════');
console.log(`  Results: ${passed} passed, ${failed} failed`);
console.log('  ═══════════════════════');
console.log('');

process.exit(failed > 0 ? 1 : 0);
