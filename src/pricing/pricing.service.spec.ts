import { PricingRule, PricingService } from './pricing.service';
import { AirtableService } from '../airtable/airtable.service';
import { LoggerService } from '../logger/logger.service';

const makeLogger = (): LoggerService =>
  ({
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }) as unknown as LoggerService;

const makeAirtable = (rows: Array<{ id: string; fields: unknown }>) =>
  ({ list: jest.fn().mockResolvedValue(rows) }) as unknown as AirtableService;

const rule = (p: Partial<PricingRule> & Pick<PricingRule, 'startDate' | 'endDate' | 'nightlyRate'>): PricingRule => ({
  minNights: undefined,
  label: undefined,
  ...p,
});

describe('PricingService.quote (pure)', () => {
  const service = new PricingService(
    makeAirtable([]),
    makeLogger(),
  );

  it('returns subtotal = rate * nights for a single rule covering the range', () => {
    const rules = [
      rule({
        startDate: new Date('2026-01-01'),
        endDate: new Date('2026-12-31'),
        nightlyRate: 100,
        label: 'Default',
      }),
    ];

    const q = service.quote(
      rules,
      new Date('2026-06-01'),
      new Date('2026-06-04'),
    );

    expect(q.nights).toBe(3);
    expect(q.nightlyBreakdown).toHaveLength(3);
    expect(q.subtotal).toBe(300);
    expect(q.total).toBe(300);
  });

  it('applies seasonal override to nights inside its range, default to the rest', () => {
    const rules = [
      rule({
        startDate: new Date('2026-01-01'),
        endDate: new Date('2026-12-31'),
        nightlyRate: 100,
        label: 'Default',
      }),
      rule({
        startDate: new Date('2026-06-15'),
        endDate: new Date('2026-06-20'),
        nightlyRate: 250,
        label: 'High',
      }),
    ];

    const q = service.quote(
      rules,
      new Date('2026-06-14'),
      new Date('2026-06-17'),
    );

    // nights: 06-14 (default 100), 06-15 (high 250), 06-16 (high 250)
    expect(q.nightlyBreakdown.map((n) => n.rate)).toEqual([100, 250, 250]);
    expect(q.subtotal).toBe(600);
  });

  it('prefers the narrower rule when two rules cover the same night', () => {
    const rules = [
      rule({
        startDate: new Date('2026-01-01'),
        endDate: new Date('2026-12-31'),
        nightlyRate: 100,
      }),
      rule({
        startDate: new Date('2026-06-01'),
        endDate: new Date('2026-06-02'),
        nightlyRate: 400,
      }),
    ];

    const q = service.quote(
      rules,
      new Date('2026-06-01'),
      new Date('2026-06-02'),
    );

    expect(q.nightlyBreakdown[0].rate).toBe(400);
  });

  it('throws when a night is not covered by any rule', () => {
    const rules = [
      rule({
        startDate: new Date('2026-07-01'),
        endDate: new Date('2026-07-31'),
        nightlyRate: 100,
      }),
    ];

    expect(() =>
      service.quote(
        rules,
        new Date('2026-06-28'),
        new Date('2026-07-02'),
      ),
    ).toThrow(/no pricing rule/i);
  });

  it('throws on invalid range (checkOut <= checkIn)', () => {
    expect(() =>
      service.quote([], new Date('2026-06-05'), new Date('2026-06-05')),
    ).toThrow();
    expect(() =>
      service.quote([], new Date('2026-06-05'), new Date('2026-06-01')),
    ).toThrow();
  });

  it('reports meetsMinNights=false when booking is shorter than max rule minNights', () => {
    const rules = [
      rule({
        startDate: new Date('2026-01-01'),
        endDate: new Date('2026-12-31'),
        nightlyRate: 100,
        minNights: 2,
      }),
      rule({
        startDate: new Date('2026-06-15'),
        endDate: new Date('2026-06-20'),
        nightlyRate: 250,
        minNights: 5,
      }),
    ];

    const q = service.quote(
      rules,
      new Date('2026-06-15'),
      new Date('2026-06-18'),
    );

    expect(q.minNights).toBe(5);
    expect(q.nights).toBe(3);
    expect(q.meetsMinNights).toBe(false);
  });

  it('reports meetsMinNights=true when booking length meets the max rule minNights', () => {
    const rules = [
      rule({
        startDate: new Date('2026-01-01'),
        endDate: new Date('2026-12-31'),
        nightlyRate: 100,
        minNights: 2,
      }),
    ];

    const q = service.quote(
      rules,
      new Date('2026-06-01'),
      new Date('2026-06-03'),
    );

    expect(q.meetsMinNights).toBe(true);
  });
});

describe('PricingService.calculate (Airtable integration)', () => {
  it('fetches rules from the Pricing table and returns a quote', async () => {
    const airtable = makeAirtable([
      {
        id: 'rec1',
        fields: {
          start_date: '2026-01-01',
          end_date: '2026-12-31',
          nightly_rate: 150,
          min_nights: 2,
          label: 'Default',
        },
      },
    ]);
    const service = new PricingService(airtable, makeLogger());

    const q = await service.calculate(
      new Date('2026-06-01'),
      new Date('2026-06-04'),
    );

    expect(airtable.list).toHaveBeenCalledWith('Pricing');
    expect(q.nights).toBe(3);
    expect(q.subtotal).toBe(450);
    expect(q.nightlyBreakdown[0].label).toBe('Default');
  });

  it('skips Airtable rows missing required fields and logs a warning', async () => {
    const airtable = makeAirtable([
      {
        id: 'good',
        fields: {
          start_date: '2026-01-01',
          end_date: '2026-12-31',
          nightly_rate: 100,
        },
      },
      { id: 'bad', fields: { label: 'broken' } },
    ]);
    const logger = makeLogger();
    const service = new PricingService(airtable, logger);

    const q = await service.calculate(
      new Date('2026-06-01'),
      new Date('2026-06-02'),
    );

    expect(q.subtotal).toBe(100);
    expect(logger.warn).toHaveBeenCalledWith(
      'pricing',
      expect.stringContaining('skipping'),
      expect.objectContaining({ id: 'bad' }),
    );
  });
});
