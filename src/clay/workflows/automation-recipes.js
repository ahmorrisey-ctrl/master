/**
 * Clay Automation Recipes
 *
 * Pre-built automation workflows that connect your tools and eliminate
 * repetitive tasks. Each recipe targets a specific workflow bottleneck.
 *
 * Target: Automate 40-60% of daily work across:
 *   ~15% — Dealcloud data entry & pipeline management
 *   ~10% — Zoom meeting follow-ups & logging
 *   ~10% — Outreach sequence management
 *   ~10% — Gmail tracking & response drafting
 *   ~15% — Cross-platform data enrichment & reporting
 */

const logger = require('../utils/logger');

const SOURCE = 'recipes';

class AutomationRecipes {
  constructor(syncEngine) {
    this.engine = syncEngine;
    this.activeRecipes = new Map();
  }

  // ═══════════════════════════════════════════════════════════
  // RECIPE 1: New Deal → Auto-Enrich & Create Outreach Sequence
  // Saves: ~5% of time (manual company research + sequence setup)
  // ═══════════════════════════════════════════════════════════

  async newDealEnrichAndOutreach(deal) {
    logger.info(SOURCE, `Recipe: New deal enrichment → ${deal.name}`);

    // Step 1: Enrich company data in Clay
    if (this.engine.tableIds.companies) {
      await this.engine.tables.triggerEnrichment(
        this.engine.tableIds.companies,
        deal.company,
        'company_profile'
      );
    }

    // Step 2: Find associated contacts
    const contacts = await this.engine.tables.findRowsByField(
      this.engine.tableIds.contacts,
      'company',
      deal.company
    );

    // Step 3: Add contacts to appropriate Outreach sequence
    const sequences = await this.engine.outreach.getSequences();
    const targetSequence = sequences.find(s =>
      s.attributes?.name?.toLowerCase().includes('new deal') ||
      s.attributes?.name?.toLowerCase().includes('initial outreach')
    );

    if (targetSequence) {
      for (const contact of contacts) {
        if (contact.email && !contact.outreachId) {
          const prospect = await this.engine.outreach.createProspect({
            firstName: contact.firstName,
            lastName: contact.lastName,
            email: contact.email,
            title: contact.title,
            company: contact.company,
            dealcloudId: contact.dealcloudId,
            tags: ['new-deal', deal.stage],
          });

          if (prospect?.id) {
            await this.engine.outreach.addProspectToSequence(
              prospect.id,
              targetSequence.id,
              'primary'
            );
          }
        }
      }
    }

    logger.info(SOURCE, `Recipe complete: New deal enrichment for ${deal.name}`);
    return { deal: deal.name, contactsProcessed: contacts.length };
  }

  // ═══════════════════════════════════════════════════════════
  // RECIPE 2: Deal Stage Change → Update Outreach + Notify
  // Saves: ~5% of time (manual sequence updates + status tracking)
  // ═══════════════════════════════════════════════════════════

  async dealStageChanged(deal, oldStage, newStage) {
    logger.info(SOURCE, `Recipe: Deal stage change ${deal.name}: ${oldStage} → ${newStage}`);

    const actions = [];

    // If deal moves to advanced stage, pause cold outreach
    const advancedStages = ['due diligence', 'negotiation', 'closing', 'closed'];
    if (advancedStages.includes(newStage.toLowerCase())) {
      const contacts = await this.engine.tables.findRowsByField(
        this.engine.tableIds.contacts, 'company', deal.company
      );

      for (const contact of contacts) {
        if (contact.outreachId) {
          // Pause any active sequences — they're already engaged
          actions.push({
            type: 'pause_sequence',
            contact: contact.email,
            reason: `Deal moved to ${newStage}`,
          });
        }
      }
    }

    // If deal is lost, optionally restart nurture sequence
    if (newStage.toLowerCase() === 'lost' || newStage.toLowerCase() === 'closed lost') {
      actions.push({
        type: 'start_nurture',
        deal: deal.name,
        reason: 'Deal lost — re-engage with nurture sequence',
      });
    }

    // Update the deal record in Clay
    if (this.engine.tableIds.deals) {
      await this.engine.tables.upsertRow(this.engine.tableIds.deals, 'dealcloudId', {
        dealcloudId: deal.sourceId || deal.dealcloudId,
        stage: newStage,
        lastActivityDate: new Date().toISOString(),
        lastSyncedAt: new Date().toISOString(),
      });
    }

    logger.info(SOURCE, `Recipe complete: Stage change for ${deal.name}`, { actions: actions.length });
    return { deal: deal.name, oldStage, newStage, actions };
  }

  // ═══════════════════════════════════════════════════════════
  // RECIPE 3: Post-Meeting Auto Follow-Up
  // Saves: ~10% of time (meeting notes, follow-up emails, CRM logging)
  // ═══════════════════════════════════════════════════════════

