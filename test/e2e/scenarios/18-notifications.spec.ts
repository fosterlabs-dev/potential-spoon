import {
  expectJimEmailed,
  expectJimNotified,
  expectTemplateUsed,
} from '../helpers/assertions';
import { daysFromNow, sendIncoming } from '../helpers/send-message';
import { buildHarness, CUSTOMER, Harness } from '../helpers/test-app';

describe('Scenario 18 — Notifications (Phase 5)', () => {
  let h: Harness;

  beforeEach(async () => {
    h = await buildHarness();
  });

  afterEach(async () => {
    await h.shutdown();
  });

  it('18.1 — handoff fires both WhatsApp and email channels', async () => {
    await sendIncoming(h, 'Can I speak to someone?', {
      parse: { intent: 'human_request', confidence: 0.95 },
    });

    expectTemplateUsed(h, 'human_request_handoff');
    expectJimNotified(h);
    expectJimEmailed(h, 'human_request');
  });

  it('18.2 — discount request notifies with reason=discount_request', async () => {
    await sendIncoming(h, 'Any chance of 10% off?', {
      parse: {
        intent: 'pricing_inquiry',
        confidence: 0.9,
        mentionsDiscount: true,
      },
    });

    expectJimEmailed(h, 'discount_request');
  });

  it('18.3 — unavailable dates notifies Jim so he can offer alternatives', async () => {
    const checkIn = nextSunday(daysFromNow(400));
    const checkOut = addDays(checkIn, 7);
    h.availability.block(checkIn, checkOut);

    await sendIncoming(h, 'Are those dates free?', {
      parse: {
        intent: 'availability_inquiry',
        confidence: 0.95,
        checkIn,
        checkOut,
      },
    });

    expectTemplateUsed(h, 'availability_no_handoff');
    expectJimEmailed(h, 'dates_unavailable');
  });

  it('18.4 — hold conflict notifies with reason=hold_conflict', async () => {
    const checkIn = nextSunday(daysFromNow(420));
    const checkOut = addDays(checkIn, 7);

    // Pre-existing hold from another guest
    await h.airtable.create('Holds', {
      phone: '447999999999',
      check_in: isoDate(checkIn),
      check_out: isoDate(checkOut),
      hold_created_at: new Date().toISOString(),
      hold_expires_at: new Date(Date.now() + 5 * 86_400_000).toISOString(),
      reminder_sent: false,
      status: 'active',
    });

    await sendIncoming(h, 'Are those dates free?', {
      parse: {
        intent: 'availability_inquiry',
        confidence: 0.95,
        checkIn,
        checkOut,
      },
      from: CUSTOMER,
    });

    expectTemplateUsed(h, 'availability_no_handoff');
    expectJimEmailed(h, 'hold_conflict');
  });

  it('18.5 — orchestrator error notifies with reason=orchestrator_error and the error message', async () => {
    h.availability.fail(new Error('ical down'));
    const checkIn = nextSunday(daysFromNow(440));
    const checkOut = addDays(checkIn, 7);

    await sendIncoming(h, 'Are those dates free?', {
      parse: {
        intent: 'availability_inquiry',
        confidence: 0.95,
        checkIn,
        checkOut,
      },
    });

    expectJimEmailed(h, 'orchestrator_error');
    const email = h.email.sent.find((e) => e.subject.includes('orchestrator_error'));
    expect(email?.body).toContain('ical down');
  });
});

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * 86_400_000);
}

function nextSunday(d: Date): Date {
  const day = d.getUTCDay();
  const offset = day === 0 ? 0 : 7 - day;
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + offset),
  );
}
