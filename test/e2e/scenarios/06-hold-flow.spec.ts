import { sendIncoming } from '../helpers/send-message';
import {
  expectHoldStatus,
  expectMessageSentTo,
  expectTemplateUsed,
} from '../helpers/assertions';
import { buildHarness, CUSTOMER, Harness } from '../helpers/test-app';

const SUN_IN = new Date('2027-07-11');
const SUN_OUT = new Date('2027-07-18');

const stageQuoteSent = async (h: Harness): Promise<void> => {
  await sendIncoming(h, '11-18 July 2027', {
    parse: {
      intent: 'availability_inquiry',
      confidence: 0.95,
      checkIn: SUN_IN,
      checkOut: SUN_OUT,
    },
  });
};

describe('Scenario 6 — Hold flow', () => {
  let h: Harness;

  beforeEach(async () => {
    h = await buildHarness();
  });

  afterEach(async () => {
    await h.shutdown();
  });

  it('6.1 — high-intent reply after a quote triggers hold_offer_post_quote', async () => {
    await sendIncoming(h, 'That sounds great can we book?', {
      parse: {
        intent: 'availability_inquiry',
        confidence: 0.95,
        checkIn: SUN_IN,
        checkOut: SUN_OUT,
        highIntentSignal: true,
      },
    });
    expectTemplateUsed(h, 'availability_yes_quote');
    expectTemplateUsed(h, 'hold_offer_post_quote');
  });

  it('6.2 — hold_request creates hold + hold_confirmed reply', async () => {
    await stageQuoteSent(h);
    await sendIncoming(h, 'Yes please hold those dates', {
      parse: {
        intent: 'hold_request',
        confidence: 0.95,
        checkIn: SUN_IN,
        checkOut: SUN_OUT,
      },
    });
    expectTemplateUsed(h, 'hold_confirmed');
    await expectHoldStatus(h, 'active');
    const holdRow = h.airtable.rows('Holds')[0];
    expect(holdRow.fields.check_in).toBe('2027-07-11');
    expect(holdRow.fields.check_out).toBe('2027-07-18');
  });

  it('6.3 — booking_confirmation after hold → handoff to Jim', async () => {
    await sendIncoming(h, "I'll take it", {
      parse: { intent: 'booking_confirmation', confidence: 0.95 },
    });
    expectTemplateUsed(h, 'booking_confirmed_handoff');
  });

  it('6.4 — cron sends hold_reminder when hold expires within 1 day', async () => {
    // Seed a hold expiring in 12 hours, no reminder yet.
    const now = new Date();
    h.airtable.seed('Holds', [
      {
        phone: CUSTOMER,
        check_in: '2027-07-11',
        check_out: '2027-07-18',
        hold_created_at: new Date(now.getTime() - 4 * 24 * 60 * 60 * 1000).toISOString(),
        hold_expires_at: new Date(now.getTime() + 12 * 60 * 60 * 1000).toISOString(),
        reminder_sent: false,
        status: 'active',
      },
    ]);

    await h.holdsCron.runDailyCheck();
    expectTemplateUsed(h, 'hold_reminder');
    const row = h.airtable.rows('Holds')[0];
    expect(row.fields.reminder_sent).toBe(true);
  });

  it('6.5 — cron expires holds past their expiry and sends hold_expired', async () => {
    const now = new Date();
    h.airtable.seed('Holds', [
      {
        phone: CUSTOMER,
        check_in: '2027-07-11',
        check_out: '2027-07-18',
        hold_created_at: new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000).toISOString(),
        hold_expires_at: new Date(now.getTime() - 60_000).toISOString(),
        reminder_sent: true,
        status: 'active',
      },
    ]);

    await h.holdsCron.runDailyCheck();
    expectTemplateUsed(h, 'hold_expired');
    await expectHoldStatus(h, 'expired');
    expectMessageSentTo(h, CUSTOMER);
  });

  it('6.6 — held dates appear unavailable to a different enquirer', async () => {
    h.airtable.seed('Holds', [
      {
        phone: '447999999999',
        check_in: '2027-07-11',
        check_out: '2027-07-18',
        hold_created_at: new Date().toISOString(),
        hold_expires_at: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
        reminder_sent: false,
        status: 'active',
      },
    ]);

    await sendIncoming(h, '11-18 July 2027', {
      parse: {
        intent: 'availability_inquiry',
        confidence: 0.95,
        checkIn: SUN_IN,
        checkOut: SUN_OUT,
      },
    });
    expectTemplateUsed(h, 'availability_no_handoff');
  });
});
