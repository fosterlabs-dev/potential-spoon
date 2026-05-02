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

  it('7.1 — "Yes please book me in" → booking_confirmed_handoff, Jim notified, bot stays active', async () => {
    await sendIncoming(h, 'Yes please book me in', {
      parse: { intent: 'booking_confirmation', confidence: 0.95 },
    });
    expectTemplateUsed(h, 'booking_confirmed_handoff');
    expectJimNotified(h);
    await expectConversationStatus(h, 'bot');
  });

  it('7.3 — "We\'d like to secure those dates" → booking_confirmed_handoff', async () => {
    await sendIncoming(h, "We'd like to secure those dates", {
      parse: { intent: 'booking_confirmation', confidence: 0.9 },
    });
    expectTemplateUsed(h, 'booking_confirmed_handoff');
    expectJimNotified(h);
  });

  it('7.2 — INSTANT_BOOK_ENABLED=true uses booking_confirmed_instant_book', async () => {
    await h.shutdown();
    h = await buildHarness({ env: { INSTANT_BOOK_ENABLED: 'true' } });

    await sendIncoming(h, 'Yes please book me in', {
      parse: { intent: 'booking_confirmation', confidence: 0.95 },
    });
    expectTemplateUsed(h, 'booking_confirmed_instant_book');
    expectJimNotified(h);
    await expectConversationStatus(h, 'bot');

    process.env.INSTANT_BOOK_ENABLED = 'false';
  });

  // 7.4 (capture email) is not yet implemented in the orchestrator — CRM expansion phase.
  it.todo('7.4 — captures email in CRM after booking_confirmed_handoff');
});
