import { ConfigService } from '@nestjs/config';
import { AvailabilityService } from '../availability/availability.service';
import { BookingRulesService, RulesValidation } from '../booking-rules/booking-rules.service';
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
  mentionsDiscount: false,
  highIntentSignal: false,
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
    nights: 7,
    nightlyBreakdown: [],
    subtotal: 2100,
    total: 2100,
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

const makeBookingRules = (
  result: RulesValidation = { pass: true },
): BookingRulesService =>
  ({
    validate: jest.fn().mockReturnValue(result),
  }) as unknown as BookingRulesService;

const build = (
  over: {
    parser?: ParserService;
    availability?: AvailabilityService;
    pricing?: PricingService;
    bookingRules?: BookingRulesService;
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
    over.bookingRules ?? makeBookingRules(),
    over.templates ?? makeTemplates(),
    over.whatsapp ?? makeWhatsapp(),
    over.conversation ?? makeConversation(),
    over.messageLog ?? makeMessageLog(),
    over.logger ?? makeLogger(),
    over.config ?? makeConfig(),
  );

// Sunday dates to satisfy booking rules in tests that reach availability/pricing
const SUN_CHECK_IN = new Date('2025-07-06');
const SUN_CHECK_OUT = new Date('2025-07-13');

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
  it('renders availability_yes_quote when dates are free', async () => {
    const parser = makeParser({
      intent: 'availability_inquiry',
      checkIn: SUN_CHECK_IN,
      checkOut: SUN_CHECK_OUT,
    });
    const templates = makeTemplates('booked');
    const handler = build({ parser, templates });

    await handler.handle({ from: CUSTOMER, text: 'is Jul 6-13 free?' });

    expect(templates.render).toHaveBeenCalledWith(
      'availability_yes_quote',
      expect.objectContaining({ nights: 7, price: '€2,100' }),
    );
  });

  it('appends the September wine-harvest note when check-in falls in September', async () => {
    const parser = makeParser({
      intent: 'availability_inquiry',
      checkIn: new Date('2025-09-07'),
      checkOut: new Date('2025-09-14'),
    });
    const templates = makeTemplates('rendered');
    const handler = build({ parser, templates });

    await handler.handle({ from: CUSTOMER, text: '7-14 sep?' });

    const calls = (templates.render as jest.Mock).mock.calls.map(
      (c) => c[0] as string,
    );
    expect(calls).toContain('availability_yes_quote');
    expect(calls).toContain('september_wine_harvest_note');
  });

  it('renders availability_no_handoff when dates are taken', async () => {
    const parser = makeParser({
      intent: 'availability_inquiry',
      checkIn: SUN_CHECK_IN,
      checkOut: SUN_CHECK_OUT,
    });
    const availability = makeAvailability(false);
    const templates = makeTemplates('taken');
    const handler = build({ parser, availability, templates });

    await handler.handle({ from: CUSTOMER, text: 'is Jul 6-13 free?' });

    expect(templates.render).toHaveBeenCalledWith(
      'availability_no_handoff',
      expect.objectContaining({ check_in: expect.any(String), check_out: expect.any(String), month: expect.any(String) }),
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
          checkIn: '2025-07-06',
          checkOut: '2025-07-13',
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
    expect((checkInArg as Date).toISOString()).toContain('2025-07-06');
  });
});

