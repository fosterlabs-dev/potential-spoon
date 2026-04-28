import { sendIncoming } from '../helpers/send-message';
import { expectTemplateUsed } from '../helpers/assertions';
import { buildHarness, Harness } from '../helpers/test-app';

describe('Scenario 4 — Unavailable dates', () => {
  let h: Harness;

  beforeEach(async () => {
    h = await buildHarness();
  });

  afterEach(async () => {
    await h.shutdown();
  });

  it('4.1 — Aug 8-15 reserved (iCal blocked) → availability_no_handoff', async () => {
    h.availability.block(new Date('2027-08-01'), new Date('2027-08-31'));
    await sendIncoming(h, '8-15 August 2027', {
      parse: {
        intent: 'availability_inquiry',
        confidence: 0.95,
        checkIn: new Date('2027-08-08'),
        checkOut: new Date('2027-08-15'),
      },
    });
    expectTemplateUsed(h, 'availability_no_handoff');
  });

  it('4.2 — Aug 1-8 reserved → availability_no_handoff', async () => {
    h.availability.block(new Date('2027-08-01'), new Date('2027-08-08'));
    await sendIncoming(h, '1-8 August 2027', {
      parse: {
        intent: 'availability_inquiry',
        confidence: 0.95,
        checkIn: new Date('2027-08-01'),
        checkOut: new Date('2027-08-08'),
      },
    });
    expectTemplateUsed(h, 'availability_no_handoff');
  });
});
