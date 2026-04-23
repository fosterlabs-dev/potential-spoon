import { ConfigService } from '@nestjs/config';
import { AvailabilityService } from '../availability/availability.service';
import { ConversationService } from '../conversation/conversation.service';
import { LoggerService } from '../logger/logger.service';
import { MessageLogService } from '../messagelog/messagelog.service';
import { ParseResult, ParserService } from '../parser/parser.service';
import { PricingService } from '../pricing/pricing.service';
import { TemplatesService } from '../templates/templates.service';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import { MessageHandlerService } from './message-handler.service';

const OWNER = '628999000';
const CUSTOMER = '628777';

const makeLogger = (): LoggerService =>
  ({
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }) as unknown as LoggerService;

const defaultParsed = (overrides: Partial<ParseResult> = {}): ParseResult => ({
  intent: 'off_topic_or_unclear',
  confidence: 0.9,
  customerName: null,
  checkIn: null,
  checkOut: null,
  guests: null,
  ...overrides,
});

const makeParser = (result: Partial<ParseResult> = {}): ParserService =>
  ({
    parse: jest.fn().mockResolvedValue(defaultParsed(result)),
  }) as unknown as ParserService;

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
  ({
    calculate: jest.fn().mockResolvedValue(quote),
  }) as unknown as PricingService;

const makeTemplates = (text = 'rendered'): TemplatesService =>
  ({
    render: jest.fn().mockResolvedValue(text),
  }) as unknown as TemplatesService;

const makeWhatsapp = (): WhatsappService =>
  ({
    sendMessage: jest.fn().mockResolvedValue(undefined),
  }) as unknown as WhatsappService;

const makeConversation = (
  overrides: Partial<ConversationService> = {},
): ConversationService =>
  ({
    parseCommand: jest.fn().mockReturnValue(null),
    setStatus: jest.fn().mockResolvedValue(undefined),
    getState: jest.fn().mockResolvedValue({
      status: 'bot',
      lastIntent: null,
      pendingDates: null,
      customerName: null,
    }),
    updateContext: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  }) as unknown as ConversationService;

const makeMessageLog = (): MessageLogService =>
  ({
    log: jest.fn().mockResolvedValue(undefined),
    recent: jest.fn().mockResolvedValue([]),
  }) as unknown as MessageLogService;

const makeConfig = (owner: string | undefined = OWNER): ConfigService =>
  ({ get: () => owner }) as unknown as ConfigService;

const build = (
  over: {
    parser?: ParserService;
    availability?: AvailabilityService;
    pricing?: PricingService;
    templates?: TemplatesService;
    whatsapp?: WhatsappService;
    conversation?: ConversationService;
    messageLog?: MessageLogService;
    logger?: LoggerService;
    config?: ConfigService;
  } = {},
) =>
  new MessageHandlerService(
    over.parser ?? makeParser(),
    over.availability ?? makeAvailability(),
    over.pricing ?? makePricing(),
    over.templates ?? makeTemplates(),
    over.whatsapp ?? makeWhatsapp(),
    over.conversation ?? makeConversation(),
    over.messageLog ?? makeMessageLog(),
    over.logger ?? makeLogger(),
    over.config ?? makeConfig(),
  );

describe('MessageHandlerService.handle — inbound logging', () => {
  it('logs every incoming message to MessageLog', async () => {
    const messageLog = makeMessageLog();
    const handler = build({ messageLog });

    await handler.handle({ from: CUSTOMER, text: 'hello' });

    expect(messageLog.log).toHaveBeenCalledWith(CUSTOMER, 'in', 'hello');
  });

  it('logs every outbound message to MessageLog', async () => {
    const parser = makeParser({ intent: 'greeting' });
    const templates = makeTemplates('hi, what dates?');
    const messageLog = makeMessageLog();
    const handler = build({ parser, templates, messageLog });

    await handler.handle({ from: CUSTOMER, text: 'hello' });

    expect(messageLog.log).toHaveBeenCalledWith(
      CUSTOMER,
      'out',
      'hi, what dates?',
    );
  });
});

