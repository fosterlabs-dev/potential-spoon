import { sendIncoming } from '../helpers/send-message';
import {
  expectConversationStatus,
  expectJimNotified,
  expectTemplateUsed,
} from '../helpers/assertions';
import { buildHarness, Harness } from '../helpers/test-app';

describe('Scenario 7 — Booking confirmation', () => {
  let h: Harness;

  beforeEach(async () => {
    h = await buildHarness();
  });

  afterEach(async () => {
    await h.shutdown();
  });

  it('7.1 — "Yes please book me in" → booking_confirmed_handoff, Jim notified, paused', async () => {
    await sendIncoming(h, 'Yes please book me in', {
      parse: { intent: 'booking_confirmation', confidence: 0.95 },
    });
    expectTemplateUsed(h, 'booking_confirmed_handoff');
    expectJimNotified(h);
    await expectConversationStatus(h, 'paused');
  });

  it('7.3 — "We\'d like to secure those dates" → booking_confirmed_handoff', async () => {
    await sendIncoming(h, "We'd like to secure those dates", {
      parse: { intent: 'booking_confirmation', confidence: 0.9 },
    });
    expectTemplateUsed(h, 'booking_confirmed_handoff');
    expectJimNotified(h);
  });

  // 7.2 (instant book) and 7.4 (capture email) are not yet implemented in
  // the orchestrator — Phase 7 / CRM expansion.
  it.todo('7.2 — INSTANT_BOOK_ENABLED=true uses booking_confirmed_instant_book');
  it.todo('7.4 — captures email in CRM after booking_confirmed_handoff');
});
