import { sendIncoming } from '../helpers/send-message';
import { expectJimNotified, expectTemplateUsed } from '../helpers/assertions';
import { buildHarness, Harness } from '../helpers/test-app';

describe('Scenario 10 — Discount requests', () => {
  let h: Harness;

  beforeEach(async () => {
    h = await buildHarness();
  });

  afterEach(async () => {
    await h.shutdown();
  });

  const cases: Array<[string, string]> = [
    ['10.1', 'Any discount for a longer stay?'],
    ['10.2', 'Can you do anything on price?'],
    ['10.3', "It's a bit out of our budget"],
  ];

  for (const [num, msg] of cases) {
    it(`${num} — "${msg}" hands off to discount_request and notifies Jim`, async () => {
      await sendIncoming(h, msg, {
        parse: {
          intent: 'pricing_inquiry',
          confidence: 0.9,
          mentionsDiscount: true,
        },
      });
      expectTemplateUsed(h, 'discount_request');
      expectJimNotified(h);
    });
  }
});
