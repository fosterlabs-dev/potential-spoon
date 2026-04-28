import { sendIncoming } from '../helpers/send-message';
import { expectMessageSentTo } from '../helpers/assertions';
import { buildHarness, CUSTOMER, Harness } from '../helpers/test-app';

/**
 * Group enquiries currently route through general_info (capacity question).
 * KB topic 'sleeps' contains capacity language. Over-capacity messages classified
 * as off_topic_or_unclear get unclear_handoff (notifies Jim).
 */
describe('Scenario 9 — Group enquiries', () => {
  let h: Harness;

  beforeEach(async () => {
    h = await buildHarness();
  });

  afterEach(async () => {
    await h.shutdown();
  });

  it('9.1 — group of 10 → KB sleeps answer mentions capacity', async () => {
    await sendIncoming(h, "We're a group of 10, would that work?", {
      parse: {
        intent: 'general_info',
        confidence: 0.85,
        kbTopic: 'sleeps',
        guests: 10,
      },
    });
    expectMessageSentTo(h, CUSTOMER, 'sleeps 10');
  });

  it('9.2 — 11 with a baby → KB sleeps answer notes fold-out', async () => {
    await sendIncoming(h, '11 of us including a baby', {
      parse: {
        intent: 'general_info',
        confidence: 0.85,
        kbTopic: 'sleeps',
        guests: 11,
      },
    });
    expectMessageSentTo(h, CUSTOMER, 'fold-out');
  });

  it('9.3 — 12 adults (over capacity) → unclear handoff and Jim notified', async () => {
    await sendIncoming(h, '12 adults — does that fit?', {
      parse: { intent: 'off_topic_or_unclear', confidence: 0.4, guests: 12 },
    });
    const calls = h.renderCalls();
    expect(calls).toContain('unclear_handoff');
    expect(h.provider.sent.some((m) => m.text.toLowerCase().includes('attention'))).toBe(true);
  });
});