describe('MessageHandlerService.handle — booking rules', () => {
  it('renders year_2026_redirect when booking rules block with that reason', async () => {
    const parser = makeParser({
      intent: 'availability_inquiry',
      checkIn: SUN_CHECK_IN,
      checkOut: SUN_CHECK_OUT,
    });
    const bookingRules = makeBookingRules({
      pass: false,
      reason: 'year_2026_redirect',
    });
    const templates = makeTemplates();
    const handler = build({ parser, bookingRules, templates });

    await handler.handle({ from: CUSTOMER, text: 'available in 2026?' });

    expect(templates.render).toHaveBeenCalledWith(
      'year_2026_redirect',
      expect.any(Object),
    );
  });

  it('renders dates_not_sunday_to_sunday with suggested dates when check-in is not a Sunday', async () => {
    const parser = makeParser({
      intent: 'availability_inquiry',
      checkIn: new Date('2025-07-07'), // Monday
      checkOut: new Date('2025-07-13'),
    });
    const bookingRules = makeBookingRules({
      pass: false,
      reason: 'not_sunday',
      suggestedCheckIn: '2025-07-13',
      suggestedCheckOut: '2025-07-20',
    });
    const templates = makeTemplates();
    const handler = build({ parser, bookingRules, templates });

    await handler.handle({ from: CUSTOMER, text: 'Jul 7-13?' });

    expect(templates.render).toHaveBeenCalledWith(
      'dates_not_sunday_to_sunday',
      expect.objectContaining({
        suggested_check_in: expect.any(String),
        suggested_check_out: expect.any(String),
      }),
    );
  });

  it('renders minimum_stay_not_met with suggested dates when stay is too short', async () => {
    const parser = makeParser({
      intent: 'availability_inquiry',
      checkIn: SUN_CHECK_IN,
      checkOut: SUN_CHECK_IN, // same day
    });
    const bookingRules = makeBookingRules({
      pass: false,
      reason: 'min_stay',
      suggestedCheckIn: '2025-07-06',
      suggestedCheckOut: '2025-07-13',
    });
    const templates = makeTemplates();
    const handler = build({ parser, bookingRules, templates });

    await handler.handle({ from: CUSTOMER, text: 'just one night?' });

    expect(templates.render).toHaveBeenCalledWith(
      'minimum_stay_not_met',
      expect.objectContaining({
        suggested_check_in: expect.any(String),
        suggested_check_out: expect.any(String),
      }),
    );
  });

  it('hands off via long_stay_manual_pricing and pauses when Oct-May long stay detected', async () => {
    const parser = makeParser({
      intent: 'availability_inquiry',
      checkIn: new Date('2025-11-02'),
      checkOut: new Date('2025-11-30'),
    });
    const bookingRules = makeBookingRules({
      pass: false,
      reason: 'long_stay_manual',
    });
    const templates = makeTemplates();
    const conversation = makeConversation();
    const handler = build({ parser, bookingRules, templates, conversation });

    await handler.handle({ from: CUSTOMER, text: 'can I rent for November?' });

    expect(templates.render).toHaveBeenCalledWith(
      'long_stay_manual_pricing',
      expect.any(Object),
    );
    expect(conversation.setStatus).toHaveBeenCalledWith(CUSTOMER, 'paused', {
      pauseForMinutes: 60,
    });
  });
});

describe('MessageHandlerService.handle — discount detection', () => {
  it('intercepts discount requests before normal routing and hands off to Jim', async () => {
    const parser = makeParser({
      intent: 'pricing_inquiry',
      mentionsDiscount: true,
      checkIn: SUN_CHECK_IN,
      checkOut: SUN_CHECK_OUT,
    });
    const templates = makeTemplates();
    const conversation = makeConversation();
    const whatsapp = makeWhatsapp();
    const handler = build({ parser, templates, conversation, whatsapp });

    await handler.handle({ from: CUSTOMER, text: 'can I get a better rate?' });

    expect(templates.render).toHaveBeenCalledWith(
      'discount_request',
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
  });

  it('does not intercept normal pricing inquiry without discount flag', async () => {
    const parser = makeParser({
      intent: 'pricing_inquiry',
      mentionsDiscount: false,
      checkIn: SUN_CHECK_IN,
      checkOut: SUN_CHECK_OUT,
    });
    const templates = makeTemplates();
    const handler = build({ parser, templates });

    await handler.handle({ from: CUSTOMER, text: 'how much for Jul?' });

    const calledKeys = (templates.render as jest.Mock).mock.calls.map(
      (c) => c[0],
    );
    expect(calledKeys).not.toContain('discount_request');
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

  it('pricing_inquiry without dates asks for clarification', async () => {
    const parser = makeParser({ intent: 'pricing_inquiry' });
    const templates = makeTemplates();
    const handler = build({ parser, templates });

    await handler.handle({ from: CUSTOMER, text: 'how much?' });

    expect(templates.render).toHaveBeenCalledWith(
      'dates_unclear_ask_clarify',
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
      checkIn: SUN_CHECK_IN,
      checkOut: SUN_CHECK_OUT,
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

    await handler.handle({ from: CUSTOMER, text: 'is Jul 6-13 free?' });

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
      checkIn: SUN_CHECK_IN,
      checkOut: SUN_CHECK_OUT,
      guests: 2,
    });
    const conversation = makeConversation();
    const handler = build({ parser, conversation });

    await handler.handle({ from: CUSTOMER, text: "I'm Maria, Jul 6-13" });

    expect(conversation.updateContext).toHaveBeenCalledWith(
      CUSTOMER,
      expect.objectContaining({
        lastIntent: 'availability_inquiry',
        customerName: 'Maria',
        pendingDates: expect.objectContaining({
          checkIn: '2025-07-06',
          checkOut: '2025-07-13',
          guests: 2,
        }),
      }),
    );
  });
});
