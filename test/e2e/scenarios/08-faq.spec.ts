import { sendIncoming } from '../helpers/send-message';
import { expectMessageSentTo } from '../helpers/assertions';
import { buildHarness, CUSTOMER, Harness } from '../helpers/test-app';

describe('Scenario 8 — FAQ / Knowledge base', () => {
  let h: Harness;

  beforeEach(async () => {
    h = await buildHarness();
  });

  afterEach(async () => {
    await h.shutdown();
  });

  const cases: Array<[string, string, string, string]> = [
    ['8.1', 'Is the pool heated?', 'pool_heated', 'sun-warmed'],
    ['8.2', 'How many does it sleep?', 'sleeps', 'sleeps 10'],
    ['8.3', 'Will we need a car?', 'car_needed', 'car is recommended'],
    ['8.4', 'Is there an EV charger?', 'ev_charger', 'Pineuilh'],
    ['8.5', 'Are pool towels provided?', 'pool_towels', 'towels'],
    ['8.6', 'Where are the nearest shops?', 'nearest_shops', 'E.Leclerc'],
    ['8.7', 'Do you have a cot?', 'cot_highchair', 'cots'],
    ['8.8', 'Can we bring our 2 dogs?', 'dogs', 'Dogs welcome'],
    ['8.9', 'What time is check-in?', 'check_in_out_times', '4pm'],
    ['8.10', 'Where exactly is the house?', 'location', 'Duras'],
  ];

  for (const [num, msg, kbTopic, fragment] of cases) {
    it(`${num} — "${msg}" answers from KB topic ${kbTopic}`, async () => {
      await sendIncoming(h, msg, {
        parse: { intent: 'general_info', confidence: 0.9, topicKeys: [kbTopic] },
      });
      expectMessageSentTo(h, CUSTOMER, fragment);
    });
  }

  it('unknown topic general_info routes to faq_unknown scenario via composer', async () => {
    await sendIncoming(h, 'Got a hairdryer?', {
      parse: { intent: 'general_info', confidence: 0.3, topicKeys: [] },
    });
    const composeCalls = h.composeCalls();
    expect(composeCalls.some((c) => c.scenarioHint === 'faq_unknown')).toBe(true);
  });
});
