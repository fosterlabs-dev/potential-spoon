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
  it('fetches a template by key and returns raw text', async () => {
    const airtable = makeAirtable([
      {
        id: 'r1',
        fields: {
          key: 'availability_confirmed',
          variant: 1,
          text: 'Your dates are available.',
        },
      },
    ]);
    const service = new TemplatesService(airtable, makeLogger());

    const out = await service.render('availability_confirmed');

    expect(airtable.list).toHaveBeenCalledWith('Templates', {
      filterByFormula: "{key}='availability_confirmed'",
    });
    expect(out).toBe('Your dates are available.');
  });

  it('throws when no template matches the key', async () => {
    const airtable = makeAirtable([]);
    const service = new TemplatesService(airtable, makeLogger());

    await expect(service.render('missing_key')).rejects.toThrow(
      /no template/i,
    );
  });

  it('rotates through variants deterministically when multiple exist', async () => {
    const airtable = makeAirtable([
      { id: 'r1', fields: { key: 'greet', variant: 1, text: 'A' } },
      { id: 'r2', fields: { key: 'greet', variant: 2, text: 'B' } },
      { id: 'r3', fields: { key: 'greet', variant: 3, text: 'C' } },
    ]);
    const service = new TemplatesService(airtable, makeLogger());

    const out1 = await service.render('greet');
    const out2 = await service.render('greet');
    const out3 = await service.render('greet');
    const out4 = await service.render('greet');

    const seen = new Set([out1, out2, out3]);
    expect(seen.size).toBe(3); // all three variants cycled
    expect(out4).toBe(out1); // wraps
  });
});
