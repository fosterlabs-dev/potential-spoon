import { sendIncoming } from '../helpers/send-message';
import { expectRenderVar, expectTemplateUsed } from '../helpers/assertions';
import { buildHarness, Harness } from '../helpers/test-app';

describe('Scenario 11 — Mid-conversation date changes', () => {
  let h: Harness;

  beforeEach(async () => {
    h = await buildHarness();
  });

  afterEach(async () => {
    await h.shutdown();
  });

  it('11.1 — second enquiry with new dates produces a fresh quote', async () => {
    await sendIncoming(h, '11-18 July 2027', {
      parse: {
        intent: 'availability_inquiry',
        confidence: 0.95,
        checkIn: new Date('2027-07-11'),
        checkOut: new Date('2027-07-18'),
      },
    });
    await sendIncoming(h, 'Actually 18-25 July?', {
      parse: {
        intent: 'availability_inquiry',
        confidence: 0.95,
        checkIn: new Date('2027-07-18'),
        checkOut: new Date('2027-07-25'),
      },
    });
    const quoteCalls = h
      .renderArgs()
      .filter((c) => c.key === 'availability_yes_quote');
    expect(quoteCalls.length).toBeGreaterThanOrEqual(2);
    expect(String(quoteCalls[1].vars.check_in)).toMatch(/18 July 2027/);
  });

  it('11.2 — after unavailable, second enquiry with new dates is checked fresh', async () => {
    h.availability.block(new Date('2027-08-01'), new Date('2027-08-22'));
    await sendIncoming(h, '8-15 Aug 2027', {
      parse: {
        intent: 'availability_inquiry',
        confidence: 0.95,
        checkIn: new Date('2027-08-08'),
        checkOut: new Date('2027-08-15'),
      },
    });
    expectTemplateUsed(h, 'availability_no_handoff');

    await sendIncoming(h, 'Try 22-29 Aug', {
      parse: {
        intent: 'availability_inquiry',
        confidence: 0.95,
        checkIn: new Date('2027-08-22'),
        checkOut: new Date('2027-08-29'),
      },
    });
    expectTemplateUsed(h, 'availability_yes_quote');
    expectRenderVar(h, 'availability_yes_quote', 'check_in', '22 August 2027');
  });
});
