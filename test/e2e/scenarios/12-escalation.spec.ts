import { sendIncoming } from '../helpers/send-message';
import {
  expectConversationStatus,
  expectJimNotified,
  expectTemplateUsed,
} from '../helpers/assertions';
import { buildHarness, Harness } from '../helpers/test-app';

describe('Scenario 12 — Human / escalation triggers', () => {
  let h: Harness;

  beforeEach(async () => {
    h = await buildHarness();
  });

  afterEach(async () => {
    await h.shutdown();
  });

  it('12.1 — "Can I speak to someone?" → human_request_handoff, Jim notified, paused', async () => {
    await sendIncoming(h, 'Can I speak to someone?', {
      parse: { intent: 'human_request', confidence: 0.95 },
    });
    expectTemplateUsed(h, 'human_request_handoff');
    expectJimNotified(h);
    await expectConversationStatus(h, 'paused');
  });

  it('12.2 — "Is this a real person?" → human_request_handoff', async () => {
    await sendIncoming(h, 'Is this a real person?', {
      parse: { intent: 'human_request', confidence: 0.9 },
    });
    expectTemplateUsed(h, 'human_request_handoff');
    expectJimNotified(h);
  });

  it('12.3 — frustration → complaint_handoff, paused, Jim notified', async () => {
    await sendIncoming(h, "I'm furious about my last stay", {
      parse: { intent: 'complaint_or_frustration', confidence: 0.95 },
    });
    expectTemplateUsed(h, 'complaint_handoff');
    expectJimNotified(h);
    await expectConversationStatus(h, 'paused');
  });

  it('12.4 — "There was a problem" → complaint_handoff', async () => {
    await sendIncoming(h, 'There was a problem with the house', {
      parse: { intent: 'complaint_or_frustration', confidence: 0.85 },
    });
    expectTemplateUsed(h, 'complaint_handoff');
    expectJimNotified(h);
  });

  it('12.5 — garbled text → unclear_handoff, Jim notified, bot stays active', async () => {
    await sendIncoming(h, 'asdkfjas;ldkj', {
      parse: { intent: 'off_topic_or_unclear', confidence: 0.2 },
    });
    expectTemplateUsed(h, 'unclear_handoff');
    expectJimNotified(h);
    await expectConversationStatus(h, 'bot');
  });

  it('12.6 — off-topic question → unclear_handoff', async () => {
    await sendIncoming(h, 'Tell me about Bordeaux wineries', {
      parse: { intent: 'off_topic_or_unclear', confidence: 0.4 },
    });
    expectTemplateUsed(h, 'unclear_handoff');
  });
});
