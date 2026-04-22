import { ConfigService } from '@nestjs/config';
import { LoggerService } from '../logger/logger.service';
import { ParserService } from './parser.service';

const mockCreate = jest.fn();

jest.mock('@anthropic-ai/sdk', () =>
  jest.fn().mockImplementation(() => ({
    messages: { create: (...args: unknown[]) => mockCreate(...args) },
  })),
);

const makeConfig = (
  values: Record<string, string | undefined> = {
    ANTHROPIC_API_KEY: 'test-key',
    CLAUDE_MODEL: 'claude-haiku-4-5-20251001',
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

const claudeResponse = (json: unknown) => ({
  content: [{ type: 'text', text: JSON.stringify(json) }],
});

describe('ParserService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('throws at construction when ANTHROPIC_API_KEY is missing', () => {
    expect(
      () =>
        new ParserService(
          makeConfig({ ANTHROPIC_API_KEY: undefined }),
          makeLogger(),
        ),
    ).toThrow();
  });

  it('parses a well-formed Claude response into a structured intent', async () => {
    mockCreate.mockResolvedValue(
      claudeResponse({
        intent: 'availability_check',
        checkIn: '2026-06-15',
        checkOut: '2026-06-20',
        guests: 2,
      }),
    );
    const service = new ParserService(makeConfig(), makeLogger());

    const out = await service.parse('Hi, is 15-20 June free for 2 people?');

    expect(out).toEqual({
      intent: 'availability_check',
      checkIn: new Date('2026-06-15'),
      checkOut: new Date('2026-06-20'),
      guests: 2,
    });
  });

  it('calls Claude with the configured model and the user message', async () => {
    mockCreate.mockResolvedValue(
      claudeResponse({ intent: 'unknown', checkIn: null, checkOut: null, guests: null }),
    );
    const service = new ParserService(makeConfig(), makeLogger());

    await service.parse('hey');

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'claude-haiku-4-5-20251001',
        messages: expect.arrayContaining([
          expect.objectContaining({ role: 'user', content: 'hey' }),
        ]),
      }),
    );
  });

  it('returns intent with null date/guest fields when Claude omits them', async () => {
    mockCreate.mockResolvedValue(claudeResponse({ intent: 'availability_check' }));
    const service = new ParserService(makeConfig(), makeLogger());

    const out = await service.parse('vague');

    expect(out).toEqual({
      intent: 'availability_check',
      checkIn: null,
      checkOut: null,
      guests: null,
    });
  });

  it('returns unknown intent when Claude output is not valid JSON', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'not json at all' }],
    });
    const logger = makeLogger();
    const service = new ParserService(makeConfig(), logger);

    const out = await service.parse('whatever');

    expect(out.intent).toBe('unknown');
    expect(logger.warn).toHaveBeenCalledWith(
      'parser',
      expect.stringContaining('JSON'),
      expect.any(Object),
    );
  });

  it('logs and rethrows when the Claude API call fails', async () => {
    mockCreate.mockRejectedValue(new Error('429 rate limited'));
    const logger = makeLogger();
    const service = new ParserService(makeConfig(), logger);

    await expect(service.parse('hi')).rejects.toThrow('429 rate limited');
    expect(logger.error).toHaveBeenCalledWith(
      'parser',
      expect.stringContaining('Claude'),
      expect.objectContaining({ error: '429 rate limited' }),
    );
  });

  it('parses JSON wrapped in markdown code fences', async () => {
    mockCreate.mockResolvedValue({
      content: [
        {
          type: 'text',
          text: '```json\n{\n  "intent": "greeting",\n  "checkIn": null,\n  "checkOut": null,\n  "guests": null\n}\n```',
        },
      ],
    });
    const service = new ParserService(makeConfig(), makeLogger());

    const out = await service.parse('hi');

    expect(out).toEqual({
      intent: 'greeting',
      checkIn: null,
      checkOut: null,
      guests: null,
    });
  });

  it('parses JSON embedded in surrounding prose', async () => {
    mockCreate.mockResolvedValue({
      content: [
        {
          type: 'text',
          text: 'Here is the result:\n{"intent":"greeting","checkIn":null,"checkOut":null,"guests":null}\nLet me know if you need more.',
        },
      ],
    });
    const service = new ParserService(makeConfig(), makeLogger());

    const out = await service.parse('hi');

    expect(out.intent).toBe('greeting');
  });

  it('accepts partial date info (check-in only) without erroring', async () => {
    mockCreate.mockResolvedValue(
      claudeResponse({
        intent: 'availability_check',
        checkIn: '2026-06-15',
        checkOut: null,
        guests: 2,
      }),
    );
    const service = new ParserService(makeConfig(), makeLogger());

    const out = await service.parse('hi want to come on june 15');

    expect(out).toEqual({
      intent: 'availability_check',
      checkIn: new Date('2026-06-15'),
      checkOut: null,
      guests: 2,
    });
  });
});
