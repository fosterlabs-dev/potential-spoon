import { AirtableService } from '../airtable/airtable.service';
import { LoggerService } from '../logger/logger.service';
import { TemplatesService } from './templates.service';

const makeLogger = (): LoggerService =>
  ({
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }) as unknown as LoggerService;

const makeAirtable = (rows: Array<{ id: string; fields: unknown }>) =>
  ({ list: jest.fn().mockResolvedValue(rows) }) as unknown as AirtableService;

describe('TemplatesService', () => {
  it('fetches a template by key and substitutes placeholders', async () => {
    const airtable = makeAirtable([
      {
        id: 'r1',
        fields: {
          key: 'availability_confirmed',
          variant: 1,
          text: 'Hi {nights} nights for {total} — sound good?',
        },
      },
    ]);
    const service = new TemplatesService(airtable, makeLogger());

    const out = await service.render('availability_confirmed', {
      name: 'Sam',
      nights: 3,
      total: '$450',
    });

    expect(airtable.list).toHaveBeenCalledWith('Templates', {
      filterByFormula: "{key}='availability_confirmed'",
    });
    expect(out).toBe('HiSam, 3 nights for $450 — sound good?');
  });

  it('throws when no template matches the key', async () => {
    const airtable = makeAirtable([]);
    const service = new TemplatesService(airtable, makeLogger());

    await expect(service.render('missing_key', {})).rejects.toThrow(
      /no template/i,
    );
  });

  it('throws when a placeholder in the template has no value supplied', async () => {
    const airtable = makeAirtable([
      {
        id: 'r1',
        fields: {
          key: 'greet',
          variant: 1,
          text: 'Hi your total is {total}',
        },
      },
    ]);
    const service = new TemplatesService(airtable, makeLogger());

    await expect(service.render('greet', { name: 'Sam' })).rejects.toThrow(
      /total/,
    );
  });

  it('rotates through variants deterministically when multiple exist', async () => {
    const airtable = makeAirtable([
      { id: 'r1', fields: { key: 'greet', variant: 1, text: 'A {name}' } },
      { id: 'r2', fields: { key: 'greet', variant: 2, text: 'B {name}' } },
      { id: 'r3', fields: { key: 'greet', variant: 3, text: 'C {name}' } },
    ]);
    const service = new TemplatesService(airtable, makeLogger());

    const out1 = await service.render('greet', { name: 'x' });
    const out2 = await service.render('greet', { name: 'x' });
    const out3 = await service.render('greet', { name: 'x' });
    const out4 = await service.render('greet', { name: 'x' });

    const seen = new Set([out1, out2, out3]);
    expect(seen.size).toBe(3); // all three variants cycled
    expect(out4).toBe(out1); // wraps
  });

  it('substitutes numbers and booleans as strings', async () => {
    const airtable = makeAirtable([
      {
        id: 'r1',
        fields: { key: 'k', variant: 1, text: '{n} / {ok}' },
      },
    ]);
    const service = new TemplatesService(airtable, makeLogger());

    const out = await service.render('k', { n: 3, ok: true });

    expect(out).toBe('3 / true');
  });

  it('leaves a literal brace alone when not a placeholder', async () => {
    const airtable = makeAirtable([
      {
        id: 'r1',
        fields: { key: 'k', variant: 1, text: 'price: {amt} (net)' },
      },
    ]);
    const service = new TemplatesService(airtable, makeLogger());

    const out = await service.render('k', { amt: '$100' });

    expect(out).toBe('price: $100 (net)');
  });
});
