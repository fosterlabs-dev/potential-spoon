import { ConfigService } from '@nestjs/config';
import { AirtableService } from './airtable.service';
import { LoggerService } from '../logger/logger.service';

const mockAll = jest.fn();
const mockFind = jest.fn();
const mockCreate = jest.fn();
const mockUpdate = jest.fn();
const mockSelect = jest.fn(() => ({ all: mockAll }));
const mockTable = jest.fn(() => ({
  select: mockSelect,
  find: mockFind,
  create: mockCreate,
  update: mockUpdate,
}));
const mockBase = jest.fn(() => mockTable);

jest.mock('airtable', () =>
  jest.fn().mockImplementation(() => ({ base: mockBase })),
);

const makeConfig = (
  values: Record<string, string | undefined> = {
    AIRTABLE_API_KEY: 'test-key',
    AIRTABLE_BASE_ID: 'test-base',
  },
): ConfigService =>
  ({ get: (key: string) => values[key] }) as unknown as ConfigService;

const makeLogger = (): LoggerService =>
  ({
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }) as unknown as LoggerService;

describe('AirtableService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('throws at construction when API key or base id is missing', () => {
    const logger = makeLogger();
    expect(
      () =>
        new AirtableService(
          makeConfig({ AIRTABLE_API_KEY: 'x', AIRTABLE_BASE_ID: undefined }),
          logger,
        ),
    ).toThrow();
    expect(
      () =>
        new AirtableService(
          makeConfig({ AIRTABLE_API_KEY: undefined, AIRTABLE_BASE_ID: 'y' }),
          logger,
        ),
    ).toThrow();
  });

  it('lists records, returning id and fields', async () => {
    mockAll.mockResolvedValue([
      { id: 'rec1', fields: { name: 'Alpha' } },
      { id: 'rec2', fields: { name: 'Beta' } },
    ]);
    const service = new AirtableService(makeConfig(), makeLogger());

    const rows = await service.list<{ name: string }>('Pricing');

    expect(mockTable).toHaveBeenCalledWith('Pricing');
    expect(mockSelect).toHaveBeenCalledWith({});
    expect(rows).toEqual([
      { id: 'rec1', fields: { name: 'Alpha' } },
      { id: 'rec2', fields: { name: 'Beta' } },
    ]);
  });

  it('forwards select options to Airtable', async () => {
    mockAll.mockResolvedValue([]);
    const service = new AirtableService(makeConfig(), makeLogger());

    await service.list('Templates', {
      filterByFormula: "{key}='hello'",
      maxRecords: 5,
      view: 'Grid view',
    });

    expect(mockSelect).toHaveBeenCalledWith({
      filterByFormula: "{key}='hello'",
      maxRecords: 5,
      view: 'Grid view',
    });
  });

  it('finds a single record by id', async () => {
    mockFind.mockResolvedValue({ id: 'rec9', fields: { x: 1 } });
    const service = new AirtableService(makeConfig(), makeLogger());

    const row = await service.find<{ x: number }>('Conversations', 'rec9');

    expect(mockTable).toHaveBeenCalledWith('Conversations');
    expect(mockFind).toHaveBeenCalledWith('rec9');
    expect(row).toEqual({ id: 'rec9', fields: { x: 1 } });
  });

  it('returns null when find hits NOT_FOUND', async () => {
    const err = Object.assign(new Error('Not found'), { error: 'NOT_FOUND' });
    mockFind.mockRejectedValue(err);
    const service = new AirtableService(makeConfig(), makeLogger());

    const row = await service.find('Conversations', 'recMissing');

    expect(row).toBeNull();
  });

  it('logs and rethrows on unexpected list errors', async () => {
    mockAll.mockRejectedValue(new Error('boom'));
    const logger = makeLogger();
    const service = new AirtableService(makeConfig(), logger);

    await expect(service.list('Pricing')).rejects.toThrow('boom');
    expect(logger.error).toHaveBeenCalledWith(
      'airtable',
      expect.stringContaining('list'),
      expect.objectContaining({ table: 'Pricing' }),
    );
  });

  it('logs and rethrows on unexpected find errors (non NOT_FOUND)', async () => {
    const err = Object.assign(new Error('rate limited'), {
      error: 'RATE_LIMIT',
    });
    mockFind.mockRejectedValue(err);
    const logger = makeLogger();
    const service = new AirtableService(makeConfig(), logger);

    await expect(service.find('Pricing', 'recX')).rejects.toThrow(
      'rate limited',
    );
    expect(logger.error).toHaveBeenCalledWith(
      'airtable',
      expect.stringContaining('find'),
      expect.objectContaining({ table: 'Pricing', id: 'recX' }),
    );
  });

  it('creates a record and returns id + fields', async () => {
    mockCreate.mockResolvedValue({
      id: 'recNew',
      fields: { phone: '62812', status: 'bot' },
    });
    const service = new AirtableService(makeConfig(), makeLogger());

    const row = await service.create('Conversations', {
      phone: '62812',
      status: 'bot',
    });

    expect(mockTable).toHaveBeenCalledWith('Conversations');
    expect(mockCreate).toHaveBeenCalledWith({
      phone: '62812',
      status: 'bot',
    });
    expect(row).toEqual({
      id: 'recNew',
      fields: { phone: '62812', status: 'bot' },
    });
  });

  it('updates a record by id and returns id + fields', async () => {
    mockUpdate.mockResolvedValue({
      id: 'rec1',
      fields: { phone: '62812', status: 'paused' },
    });
    const service = new AirtableService(makeConfig(), makeLogger());

    const row = await service.update('Conversations', 'rec1', {
      status: 'paused',
    });

    expect(mockUpdate).toHaveBeenCalledWith('rec1', { status: 'paused' });
    expect(row).toEqual({
      id: 'rec1',
      fields: { phone: '62812', status: 'paused' },
    });
  });

  it('logs and rethrows on create errors', async () => {
    mockCreate.mockRejectedValue(new Error('boom'));
    const logger = makeLogger();
    const service = new AirtableService(makeConfig(), logger);

    await expect(service.create('Conversations', { phone: 'x' })).rejects.toThrow(
      'boom',
    );
    expect(logger.error).toHaveBeenCalledWith(
      'airtable',
      expect.stringContaining('create'),
      expect.objectContaining({ table: 'Conversations' }),
    );
  });
});
