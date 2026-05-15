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

  // 7.2 — instant_book_enabled is intentionally a no-op for now. It will gate the
  // SuperControl auto-booking variant once that integration is built.
  it.todo(
    '7.2 — instant_book_enabled=true uses booking_confirmed_instant_book (deferred until SuperControl auto-booking)',
  );

  // 7.4 (capture email) is not yet implemented in the orchestrator — CRM expansion phase.
  it.todo('7.4 — captures email in CRM after booking_confirmed_handoff');
});
