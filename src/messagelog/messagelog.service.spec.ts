import { AirtableService } from '../airtable/airtable.service';
import { LoggerService } from '../logger/logger.service';
import { MessageLogService } from './messagelog.service';

const makeLogger = (): LoggerService =>
  ({
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }) as unknown as LoggerService;

const makeAirtable = (overrides: Partial<AirtableService> = {}) =>
  ({
    list: jest.fn().mockResolvedValue([]),
    create: jest.fn().mockResolvedValue({ id: 'new-rec', fields: {} }),
    ...overrides,
  }) as unknown as AirtableService;

describe('MessageLogService.log', () => {
  it('writes a record with phone, direction, text, and a timestamp', async () => {
    const airtable = makeAirtable();
    const service = new MessageLogService(airtable, makeLogger());

    await service.log('62812', 'in', 'hello', 'greeting');

    expect(airtable.create).toHaveBeenCalledWith(
      'MessageLog',
      expect.objectContaining({
        phone: '62812',
        direction: 'in',
        text: 'hello',
        intent: 'greeting',
        timestamp: expect.any(String),
      }),
    );
  });

  it('omits intent when not provided', async () => {
    const airtable = makeAirtable();
    const service = new MessageLogService(airtable, makeLogger());

    await service.log('62812', 'out', 'bye');

    const call = (airtable.create as jest.Mock).mock.calls[0][1] as Record<
      string,
      unknown
    >;
    expect(call).not.toHaveProperty('intent');
  });

  it('swallows errors so the main flow is not interrupted', async () => {
    const logger = makeLogger();
    const airtable = makeAirtable({
      create: jest.fn().mockRejectedValue(new Error('airtable down')),
    });
    const service = new MessageLogService(airtable, logger);

    await expect(service.log('62812', 'in', 'hi')).resolves.toBeUndefined();
    expect(logger.error).toHaveBeenCalled();
  });
});

describe('MessageLogService.recent', () => {
  it('returns conversation history oldest-first, mapping direction to role', async () => {
    const airtable = makeAirtable({
      list: jest.fn().mockResolvedValue([
        { id: 'r3', fields: { direction: 'out', text: 'third' } },
        { id: 'r2', fields: { direction: 'in', text: 'second' } },
        { id: 'r1', fields: { direction: 'in', text: 'first' } },
      ]),
    });
    const service = new MessageLogService(airtable, makeLogger());

    const history = await service.recent('62812', 3);

    expect(history).toEqual([
      { role: 'customer', text: 'first' },
      { role: 'customer', text: 'second' },
      { role: 'assistant', text: 'third' },
    ]);
  });

  it('queries by phone, sorts by timestamp desc, and respects the limit', async () => {
    const airtable = makeAirtable();
    const service = new MessageLogService(airtable, makeLogger());

    await service.recent('62812', 5);

    expect(airtable.list).toHaveBeenCalledWith('MessageLog', {
      filterByFormula: "{phone}='62812'",
      sort: [{ field: 'timestamp', direction: 'desc' }],
      maxRecords: 5,
    });
  });

  it('returns an empty array and logs when the fetch fails', async () => {
    const logger = makeLogger();
    const airtable = makeAirtable({
      list: jest.fn().mockRejectedValue(new Error('boom')),
    });
    const service = new MessageLogService(airtable, logger);

    const history = await service.recent('62812');

    expect(history).toEqual([]);
    expect(logger.error).toHaveBeenCalled();
  });

  it('skips rows that are missing text or have an unknown direction', async () => {
    const airtable = makeAirtable({
      list: jest.fn().mockResolvedValue([
        { id: 'r1', fields: { direction: 'in', text: 'good' } },
        { id: 'r2', fields: { direction: 'in' } },
        { id: 'r3', fields: { direction: 'sideways', text: 'bad' } },
      ]),
    });
    const service = new MessageLogService(airtable, makeLogger());

    const history = await service.recent('62812');

    expect(history).toEqual([{ role: 'customer', text: 'good' }]);
  });
});
