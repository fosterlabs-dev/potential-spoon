import { AirtableService } from '../airtable/airtable.service';
import { LoggerService } from '../logger/logger.service';
import { ConversationService } from './conversation.service';

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
    update: jest.fn().mockResolvedValue({ id: 'rec1', fields: {} }),
    ...overrides,
  }) as unknown as AirtableService;

describe('ConversationService.getStatus', () => {
  it('returns bot when no conversation row exists for the phone', async () => {
    const airtable = makeAirtable();
    const service = new ConversationService(airtable, makeLogger());

    const status = await service.getStatus('62812');

    expect(status).toBe('bot');
    expect(airtable.list).toHaveBeenCalledWith('Conversations', {
      filterByFormula: "{phone}='62812'",
      maxRecords: 1,
    });
  });

  it('returns the stored status when a row exists', async () => {
    const airtable = makeAirtable({
      list: jest.fn().mockResolvedValue([
        { id: 'rec1', fields: { phone: '62812', status: 'human' } },
      ]),
    });
    const service = new ConversationService(airtable, makeLogger());

    expect(await service.getStatus('62812')).toBe('human');
  });

  it('returns bot when the stored status has expired via pause_until', async () => {
    const past = new Date(Date.now() - 60_000).toISOString();
    const airtable = makeAirtable({
      list: jest.fn().mockResolvedValue([
        {
          id: 'rec1',
          fields: { phone: '62812', status: 'paused', pause_until: past },
        },
      ]),
    });
    const service = new ConversationService(airtable, makeLogger());

    expect(await service.getStatus('62812')).toBe('bot');
  });

  it('stays paused when pause_until is in the future', async () => {
    const future = new Date(Date.now() + 60 * 60_000).toISOString();
    const airtable = makeAirtable({
      list: jest.fn().mockResolvedValue([
        {
          id: 'rec1',
          fields: { phone: '62812', status: 'paused', pause_until: future },
        },
      ]),
    });
    const service = new ConversationService(airtable, makeLogger());

    expect(await service.getStatus('62812')).toBe('paused');
  });
});

describe('ConversationService.canSendBot', () => {
  it('allows sends when status is bot', async () => {
    const service = new ConversationService(makeAirtable(), makeLogger());
    expect(await service.canSendBot('62812')).toBe(true);
  });

  it('blocks sends when status is human or paused', async () => {
    const humanAirtable = makeAirtable({
      list: jest.fn().mockResolvedValue([
        { id: 'r', fields: { phone: '62812', status: 'human' } },
      ]),
    });
    const pausedAirtable = makeAirtable({
      list: jest.fn().mockResolvedValue([
        {
          id: 'r',
          fields: {
            phone: '62812',
            status: 'paused',
            pause_until: new Date(Date.now() + 60_000).toISOString(),
          },
        },
      ]),
    });

    expect(
      await new ConversationService(humanAirtable, makeLogger()).canSendBot(
        '62812',
      ),
    ).toBe(false);
    expect(
      await new ConversationService(pausedAirtable, makeLogger()).canSendBot(
        '62812',
      ),
    ).toBe(false);
  });
});

describe('ConversationService.setStatus', () => {
  it('creates a new row when one does not exist', async () => {
    const airtable = makeAirtable();
    const service = new ConversationService(airtable, makeLogger());

    await service.setStatus('62812', 'human');

    expect(airtable.create).toHaveBeenCalledWith(
      'Conversations',
      expect.objectContaining({ phone: '62812', status: 'human' }),
    );
  });

  it('updates the existing row when one exists', async () => {
    const airtable = makeAirtable({
      list: jest.fn().mockResolvedValue([
        { id: 'rec1', fields: { phone: '62812', status: 'bot' } },
      ]),
    });
    const service = new ConversationService(airtable, makeLogger());

    await service.setStatus('62812', 'paused', {
      pauseForMinutes: 30,
    });

    expect(airtable.update).toHaveBeenCalledWith(
      'Conversations',
      'rec1',
      expect.objectContaining({
        status: 'paused',
        pause_until: expect.any(String),
      }),
    );
  });
});

describe('ConversationService.parseCommand', () => {
  const service = new ConversationService(makeAirtable(), makeLogger());

  it('parses /release', () => {
    expect(service.parseCommand('/release')).toEqual({ command: 'release' });
  });

  it('parses /pause with no duration', () => {
    expect(service.parseCommand('/pause')).toEqual({ command: 'pause' });
  });

  it('parses /pause with minutes duration', () => {
    expect(service.parseCommand('/pause 30')).toEqual({
      command: 'pause',
      minutes: 30,
    });
  });

  it('parses /resume', () => {
    expect(service.parseCommand('/resume')).toEqual({ command: 'resume' });
  });

  it('returns null for non-commands', () => {
    expect(service.parseCommand('hello there')).toBeNull();
    expect(service.parseCommand('/unknown')).toBeNull();
    expect(service.parseCommand('')).toBeNull();
  });

  it('is case-insensitive and tolerant of leading whitespace', () => {
    expect(service.parseCommand('  /RELEASE')).toEqual({ command: 'release' });
    expect(service.parseCommand('/Pause 15')).toEqual({
      command: 'pause',
      minutes: 15,
    });
  });
});
