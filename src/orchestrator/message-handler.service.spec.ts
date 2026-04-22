import { ConfigService } from '@nestjs/config';
import { AvailabilityService } from '../availability/availability.service';
import { ConversationService } from '../conversation/conversation.service';
import { LoggerService } from '../logger/logger.service';
import { ParserService } from '../parser/parser.service';
import { PricingService } from '../pricing/pricing.service';
import { TemplatesService } from '../templates/templates.service';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import { MessageHandlerService } from './message-handler.service';

const OWNER = '628999000';

const makeLogger = (): LoggerService =>
  ({
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }) as unknown as LoggerService;

const makeParser = (result: unknown): ParserService =>
  ({ parse: jest.fn().mockResolvedValue(result) }) as unknown as ParserService;

const makeAvailability = (available = true): AvailabilityService =>
  ({
    isRangeAvailable: jest.fn().mockResolvedValue(available),
  }) as unknown as AvailabilityService;

const makePricing = (
  quote: unknown = {
    nights: 3,
    nightlyBreakdown: [],
    subtotal: 300,
    total: 300,
    minNights: 0,
    meetsMinNights: true,
  },
): PricingService =>
  ({ calculate: jest.fn().mockResolvedValue(quote) }) as unknown as PricingService;

const makeTemplates = (text = 'rendered'): TemplatesService =>
  ({
    render: jest.fn().mockResolvedValue(text),
  }) as unknown as TemplatesService;

const makeWhatsapp = (): WhatsappService =>
  ({ sendMessage: jest.fn().mockResolvedValue(undefined) }) as unknown as WhatsappService;

const makeConversation = (
  overrides: Partial<ConversationService> = {},
): ConversationService =>
  ({
    parseCommand: jest.fn().mockReturnValue(null),
    setStatus: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  }) as unknown as ConversationService;

const makeConfig = (owner: string | undefined = OWNER): ConfigService =>
  ({ get: () => owner }) as unknown as ConfigService;

const build = (over: {
  parser?: ParserService;
  availability?: AvailabilityService;
  pricing?: PricingService;
  templates?: TemplatesService;
  whatsapp?: WhatsappService;
  conversation?: ConversationService;
  logger?: LoggerService;
  config?: ConfigService;
} = {}) =>
  new MessageHandlerService(
    over.parser ?? makeParser({ intent: 'unknown', checkIn: null, checkOut: null, guests: null }),
    over.availability ?? makeAvailability(),
    over.pricing ?? makePricing(),
    over.templates ?? makeTemplates(),
    over.whatsapp ?? makeWhatsapp(),
    over.conversation ?? makeConversation(),
    over.logger ?? makeLogger(),
    over.config ?? makeConfig(),
  );

describe('MessageHandlerService.handle — owner commands', () => {
  it('pauses the conversation when the owner sends /pause 30 (with duration)', async () => {
    const conversation = makeConversation({
      parseCommand: jest.fn().mockReturnValue({ command: 'pause', minutes: 30 }),
      setStatus: jest.fn().mockResolvedValue(undefined),
    });
    const whatsapp = makeWhatsapp();
    const handler = build({ conversation, whatsapp });

    await handler.handle({ from: OWNER, text: '/pause 30' });

    expect(conversation.setStatus).toHaveBeenCalledWith(OWNER, 'paused', {
      pauseForMinutes: 30,
    });
    expect(whatsapp.sendMessage).toHaveBeenCalledWith(
      OWNER,
      expect.stringContaining('paused'),
      { override: true },
    );
  });

  it('releases the conversation to a human on /release', async () => {
    const conversation = makeConversation({
      parseCommand: jest.fn().mockReturnValue({ command: 'release' }),
      setStatus: jest.fn(),
    });
    const whatsapp = makeWhatsapp();
    const handler = build({ conversation, whatsapp });

    await handler.handle({ from: OWNER, text: '/release' });

    expect(conversation.setStatus).toHaveBeenCalledWith(OWNER, 'human');
    expect(whatsapp.sendMessage).toHaveBeenCalledWith(
      OWNER,
      expect.any(String),
      { override: true },
    );
  });

  it('resumes the conversation on /resume', async () => {
    const conversation = makeConversation({
      parseCommand: jest.fn().mockReturnValue({ command: 'resume' }),
      setStatus: jest.fn(),
    });
    const handler = build({ conversation });

    await handler.handle({ from: OWNER, text: '/resume' });

    expect(conversation.setStatus).toHaveBeenCalledWith(OWNER, 'bot');
  });

  it('ignores commands from anyone other than the owner', async () => {
    const conversation = makeConversation({
      parseCommand: jest.fn().mockReturnValue({ command: 'pause' }),
      setStatus: jest.fn(),
    });
    const handler = build({ conversation });

    await handler.handle({ from: '628111', text: '/pause' });

    expect(conversation.setStatus).not.toHaveBeenCalled();
  });
});

