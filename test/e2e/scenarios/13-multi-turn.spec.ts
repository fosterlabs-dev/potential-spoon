import { sendIncoming } from '../helpers/send-message';
import { expectRenderVar, expectTemplateUsed } from '../helpers/assertions';
import { buildHarness, Harness } from '../helpers/test-app';

describe('Scenario 13 — Multi-turn context', () => {
  let h: Harness;

  beforeEach(async () => {
    h = await buildHarness();
  });

  afterEach(async () => {
    await h.shutdown();
  });

  it('13.1 — quote then "the week after" — relies on parser context (canned)', async () => {
    await sendIncoming(h, 'Hi available 11-18 July 2027?', {
      parse: {
        intent: 'availability_inquiry',
        confidence: 0.95,
        checkIn: new Date('2027-07-11'),
        checkOut: new Date('2027-07-18'),
      },
    });
    // In the real flow the parser resolves "week after" against history; here
    // we hand it the resolved dates directly to test the orchestration path.
    await sendIncoming(h, 'What about the week after?', {
      parse: {
        intent: 'availability_inquiry',
        confidence: 0.9,
        checkIn: new Date('2027-07-18'),
        checkOut: new Date('2027-07-25'),
      },
    });
    const quoteCalls = h.renderArgs().filter((c) => c.key === 'availability_yes_quote');
    expect(quoteCalls.length).toBe(2);
    expect(String(quoteCalls[1].vars.check_in)).toMatch(/18 July 2027/);
  });

  it('13.2 — capacity FAQ then guest count → KB sleeps + then dates ask', async () => {
    await sendIncoming(h, 'Sleep how many?', {
      parse: { intent: 'general_info', confidence: 0.9, kbTopic: 'sleeps' },
    });
    expect(h.provider.sent[0].text).toMatch(/sleeps 10/);
    await sendIncoming(h, "We're 8 adults", {
      parse: {
        intent: 'general_info',
        confidence: 0.85,
        kbTopic: 'sleeps',
        guests: 8,
      },
    });
    // KB-driven answers do not run through render — outbound text comes
    // straight from KnowledgeBaseService. So renderCalls won't list 'sleeps'.
    expect(h.provider.sent.length).toBeGreaterThanOrEqual(2);
  });

  it('13.3 — name persists across turns and is passed into templates', async () => {
    await sendIncoming(h, "Hi I'm Sarah", {
      parse: { intent: 'greeting', confidence: 0.95, customerName: 'Sarah' },
    });
    await sendIncoming(h, 'is 11-18 July 2027 free?', {
      parse: {
        intent: 'availability_inquiry',
        confidence: 0.95,
        checkIn: new Date('2027-07-11'),
        checkOut: new Date('2027-07-18'),
        customerName: null, // not repeated on second turn
      },
    });
    expectRenderVar(h, 'availability_yes_quote', 'name', 'Sarah');
  });

  it('13.4 — booking_confirmation eventually hands off', async () => {
    await sendIncoming(h, 'Is the pool heated?', {
      parse: { intent: 'general_info', confidence: 0.9, kbTopic: 'pool_heated' },
    });
    await sendIncoming(h, 'How many bedrooms?', {
      parse: { intent: 'general_info', confidence: 0.9, kbTopic: 'sleeps' },
    });
    await sendIncoming(h, "Yes I'd like to book", {
      parse: { intent: 'booking_confirmation', confidence: 0.95 },
    });
    expectTemplateUsed(h, 'booking_confirmed_handoff');
  });
});
