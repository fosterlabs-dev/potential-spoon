import { sendIncoming } from '../helpers/send-message';
import { expectRenderVar, expectTemplateUsed } from '../helpers/assertions';
import { buildHarness, Harness } from '../helpers/test-app';

describe('Scenario 3 — Availability + pricing (2027)', () => {
  let h: Harness;

  beforeEach(async () => {
    h = await buildHarness();
  });

  afterEach(async () => {
    await h.shutdown();
  });

  it('3.1 — High Summer 2027 quote uses ~£4,995 weekly rate', async () => {
    await sendIncoming(h, '11-18 July 2027', {
      parse: {
        intent: 'availability_inquiry',
        confidence: 0.95,
        checkIn: new Date('2027-07-11'),
        checkOut: new Date('2027-07-18'),
      },
    });
    expectTemplateUsed(h, 'availability_yes_quote');
    // weekly £4995 / 7 ≈ 713 nightly → 7 nights ≈ €4,991 (rounding)
    expectRenderVar(h, 'availability_yes_quote', 'price', /€4,99[0-9]/);
  });

  it('3.2 — Summer 2027 (May-June) → £3,995 weekly band', async () => {
    await sendIncoming(h, '30 May 2027', {
      parse: {
        intent: 'availability_inquiry',
        confidence: 0.95,
        checkIn: new Date('2027-05-30'),
        checkOut: new Date('2027-06-06'),
      },
    });
    expectTemplateUsed(h, 'availability_yes_quote');
    expectRenderVar(h, 'availability_yes_quote', 'price', /€3,99[0-9]/);
  });

  it('3.3 — 2026 dates → year_2026_redirect', async () => {
    await sendIncoming(h, '3-10 Oct 2026', {
      parse: {
        intent: 'availability_inquiry',
        confidence: 0.95,
        checkIn: new Date('2026-10-04'),
        checkOut: new Date('2026-10-11'),
      },
    });
    expectTemplateUsed(h, 'year_2026_redirect');
  });

  it('3.4 — Late Autumn 2027 → £2,495 weekly band', async () => {
    await sendIncoming(h, '17-24 Oct 2027', {
      parse: {
        intent: 'availability_inquiry',
        confidence: 0.95,
        checkIn: new Date('2027-10-17'),
        checkOut: new Date('2027-10-24'),
      },
    });
    expectTemplateUsed(h, 'availability_yes_quote');
    expectRenderVar(h, 'availability_yes_quote', 'price', /€2,49[0-9]/);
  });

  it('3.5 — vague "early September" → asks for clarification', async () => {
    await sendIncoming(h, 'Anything in early September 2027?', {
      parse: { intent: 'availability_inquiry', confidence: 0.7 },
    });
    expectTemplateUsed(h, 'dates_unclear_ask_clarify');
  });

  it('3.6 — Aug 29 - Sep 5 2027 → quote + wine harvest note (any night in Sept)', async () => {
    await sendIncoming(h, '29 Aug - 5 Sep 2027', {
      parse: {
        intent: 'availability_inquiry',
        confidence: 0.95,
        checkIn: new Date('2027-08-29'),
        checkOut: new Date('2027-09-05'),
      },
    });
    expectTemplateUsed(h, 'availability_yes_quote');
    expectTemplateUsed(h, 'september_wine_harvest_note');
  });

  it('3.7 — Sep 5-12 2027 → quote + wine harvest note', async () => {
    await sendIncoming(h, '5-12 Sep 2027', {
      parse: {
        intent: 'availability_inquiry',
        confidence: 0.95,
        checkIn: new Date('2027-09-05'),
        checkOut: new Date('2027-09-12'),
      },
    });
    expectTemplateUsed(h, 'availability_yes_quote');
    expectTemplateUsed(h, 'september_wine_harvest_note');
  });
});