describe('MessageHandlerService.handle — availability flow', () => {
  it('quotes and replies with availability_confirmed when dates are free', async () => {
    const parser = makeParser({
      intent: 'availability_check',
      checkIn: new Date('2026-06-15'),
      checkOut: new Date('2026-06-18'),
      guests: 2,
    });
    const availability = makeAvailability(true);
    const pricing = makePricing();
    const templates = makeTemplates('you are booked');
    const whatsapp = makeWhatsapp();
    const handler = build({ parser, availability, pricing, templates, whatsapp });

    await handler.handle({ from: '628777', text: 'is 15-18 jun free for 2?' });

    expect(availability.isRangeAvailable).toHaveBeenCalledWith(
      new Date('2026-06-15'),
      new Date('2026-06-18'),
    );
    expect(pricing.calculate).toHaveBeenCalledWith(
      new Date('2026-06-15'),
      new Date('2026-06-18'),
    );
    expect(templates.render).toHaveBeenCalledWith(
      'availability_confirmed',
      expect.objectContaining({ nights: 3, total: 300, guests: 2 }),
    );
    expect(whatsapp.sendMessage).toHaveBeenCalledWith('628777', 'you are booked');
  });

  it('replies with availability_unavailable when dates are taken', async () => {
    const parser = makeParser({
      intent: 'availability_check',
      checkIn: new Date('2026-06-15'),
      checkOut: new Date('2026-06-18'),
      guests: 2,
    });
    const availability = makeAvailability(false);
    const templates = makeTemplates('taken');
    const whatsapp = makeWhatsapp();
    const handler = build({ parser, availability, templates, whatsapp });

    await handler.handle({ from: '628777', text: 'is 15-18 jun free?' });

    expect(templates.render).toHaveBeenCalledWith(
      'availability_unavailable',
      expect.any(Object),
    );
    expect(whatsapp.sendMessage).toHaveBeenCalledWith('628777', 'taken');
  });

  it('asks for missing details when dates are not provided', async () => {
    const parser = makeParser({
      intent: 'availability_check',
      checkIn: null,
      checkOut: null,
      guests: 2,
    });
    const templates = makeTemplates('please share dates');
    const handler = build({ parser, templates });

    await handler.handle({ from: '628777', text: 'free this summer?' });

    expect(templates.render).toHaveBeenCalledWith(
      'needs_details',
      expect.any(Object),
    );
  });
});

describe('MessageHandlerService.handle — fail-safe paths', () => {
  it('routes unknown intent to a handoff reply and pauses the bot + notifies owner', async () => {
    const parser = makeParser({
      intent: 'unknown',
      checkIn: null,
      checkOut: null,
      guests: null,
    });
    const conversation = makeConversation({
      parseCommand: jest.fn().mockReturnValue(null),
      setStatus: jest.fn(),
    });
    const whatsapp = makeWhatsapp();
    const handler = build({ parser, conversation, whatsapp });

    await handler.handle({ from: '628777', text: 'hey can I pay in yen' });

    expect(conversation.setStatus).toHaveBeenCalledWith('628777', 'paused', {
      pauseForMinutes: 60,
    });
    expect(whatsapp.sendMessage).toHaveBeenCalledWith(
      '628777',
      expect.any(String),
    );
    expect(whatsapp.sendMessage).toHaveBeenCalledWith(
      OWNER,
      expect.any(String),
      { override: true },
    );
  });

  it('sends the holding reply + notifies owner + pauses when a downstream service throws', async () => {
    const parser = makeParser({
      intent: 'availability_check',
      checkIn: new Date('2026-06-15'),
      checkOut: new Date('2026-06-18'),
      guests: 2,
    });
    const availability = {
      isRangeAvailable: jest.fn().mockRejectedValue(new Error('ical down')),
    } as unknown as AvailabilityService;
    const conversation = makeConversation({
      parseCommand: jest.fn().mockReturnValue(null),
      setStatus: jest.fn(),
    });
    const whatsapp = makeWhatsapp();
    const logger = makeLogger();
    const handler = build({ parser, availability, conversation, whatsapp, logger });

    await handler.handle({ from: '628777', text: 'is 15-18 jun free?' });

    expect(conversation.setStatus).toHaveBeenCalledWith('628777', 'paused', {
      pauseForMinutes: 60,
    });
    expect(whatsapp.sendMessage).toHaveBeenCalledWith(
      OWNER,
      expect.any(String),
      { override: true },
    );
    expect(logger.error).toHaveBeenCalled();
  });
});