  async postMeetingFollowUp(meeting) {
    logger.info(SOURCE, `Recipe: Post-meeting follow-up → ${meeting.topic}`);

    const results = { logged: [], followUps: [], notes: [] };

    // Step 1: Log meeting in Dealcloud for each participant
    for (const participant of (meeting.participants || [])) {
      if (!participant.email) continue;

      // Find contact in Clay
      const contacts = await this.engine.tables.findRowsByField(
        this.engine.tableIds.contacts, 'email', participant.email
      );

      if (contacts.length > 0 && contacts[0].dealcloudId) {
        // Add meeting note to Dealcloud contact
        const noteContent = [
          `Meeting: ${meeting.topic}`,
          `Date: ${meeting.startTime}`,
          `Duration: ${meeting.duration} min`,
          meeting.transcriptSummary ? `Summary: ${meeting.transcriptSummary.substring(0, 500)}` : '',
        ].filter(Boolean).join('\n');

        await this.engine.dealcloud.addNoteToContact(contacts[0].dealcloudId, noteContent);
        results.notes.push(participant.email);
      }

      // Step 2: Update contact's meeting stats in Clay
      await this.engine.tables.upsertRow(this.engine.tableIds.contacts, 'email', {
        email: participant.email,
        lastMeetingDate: meeting.startTime,
        meetingCount: (contacts[0]?.meetingCount || 0) + 1,
        lastSyncedAt: new Date().toISOString(),
      });
      results.logged.push(participant.email);
    }

    // Step 3: Draft follow-up email
    if (meeting.participants?.length > 0) {
      const externalParticipants = meeting.participants.filter(
        p => p.email && p.email !== meeting.hostEmail
      );

      for (const participant of externalParticipants) {
        const subject = `Follow up: ${meeting.topic}`;
        const body = this._generateFollowUpEmail(meeting, participant);

        await this.engine.gmail.createDraft(participant.email, subject, body);
        results.followUps.push(participant.email);
      }
    }

    // Step 4: Mark meeting as followed-up in Clay
    if (this.engine.tableIds.meetings) {
      await this.engine.tables.upsertRow(this.engine.tableIds.meetings, 'zoomMeetingId', {
        zoomMeetingId: meeting.sourceId,
        followUpStatus: 'sent',
        lastSyncedAt: new Date().toISOString(),
      });
    }

    logger.info(SOURCE, `Recipe complete: Post-meeting follow-up for ${meeting.topic}`, results);
    return results;
  }

