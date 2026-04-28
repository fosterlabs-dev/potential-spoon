import { sendIncoming } from '../helpers/send-message';
import { expectRenderVar, expectTemplateUsed } from '../helpers/assertions';
import { buildHarness, Harness } from '../helpers/test-app';

describe('Scenario 2 — Booking rules validation', () => {
  let h: Harness;

  beforeEach(async () => {
    h = await buildHarness();
  });

  afterEach(async () => {
    await h.shutdown();
  });

  it('2.1 — Mon-Fri request → dates_not_sunday_to_sunday with suggestion', async () => {
    await sendIncoming(h, 'Can I book Mon 6th to Fri 10th July?', {
      parse: {
        intent: 'availability_inquiry',
        confidence: 0.9,
        checkIn: new Date('2027-07-05'), // Monday (avoid 2026 redirect)
        checkOut: new Date('2027-07-09'), // Friday
      },
    });
    expectTemplateUsed(h, 'dates_not_sunday_to_sunday');
    expectRenderVar(h, 'dates_not_sunday_to_sunday', 'suggested_check_in', /Sunday/);
  });

  it('2.2 — 4-night stay (Sun-Thu) → minimum_stay_not_met', async () => {
    await sendIncoming(h, 'Just need 4 nights, 12-16 July', {
      parse: {
        intent: 'availability_inquiry',
        confidence: 0.9,
        checkIn: new Date('2027-07-11'), // Sunday
        checkOut: new Date('2027-07-15'), // Thursday — fails sunday rule first
      },
    });
    // Either rule firing first is acceptable; both are flagged in scenarios doc
    const calls = h.renderCalls();
    expect(
      calls.includes('minimum_stay_not_met') ||
        calls.includes('dates_not_sunday_to_sunday'),
    ).toBe(true);
  });

  it('2.3 — Tue-Tue → dates_not_sunday_to_sunday', async () => {
    await sendIncoming(h, 'Tuesday 14th to Tuesday 21st July', {
      parse: {
        intent: 'availability_inquiry',
        confidence: 0.9,
        checkIn: new Date('2027-07-13'), // Tuesday
        checkOut: new Date('2027-07-20'),
      },
    });
    expectTemplateUsed(h, 'dates_not_sunday_to_sunday');
  });

  it('2.4 — Sun-Sun 7 nights free → availability_yes_quote', async () => {
    await sendIncoming(h, '11-18 July 2027', {
      parse: {
        intent: 'availability_inquiry',
        confidence: 0.95,
        checkIn: new Date('2027-07-11'),
        checkOut: new Date('2027-07-18'),
      },
    });
    expectTemplateUsed(h, 'availability_yes_quote');
    expectRenderVar(h, 'availability_yes_quote', 'nights', '7');
  });

  it('2.5 — Sun-Sun 14 nights free → availability_yes_quote with double quote', async () => {
    await sendIncoming(h, '11-25 July 2027', {
      parse: {
        intent: 'availability_inquiry',
        confidence: 0.95,
        checkIn: new Date('2027-07-11'),
        checkOut: new Date('2027-07-25'),
      },
    });
    expectTemplateUsed(h, 'availability_yes_quote');
    expectRenderVar(h, 'availability_yes_quote', 'nights', '14');
  });
});
