import { sendIncoming } from '../helpers/send-message';
import {
  expectConversationStatus,
  expectTemplateUsed,
} from '../helpers/assertions';
import { buildHarness, Harness } from '../helpers/test-app';

describe('Scenario 1 — Greeting & date capture', () => {
  let h: Harness;

  beforeEach(async () => {
    h = await buildHarness();
  });

  afterEach(async () => {
    await h.shutdown();
  });

  it('1.1 — bare greeting triggers greeting_ask_dates', async () => {
    await sendIncoming(h, 'Hi', { parse: { intent: 'greeting', confidence: 0.95 } });
    expectTemplateUsed(h, 'greeting_ask_dates');
  });

  it('1.2 — opening line triggers greeting_ask_dates', async () => {
    await sendIncoming(h, 'Hello, looking at your villa', {
      parse: { intent: 'greeting', confidence: 0.95 },
    });
    expectTemplateUsed(h, 'greeting_ask_dates');
  });

  it('1.3 — vague month-only enquiry asks for clarification', async () => {
    await sendIncoming(h, 'Hi, is the villa available in July?', {
      parse: { intent: 'availability_inquiry', confidence: 0.9 },
    });
    expectTemplateUsed(h, 'dates_unclear_ask_clarify');
  });

  it('1.4 — "early August" without specific dates asks for clarification', async () => {
    await sendIncoming(h, 'Looking at early August', {
      parse: { intent: 'availability_inquiry', confidence: 0.85 },
    });
    expectTemplateUsed(h, 'dates_unclear_ask_clarify');
  });

  it('1.5 — "around Christmas" asks for clarification', async () => {
    await sendIncoming(h, 'Around Christmas time', {
      parse: { intent: 'availability_inquiry', confidence: 0.7 },
    });
    expectTemplateUsed(h, 'dates_unclear_ask_clarify');
  });

  it('1.6 — "sometime next year" asks for clarification', async () => {
    await sendIncoming(h, 'Sometime next year', {
      parse: { intent: 'availability_inquiry', confidence: 0.6 },
    });
    expectTemplateUsed(h, 'dates_unclear_ask_clarify');
  });

  it('greeting writes a Conversations row in bot mode', async () => {
    await sendIncoming(h, 'Hi', { parse: { intent: 'greeting', confidence: 0.95 } });
    await expectConversationStatus(h, 'bot');
  });
});
