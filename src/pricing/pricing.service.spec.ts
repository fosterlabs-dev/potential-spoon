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

const rule = (p: Partial<PricingRule> & Pick<PricingRule, 'startDate' | 'endDate' | 'weeklyRate'>): PricingRule => ({
  minWeeks: undefined,
  label: undefined,
  ...p,
});

describe('PricingService.quote (pure)', () => {
  const service = new PricingService(makeAirtable([]), makeLogger());

  it('multiplies the band weekly rate by the number of weeks', () => {
    const rules = [
      rule({
        startDate: new Date('2027-01-04'),
        endDate: new Date('2027-12-31'),
        weeklyRate: 2495,
        label: 'Default',
      }),
    ];

    const q = service.quote(
      rules,
      new Date('2027-06-06'),
      new Date('2027-06-20'),
    );

    expect(q.weeks).toBe(2);
    expect(q.nights).toBe(14);
    expect(q.weeklyRate).toBe(2495);
    expect(q.subtotal).toBe(4990);
    expect(q.total).toBe(4990);
    expect(q.label).toBe('Default');
  });

  it('picks the band that contains the check-in date', () => {
    const rules = [
      rule({
        startDate: new Date('2027-05-30'),
        endDate: new Date('2027-07-11'),
        weeklyRate: 3995,
        label: 'Summer',
      }),
      rule({
        startDate: new Date('2027-07-11'),
        endDate: new Date('2027-08-29'),
        weeklyRate: 4995,
        label: 'High Summer',
      }),
    ];

    const q = service.quote(
      rules,
      new Date('2027-07-04'),
      new Date('2027-07-18'),
    );

    expect(q.label).toBe('Summer');
    expect(q.weeklyRate).toBe(3995);
    expect(q.total).toBe(3995 * 2);
  });

  it('prefers the narrower rule when two cover the check-in date', () => {
    const rules = [
      rule({
        startDate: new Date('2027-01-01'),
        endDate: new Date('2027-12-31'),
        weeklyRate: 2495,
      }),
      rule({
        startDate: new Date('2027-07-11'),
        endDate: new Date('2027-08-29'),
        weeklyRate: 4995,
      }),
    ];

    const q = service.quote(
      rules,
      new Date('2027-07-18'),
      new Date('2027-07-25'),
    );

    expect(q.weeklyRate).toBe(4995);
  });

  it('throws when no rule covers the check-in date', () => {
    const rules = [
      rule({
        startDate: new Date('2027-07-01'),
        endDate: new Date('2027-07-31'),
        weeklyRate: 4995,
      }),
    ];

    expect(() =>
      service.quote(
        rules,
        new Date('2027-06-06'),
        new Date('2027-06-13'),
      ),
    ).toThrow(/no pricing rule/i);
  });

  it('throws on invalid range (checkOut <= checkIn)', () => {
    expect(() =>
      service.quote([], new Date('2027-06-06'), new Date('2027-06-06')),
    ).toThrow();
    expect(() =>
      service.quote([], new Date('2027-06-13'), new Date('2027-06-06')),
    ).toThrow();
  });

  it('throws when stay length is not a multiple of 7 nights', () => {
    const rules = [
      rule({
        startDate: new Date('2027-01-01'),
        endDate: new Date('2027-12-31'),
        weeklyRate: 2495,
      }),
    ];

    expect(() =>
      service.quote(
        rules,
        new Date('2027-06-06'),
        new Date('2027-06-10'),
      ),
    ).toThrow(/multiple of 7/i);
  });

  it('reports meetsMinWeeks=false when stay is shorter than the band minimum', () => {
    const rules = [
      rule({
        startDate: new Date('2027-01-01'),
        endDate: new Date('2027-12-31'),
        weeklyRate: 4995,
        minWeeks: 2,
      }),
    ];

    const q = service.quote(
      rules,
      new Date('2027-07-04'),
      new Date('2027-07-11'),
    );

    expect(q.minWeeks).toBe(2);
    expect(q.weeks).toBe(1);
    expect(q.meetsMinWeeks).toBe(false);
  });

  it('reports meetsMinWeeks=true when stay meets the band minimum', () => {
    const rules = [
      rule({
        startDate: new Date('2027-01-01'),
        endDate: new Date('2027-12-31'),
        weeklyRate: 4995,
        minWeeks: 2,
      }),
    ];

    const q = service.quote(
      rules,
      new Date('2027-07-04'),
      new Date('2027-07-18'),
    );

    expect(q.meetsMinWeeks).toBe(true);
  });
});

describe('PricingService.calculate (Airtable integration)', () => {
  it('fetches rules from the Pricing table and returns a quote', async () => {
    const airtable = makeAirtable([
      {
        id: 'rec1',
        fields: {
          start_date: '2027-01-01',
          end_date: '2027-12-31',
          weekly_rate: 3995,
          min_weeks: 1,
          label: 'Summer',
        },
      },
    ]);
    const service = new PricingService(airtable, makeLogger());

    const q = await service.calculate(
      new Date('2027-06-06'),
      new Date('2027-06-20'),
    );

    expect(airtable.list).toHaveBeenCalledWith('Pricing');
    expect(q.weeks).toBe(2);
    expect(q.subtotal).toBe(7990);
    expect(q.label).toBe('Summer');
  });

  it('skips Airtable rows missing required fields and logs a warning', async () => {
    const airtable = makeAirtable([
      {
        id: 'good',
        fields: {
          start_date: '2027-01-01',
          end_date: '2027-12-31',
          weekly_rate: 2495,
        },
      },
      { id: 'bad', fields: { label: 'broken' } },
    ]);
    const logger = makeLogger();
    const service = new PricingService(airtable, logger);

    const q = await service.calculate(
      new Date('2027-06-06'),
      new Date('2027-06-13'),
    );

    expect(q.subtotal).toBe(2495);
    expect(logger.warn).toHaveBeenCalledWith(
      'pricing',
      expect.stringContaining('skipping'),
      expect.objectContaining({ id: 'bad' }),
    );
  });
});
