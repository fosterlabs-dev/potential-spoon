import { seedAll } from '../fixtures/seed';
import { sendIncoming } from '../helpers/send-message';
import {
  expectConversationStatus,
  expectJimNotified,
  expectNoMessageSent,
  expectTemplateUsed,
} from '../helpers/assertions';
import { buildHarness, CUSTOMER, Harness, OWNER } from '../helpers/test-app';

describe('Scenario 16 — Edge cases & failure modes', () => {
  let h: Harness;

  beforeEach(async () => {
    h = await buildHarness();
  });

  afterEach(async () => {
    await h.shutdown();
  });

  it('16.1 — parser throws (malformed Claude JSON) → unclear_handoff + Jim notified', async () => {
    h.parser.parse = jest.fn().mockRejectedValue(new Error('bad json'));
    await sendIncoming(h, 'asdf');
    expectTemplateUsed(h, 'unclear_handoff');
    expectJimNotified(h);
  });

  it('16.2 — low-confidence off_topic → unclear scenario via composer', async () => {
    await sendIncoming(h, '???', {
      parse: { intent: 'off_topic_or_unclear', confidence: 0.1 },
    });
    const composeCalls = h.composeCalls();
    expect(composeCalls.some((c) => c.scenarioHint === 'unclear')).toBe(true);
  });

  it('16.3 — iCal feed throws → unclear_handoff (graceful failure)', async () => {
    h.availability.fail(new Error('ical down'));
    await sendIncoming(h, 'Free 11-18 July 2027?', {
      parse: {
        intent: 'availability_inquiry',
        confidence: 0.95,
        checkIn: new Date('2027-07-11'),
        checkOut: new Date('2027-07-18'),
      },
    });
    expectTemplateUsed(h, 'unclear_handoff');
    expectJimNotified(h);
  });

  it('16.4 — pricing rule missing → unclear_handoff', async () => {
    h.airtable.reset();
    seedAll(h.airtable);
    // Drop seeded pricing rows so the calculation has nothing to match.
    h.airtable.rows('Pricing').splice(0);

    await sendIncoming(h, '11-18 Jan 2030?', {
      parse: {
        intent: 'availability_inquiry',
        confidence: 0.95,
        checkIn: new Date('2030-01-13'), // Sunday
        checkOut: new Date('2030-01-20'),
      },
    });
    expectTemplateUsed(h, 'unclear_handoff');
  });

  it('16.5 — paused conversation drops messages silently', async () => {
    // Force pause
    h.airtable.seed('Conversations', [
      {
        phone: CUSTOMER,
        pause_status: 'paused',
        pause_until: new Date(Date.now() + 60 * 60_000).toISOString(),
      },
    ]);
    await sendIncoming(h, 'Hi', { parse: { intent: 'greeting', confidence: 0.95 } });
    expectNoMessageSent(h, CUSTOMER);
    expectNoMessageSent(h, OWNER);
  });

  // 16.6 (auto-pause when Jim sends manual reply) is not implemented yet.
  it.todo('16.6 — Jim sending manual reply auto-pauses bot for 24h');
  it.todo('16.7 — burst of messages within 30s coalesces to a single reply');
  it.todo('16.8 — voice/image media → unclear_handoff (no media processing v1)');
  it.todo('16.9 — non-English message → unclear_handoff (English-only v1)');
  it.todo('16.10 — WhatsApp 429 retry with backoff');

  it('owner /pause command pauses a customer conversation', async () => {
    await h.handler.handle({ from: OWNER, text: `/pause ${CUSTOMER} 60` });
    await expectConversationStatus(h, 'paused');
  });
});
