import { sendIncoming } from '../helpers/send-message';
import {
  expectConversationStatus,
  expectJimNotified,
  expectTemplateUsed,
} from '../helpers/assertions';
import { buildHarness, Harness } from '../helpers/test-app';

describe('Scenario 5 — Long stay (Oct-May)', () => {
  let h: Harness;

  beforeEach(async () => {
    h = await buildHarness();
  });

  afterEach(async () => {
    await h.shutdown();
  });

  it('5.1 — 2-month Nov-Dec 2027 → long_stay_manual_pricing + Jim notified', async () => {
    await sendIncoming(h, '2 months Nov-Dec 2027', {
      parse: {
        intent: 'availability_inquiry',
        confidence: 0.9,
        checkIn: new Date('2027-11-07'), // Sunday
        checkOut: new Date('2028-01-09'), // Sunday — ~63 nights
      },
    });
    expectTemplateUsed(h, 'long_stay_manual_pricing');
    expectJimNotified(h);
    await expectConversationStatus(h, 'bot');
  });

  it('5.2 — 4 months from Jan 2027 → long_stay_manual_pricing', async () => {
    await sendIncoming(h, '4 months from January 2027', {
      parse: {
        intent: 'availability_inquiry',
        confidence: 0.85,
        checkIn: new Date('2027-01-03'), // Sunday
        checkOut: new Date('2027-05-02'), // Sunday — ~119 nights
      },
    });
    expectTemplateUsed(h, 'long_stay_manual_pricing');
    expectJimNotified(h);
  });

  it('5.3 — 1 week in November 2027 → normal availability_yes_quote', async () => {
    await sendIncoming(h, '1 week in November 2027', {
      parse: {
        intent: 'availability_inquiry',
        confidence: 0.95,
        checkIn: new Date('2027-11-07'),
        checkOut: new Date('2027-11-14'),
      },
    });
    expectTemplateUsed(h, 'availability_yes_quote');
  });
});
