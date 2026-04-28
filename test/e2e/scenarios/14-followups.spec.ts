import { sendIncoming } from '../helpers/send-message';
import {
  expectMessageSentTo,
  expectTemplateUsed,
} from '../helpers/assertions';
import { buildHarness, CUSTOMER, Harness } from '../helpers/test-app';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

const seedFollowUp = (
  h: Harness,
  status: 'pending' | 'sent_24h',
  ageMs: number,
): void => {
  const sent = new Date(Date.now() - ageMs).toISOString();
  h.airtable.seed('FollowUps', [
    {
      phone: CUSTOMER,
      quote_sent_at: sent,
      status,
      created_at: sent,
      updated_at: sent,
    },
  ]);
};

describe('Scenario 14 — Follow-up sequences', () => {
  let h: Harness;

  beforeEach(async () => {
    h = await buildHarness();
  });

  afterEach(async () => {
    await h.shutdown();
  });

  it('14.1 — sends followup_24h after 24h with no reply', async () => {
    seedFollowUp(h, 'pending', 25 * HOUR_MS);
    await h.followUpsCron.runDailyCheck();
    expectTemplateUsed(h, 'followup_24h');
    expectMessageSentTo(h, CUSTOMER);
    const row = h.airtable.rows('FollowUps')[0];
    expect(row.fields.status).toBe('sent_24h');
  });

  it('14.2 — sends followup_7d after 7d when 24h was already sent', async () => {
    seedFollowUp(h, 'sent_24h', 8 * DAY_MS);
    await h.followUpsCron.runDailyCheck();
    expectTemplateUsed(h, 'followup_7d');
    const row = h.airtable.rows('FollowUps')[0];
    expect(row.fields.status).toBe('completed');
  });

  it('14.3 — completed sequence is not re-sent on later runs', async () => {
    seedFollowUp(h, 'sent_24h', 8 * DAY_MS);
    await h.followUpsCron.runDailyCheck();
    h.provider.reset();
    await h.followUpsCron.runDailyCheck();
    expect(h.provider.sent.length).toBe(0);
  });

  it('14.4 — customer reply between 24h and 7d cancels the sequence', async () => {
    seedFollowUp(h, 'sent_24h', 3 * DAY_MS);
    await sendIncoming(h, 'still thinking', {
      parse: { intent: 'off_topic_or_unclear', confidence: 0.5 },
    });
    const row = h.airtable.rows('FollowUps')[0];
    expect(row.fields.status).toBe('cancelled');
  });

  it('14.5 — customer books between 24h and 7d cancels the sequence', async () => {
    seedFollowUp(h, 'sent_24h', 3 * DAY_MS);
    await sendIncoming(h, "Yes let's book", {
      parse: { intent: 'booking_confirmation', confidence: 0.95 },
    });
    const row = h.airtable.rows('FollowUps')[0];
    expect(row.fields.status).toBe('cancelled');
  });

  it('quoting a customer schedules a pending follow-up', async () => {
    await sendIncoming(h, '11-18 July 2027', {
      parse: {
        intent: 'availability_inquiry',
        confidence: 0.95,
        checkIn: new Date('2027-07-11'),
        checkOut: new Date('2027-07-18'),
      },
    });
    const rows = h.airtable.rows('FollowUps');
    expect(rows.length).toBe(1);
    expect(rows[0].fields.status).toBe('pending');
    expect(rows[0].fields.phone).toBe(CUSTOMER);
  });

  it('a second quote replaces the first follow-up record', async () => {
    await sendIncoming(h, '11-18 July 2027', {
      parse: {
        intent: 'availability_inquiry',
        confidence: 0.95,
        checkIn: new Date('2027-07-11'),
        checkOut: new Date('2027-07-18'),
      },
    });
    await sendIncoming(h, '18-25 July 2027', {
      parse: {
        intent: 'availability_inquiry',
        confidence: 0.95,
        checkIn: new Date('2027-07-18'),
        checkOut: new Date('2027-07-25'),
      },
    });
    const rows = h.airtable.rows('FollowUps');
    const open = rows.filter((r) => r.fields.status === 'pending');
    const cancelled = rows.filter((r) => r.fields.status === 'cancelled');
    expect(open.length).toBe(1);
    expect(cancelled.length).toBe(1);
  });
});