describe('MessageHandlerService.handle — owner commands', () => {
  it('pauses the owner conversation on /pause 30', async () => {
    const conversation = makeConversation({
      parseCommand: jest
        .fn()
        .mockReturnValue({ command: 'pause', minutes: 30 }),
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

  it('pauses a specific customer when owner sends /pause <phone> <minutes>', async () => {
    const conversation = makeConversation({
      parseCommand: jest.fn().mockReturnValue({
        command: 'pause',
        phone: CUSTOMER,
        minutes: 1440,
      }),
    });
    const whatsapp = makeWhatsapp();
    const handler = build({ conversation, whatsapp });

    await handler.handle({ from: OWNER, text: `/pause ${CUSTOMER} 1440` });

    expect(conversation.setStatus).toHaveBeenCalledWith(CUSTOMER, 'paused', {
      pauseForMinutes: 1440,
    });
    expect(whatsapp.sendMessage).toHaveBeenCalledWith(
      OWNER,
      expect.stringContaining(CUSTOMER),
      { override: true },
    );
  });

  it('releases a customer to human on /release <phone>', async () => {
    const conversation = makeConversation({
      parseCommand: jest
        .fn()
        .mockReturnValue({ command: 'release', phone: CUSTOMER }),
    });
    const handler = build({ conversation });

    await handler.handle({ from: OWNER, text: `/release ${CUSTOMER}` });

    expect(conversation.setStatus).toHaveBeenCalledWith(CUSTOMER, 'human');
  });

  it('reports conversation state on /status <phone>', async () => {
    const conversation = makeConversation({
      parseCommand: jest
        .fn()
        .mockReturnValue({ command: 'status', phone: CUSTOMER }),
      getState: jest.fn().mockResolvedValue({
        status: 'paused',
        lastIntent: 'availability_inquiry',
        pendingDates: null,
        customerName: null,
      }),
    });
    const whatsapp = makeWhatsapp();
    const handler = build({ conversation, whatsapp });

    await handler.handle({ from: OWNER, text: `/status ${CUSTOMER}` });

    expect(whatsapp.sendMessage).toHaveBeenCalledWith(
      OWNER,
      expect.stringContaining('paused'),
      { override: true },
    );
  });

  it('ignores commands from anyone other than the owner', async () => {
    const conversation = makeConversation({
      parseCommand: jest.fn().mockReturnValue({ command: 'pause' }),
    });
    const handler = build({ conversation });

    await handler.handle({ from: '628111', text: '/pause' });

    expect(conversation.setStatus).not.toHaveBeenCalled();
  });
});

describe('MessageHandlerService.handle — pause gate', () => {
  it('silently drops messages when the conversation is paused', async () => {
    const conversation = makeConversation({
      getState: jest.fn().mockResolvedValue({
        status: 'paused',
        lastIntent: null,
        pendingDates: null,
        customerName: null,
      }),
    });
    const parser = makeParser({ intent: 'greeting' });
    const whatsapp = makeWhatsapp();
    const handler = build({ conversation, parser, whatsapp });

    await handler.handle({ from: CUSTOMER, text: 'hi' });

    expect(parser.parse).not.toHaveBeenCalled();
    expect(whatsapp.sendMessage).not.toHaveBeenCalled();
  });

  it('silently drops messages when the conversation is in human mode', async () => {
    const conversation = makeConversation({
      getState: jest.fn().mockResolvedValue({
        status: 'human',
        lastIntent: null,
        pendingDates: null,
        customerName: null,
      }),
    });
    const whatsapp = makeWhatsapp();
    const handler = build({ conversation, whatsapp });

    await handler.handle({ from: CUSTOMER, text: 'hi' });

    expect(whatsapp.sendMessage).not.toHaveBeenCalled();
  });
});

describe('MessageHandlerService.handle — availability flow', () => {
  it('renders availability_yes_quote when dates are free and min nights met', async () => {
    const parser = makeParser({
      intent: 'availability_inquiry',
      checkIn: new Date('2026-06-15'),
      checkOut: new Date('2026-06-18'),
      guests: 2,
    });
    const templates = makeTemplates('booked');
    const handler = build({ parser, templates });

    await handler.handle({ from: CUSTOMER, text: 'is 15-18 jun free for 2?' });

    expect(templates.render).toHaveBeenCalledWith(
      'availability_yes_quote',
      expect.objectContaining({ nights: 3, total: 300, guests: 2 }),
    );
  });

  it('appends the September wine-harvest note when check-in falls in September', async () => {
    const parser = makeParser({
      intent: 'availability_inquiry',
      checkIn: new Date('2026-09-10'),
      checkOut: new Date('2026-09-15'),
      guests: 2,
    });
    const templates = makeTemplates('rendered');
    const handler = build({ parser, templates });

    await handler.handle({ from: CUSTOMER, text: '10-15 sep?' });

    const calls = (templates.render as jest.Mock).mock.calls.map(
      (c) => c[0] as string,
    );
    expect(calls).toContain('availability_yes_quote');
    expect(calls).toContain('september_wine_harvest_note');
  });

  it('renders minimum_stay_not_met when the quote falls below minNights', async () => {
    const parser = makeParser({
      intent: 'availability_inquiry',
      checkIn: new Date('2026-06-15'),
      checkOut: new Date('2026-06-17'),
      guests: 2,
    });
    const pricing = makePricing({
      nights: 2,
      nightlyBreakdown: [],
      subtotal: 200,
      total: 200,
      minNights: 7,
      meetsMinNights: false,
    });
    const templates = makeTemplates('too short');
    const handler = build({ parser, pricing, templates });

    await handler.handle({ from: CUSTOMER, text: '15-17 jun?' });

    expect(templates.render).toHaveBeenCalledWith(
      'minimum_stay_not_met',
      expect.objectContaining({ minNights: 7 }),
    );
  });

  it('renders availability_no_handoff when dates are taken', async () => {
    const parser = makeParser({
      intent: 'availability_inquiry',
      checkIn: new Date('2026-06-15'),
      checkOut: new Date('2026-06-18'),
      guests: 2,
    });
    const availability = makeAvailability(false);
    const templates = makeTemplates('taken');
    const handler = build({ parser, availability, templates });

    await handler.handle({ from: CUSTOMER, text: 'is 15-18 jun free?' });

    expect(templates.render).toHaveBeenCalledWith(
      'availability_no_handoff',
      expect.any(Object),
    );
  });

  it('asks for clarification when dates are missing', async () => {
    const parser = makeParser({ intent: 'availability_inquiry' });
    const templates = makeTemplates();
    const handler = build({ parser, templates });

    await handler.handle({ from: CUSTOMER, text: 'free this summer?' });

    expect(templates.render).toHaveBeenCalledWith(
      'dates_unclear_ask_clarify',
      expect.any(Object),
    );
  });

  it('merges pending_dates from conversation state when parser returns nulls', async () => {
    const parser = makeParser({
      intent: 'availability_inquiry',
      checkIn: null,
      checkOut: null,
      guests: null,
    });
    const availability = makeAvailability(true);
    const pricing = makePricing();
    const conversation = makeConversation({
      getState: jest.fn().mockResolvedValue({
        status: 'bot',
        lastIntent: 'availability_inquiry',
        pendingDates: {
          checkIn: '2026-06-15',
          checkOut: '2026-06-18',
          guests: 2,
        },
        customerName: null,
      }),
    });
    const handler = build({ parser, availability, pricing, conversation });

    await handler.handle({ from: CUSTOMER, text: 'yes that works' });

    expect(availability.isRangeAvailable).toHaveBeenCalledWith(
      expect.any(Date),
      expect.any(Date),
    );
    const [checkInArg] = (availability.isRangeAvailable as jest.Mock).mock
      .calls[0];
    expect((checkInArg as Date).toISOString()).toContain('2026-06-15');
  });
});

describe('MessageHandlerService.handle — other intents', () => {
  it('greeting without dates asks for them', async () => {
    const parser = makeParser({ intent: 'greeting' });
    const templates = makeTemplates();
    const handler = build({ parser, templates });

    await handler.handle({ from: CUSTOMER, text: 'hi' });

    expect(templates.render).toHaveBeenCalledWith(
      'greeting_ask_dates',
      expect.any(Object),
    );
  });

  it('pricing_inquiry without dates asks for them', async () => {
    const parser = makeParser({ intent: 'pricing_inquiry' });
    const templates = makeTemplates();
    const handler = build({ parser, templates });

    await handler.handle({ from: CUSTOMER, text: 'how much?' });

    expect(templates.render).toHaveBeenCalledWith(
      'pricing_needs_dates',
      expect.any(Object),
    );
  });

  it('booking_confirmation hands off and pauses', async () => {
    const parser = makeParser({ intent: 'booking_confirmation' });
    const templates = makeTemplates();
    const conversation = makeConversation();
    const whatsapp = makeWhatsapp();
    const handler = build({ parser, templates, conversation, whatsapp });

    await handler.handle({ from: CUSTOMER, text: "let's book" });

    expect(templates.render).toHaveBeenCalledWith(
      'booking_confirmed_handoff',
      expect.any(Object),
    );
    expect(conversation.setStatus).toHaveBeenCalledWith(CUSTOMER, 'paused', {
      pauseForMinutes: 60,
    });
    expect(whatsapp.sendMessage).toHaveBeenCalledWith(
      OWNER,
      expect.stringContaining(CUSTOMER),
      { override: true },
    );
  });

  it('human_request hands off via human_request_handoff', async () => {
    const parser = makeParser({ intent: 'human_request' });
    const templates = makeTemplates();
    const handler = build({ parser, templates });

    await handler.handle({ from: CUSTOMER, text: 'let me talk to someone' });

    expect(templates.render).toHaveBeenCalledWith(
      'human_request_handoff',
      expect.any(Object),
    );
  });

  it('complaint_or_frustration hands off via complaint_handoff', async () => {
    const parser = makeParser({ intent: 'complaint_or_frustration' });
    const templates = makeTemplates();
    const handler = build({ parser, templates });

    await handler.handle({ from: CUSTOMER, text: 'this is awful' });

    expect(templates.render).toHaveBeenCalledWith(
      'complaint_handoff',
      expect.any(Object),
    );
  });

  it('general_info hands off via faq_unknown_handoff', async () => {
    const parser = makeParser({ intent: 'general_info' });
    const templates = makeTemplates();
    const handler = build({ parser, templates });

    await handler.handle({
      from: CUSTOMER,
      text: 'do you have a hair dryer?',
    });

    expect(templates.render).toHaveBeenCalledWith(
      'faq_unknown_handoff',
      expect.any(Object),
    );
  });

  it('off_topic_or_unclear hands off via unclear_handoff', async () => {
    const parser = makeParser({ intent: 'off_topic_or_unclear' });
    const templates = makeTemplates();
    const handler = build({ parser, templates });

    await handler.handle({ from: CUSTOMER, text: 'glarg' });

    expect(templates.render).toHaveBeenCalledWith(
      'unclear_handoff',
      expect.any(Object),
    );
  });
});

describe('MessageHandlerService.handle — fail-safe paths', () => {
  it('falls back to unclear_handoff when a downstream service throws', async () => {
    const parser = makeParser({
      intent: 'availability_inquiry',
      checkIn: new Date('2026-06-15'),
      checkOut: new Date('2026-06-18'),
      guests: 2,
    });
    const availability = {
      isRangeAvailable: jest.fn().mockRejectedValue(new Error('ical down')),
    } as unknown as AvailabilityService;
    const conversation = makeConversation();
    const templates = makeTemplates();
    const whatsapp = makeWhatsapp();
    const logger = makeLogger();
    const handler = build({
      parser,
      availability,
      conversation,
      templates,
      whatsapp,
      logger,
    });

    await handler.handle({ from: CUSTOMER, text: 'is 15-18 jun free?' });

    expect(templates.render).toHaveBeenCalledWith(
      'unclear_handoff',
      expect.any(Object),
    );
    expect(conversation.setStatus).toHaveBeenCalledWith(CUSTOMER, 'paused', {
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

describe('MessageHandlerService.handle — context persistence', () => {
  it('updates lastIntent, customerName, and pendingDates on the conversation', async () => {
    const parser = makeParser({
      intent: 'availability_inquiry',
      customerName: 'Maria',
      checkIn: new Date('2026-06-15'),
      checkOut: new Date('2026-06-18'),
      guests: 2,
    });
    const conversation = makeConversation();
    const handler = build({ parser, conversation });

    await handler.handle({ from: CUSTOMER, text: "I'm Maria, 15-18 jun" });

    expect(conversation.updateContext).toHaveBeenCalledWith(
      CUSTOMER,
      expect.objectContaining({
        lastIntent: 'availability_inquiry',
        customerName: 'Maria',
        pendingDates: expect.objectContaining({
          checkIn: '2026-06-15',
          checkOut: '2026-06-18',
          guests: 2,
        }),
      }),
    );
  });
});