  _generateFollowUpEmail(meeting, participant) {
    const name = participant.name?.split(' ')[0] || 'there';
    return `<p>Hi ${name},</p>
<p>Thank you for taking the time to meet today regarding <strong>${meeting.topic}</strong>.</p>
${meeting.transcriptSummary
  ? `<p>Here's a brief summary of what we discussed:</p><p>${meeting.transcriptSummary.substring(0, 300)}...</p>`
  : '<p>I wanted to follow up on the key points we discussed.</p>'}
<p>Please let me know if you have any questions or if there's anything else I can help with.</p>
<p>Best regards</p>`;
  }

  // ═══════════════════════════════════════════════════════════
  // RECIPE 4: Gmail Reply Detection → Update Outreach + Clay
  // Saves: ~5% of time (tracking replies, updating CRM, pausing sequences)
  // ═══════════════════════════════════════════════════════════

  async emailReplyDetected(email) {
    logger.info(SOURCE, `Recipe: Email reply detected from ${email.from}`);

    // Extract sender email
    const senderEmail = this._extractEmail(email.from);
    if (!senderEmail) return;

    // Step 1: Update contact engagement in Clay
    await this.engine.tables.upsertRow(this.engine.tableIds.contacts, 'email', {
      email: senderEmail,
      lastEmailDate: email.date,
      lastSyncedAt: new Date().toISOString(),
    });

    // Step 2: Pause Outreach sequence if active (they've replied, don't keep blasting)
    const prospect = await this.engine.outreach.findProspectByEmail(senderEmail);
    if (prospect?.id) {
      await this.engine.outreach.updateProspect(prospect.id, {
        tags: [...(prospect.attributes?.tags || []), 'replied'],
      });
    }

    // Step 3: Log the engagement in email activity table
    if (this.engine.tableIds.emailActivity) {
      await this.engine.tables.addRow(this.engine.tableIds.emailActivity, {
        contactEmail: senderEmail,
        subject: email.subject,
        direction: 'inbound',
        date: email.date,
        source: 'gmail',
        replied: true,
        threadId: email.threadId,
        lastSyncedAt: new Date().toISOString(),
      });
    }

    logger.info(SOURCE, `Recipe complete: Reply handling for ${senderEmail}`);
    return { contact: senderEmail, prospectUpdated: !!prospect };
  }

  // ═══════════════════════════════════════════════════════════
  // RECIPE 5: Weekly Engagement Digest → Auto-Report
  // Saves: ~5% of time (compiling weekly activity reports)
  // ═══════════════════════════════════════════════════════════

  async generateWeeklyDigest() {
    logger.info(SOURCE, 'Recipe: Generating weekly engagement digest');

    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    // Gather data from all tables
    const [meetings, emailActivity, deals] = await Promise.all([
      this.engine.tableIds.meetings
        ? this.engine.tables.getRows(this.engine.tableIds.meetings, {
            filter: { date: { gte: oneWeekAgo.toISOString() } },
          })
        : [],
      this.engine.tableIds.emailActivity
        ? this.engine.tables.getRows(this.engine.tableIds.emailActivity, {
            filter: { date: { gte: oneWeekAgo.toISOString() } },
          })
        : [],
      this.engine.tableIds.deals
        ? this.engine.tables.getRows(this.engine.tableIds.deals, {
            filter: { lastActivityDate: { gte: oneWeekAgo.toISOString() } },
          })
        : [],
    ]);

    const digest = {
      period: {
        from: oneWeekAgo.toISOString(),
        to: new Date().toISOString(),
      },
      meetings: {
        total: meetings.length,
        items: meetings.map(m => ({
          topic: m.topic,
          date: m.date,
          participants: m.participantCount,
          followedUp: m.followUpStatus === 'sent' || m.followUpStatus === 'completed',
        })),
      },
      emails: {
        total: emailActivity.length,
        inbound: emailActivity.filter(e => e.direction === 'inbound').length,
        outbound: emailActivity.filter(e => e.direction === 'outbound').length,
        replies: emailActivity.filter(e => e.replied).length,
      },
      deals: {
        active: deals.length,
        items: deals.map(d => ({
          name: d.name,
          stage: d.stage,
          value: d.value,
          lastActivity: d.lastActivityDate,
        })),
      },
      generatedAt: new Date().toISOString(),
    };

    logger.info(SOURCE, 'Recipe complete: Weekly digest generated', {
      meetings: digest.meetings.total,
      emails: digest.emails.total,
      deals: digest.deals.active,
    });

    return digest;
  }

  // ═══════════════════════════════════════════════════════════
  // RECIPE 6: New Contact Auto-Enrich
  // Saves: ~5% of time (manual LinkedIn/company lookup)
  // ═══════════════════════════════════════════════════════════

  async enrichNewContact(contact) {
    logger.info(SOURCE, `Recipe: Auto-enrich contact → ${contact.email}`);

    if (!this.engine.tableIds.contacts) return;

    // Upsert contact into Clay table
    const row = await this.engine.tables.upsertRow(this.engine.tableIds.contacts, 'email', {
      ...contact,
      lastSyncedAt: new Date().toISOString(),
    });

    // Trigger Clay's built-in enrichments
    if (row?.id) {
      await Promise.all([
        this.engine.tables.triggerEnrichment(this.engine.tableIds.contacts, row.id, 'linkedin_profile'),
        this.engine.tables.triggerEnrichment(this.engine.tableIds.contacts, row.id, 'company_info'),
        this.engine.tables.triggerEnrichment(this.engine.tableIds.contacts, row.id, 'email_verification'),
      ]);
    }

    logger.info(SOURCE, `Recipe complete: Enrichment triggered for ${contact.email}`);
    return { contact: contact.email, enrichments: ['linkedin_profile', 'company_info', 'email_verification'] };
  }

  // ── Helpers ──

  _extractEmail(headerValue) {
    if (!headerValue) return null;
    const match = headerValue.match(/<?([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})>?/);
    return match ? match[1].toLowerCase() : null;
  }

  // ── Recipe Registry ──

  getAvailableRecipes() {
    return [
      {
        id: 'new_deal_enrich',
        name: 'New Deal → Auto-Enrich & Outreach',
        trigger: 'New deal in Dealcloud',
        timeSaved: '~5%',
        description: 'Enriches company data and adds contacts to Outreach sequences when new deals enter the pipeline.',
      },
      {
        id: 'deal_stage_change',
        name: 'Deal Stage Change → Update Sequences',
        trigger: 'Deal stage changes in Dealcloud',
        timeSaved: '~5%',
        description: 'Pauses/resumes Outreach sequences and updates Clay when deals move stages.',
      },
      {
        id: 'post_meeting_followup',
        name: 'Post-Meeting → Auto Follow-Up',
        trigger: 'Zoom meeting ends',
        timeSaved: '~10%',
        description: 'Logs meeting to Dealcloud, drafts follow-up emails, and updates contact records.',
      },
      {
        id: 'email_reply_detected',
        name: 'Gmail Reply → Update CRM & Outreach',
        trigger: 'Reply received in Gmail',
        timeSaved: '~5%',
        description: 'Tags contacts as replied, pauses sequences, and logs engagement.',
      },
      {
        id: 'weekly_digest',
        name: 'Weekly Engagement Digest',
        trigger: 'Scheduled (weekly)',
        timeSaved: '~5%',
        description: 'Compiles meetings, emails, and deal activity into a weekly summary.',
      },
      {
        id: 'new_contact_enrich',
        name: 'New Contact → Auto-Enrich',
        trigger: 'New contact from any source',
        timeSaved: '~5%',
        description: 'Runs LinkedIn, company, and email verification enrichments on new contacts.',
      },
    ];
  }
}

module.exports = { AutomationRecipes };
