import { ConfigService } from '@nestjs/config';
import { AvailabilityService } from '../availability/availability.service';
import { BookingRulesService, RulesValidation } from '../booking-rules/booking-rules.service';
import { ConversationService } from '../conversation/conversation.service';
import { FollowUpsService } from '../follow-ups/follow-ups.service';
import { HoldsService } from '../holds/holds.service';
import { KnowledgeBaseService } from '../knowledge-base/knowledge-base.service';
import { LoggerService } from '../logger/logger.service';
import { MessageLogService } from '../messagelog/messagelog.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ParseResult, ParserService } from '../parser/parser.service';
import { PricingService } from '../pricing/pricing.service';
import { ResponseService } from '../response/response.service';
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
  kbTopic: null,
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
    weeks: 1,
    nights: 7,
    weeklyRate: 2100,
    subtotal: 2100,
    total: 2100,
    minWeeks: 0,
    meetsMinWeeks: true,
  },
): PricingService =>
  ({
    calculate: jest.fn().mockResolvedValue(quote),
  }) as unknown as PricingService;

const makeResponse = (text = 'rendered'): ResponseService =>
  ({
    render: jest.fn().mockResolvedValue(text),
  }) as unknown as ResponseService;

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

const makeConfig = (
  overrides: { owner?: string; instantBook?: boolean } = {},
): ConfigService => {
  const owner = 'owner' in overrides ? overrides.owner : OWNER;
  const instantBook = overrides.instantBook ? 'true' : 'false';
  const values: Record<string, string | undefined> = {
    OWNER_PHONE: owner,
    INSTANT_BOOK_ENABLED: instantBook,
  };
  return {
    get: (key: string) => values[key],
  } as unknown as ConfigService;
};

const makeNotifications = (): NotificationsService =>
  ({
    notifyOwner: jest.fn().mockResolvedValue(undefined),
    notifyOwnerAboutConversation: jest.fn().mockResolvedValue(undefined),
  }) as unknown as NotificationsService;

const makeKnowledgeBase = (
  overrides: Partial<KnowledgeBaseService> = {},
): KnowledgeBaseService =>
  ({
    listTopics: jest.fn().mockResolvedValue([]),
    render: jest.fn().mockResolvedValue(null),
    ...overrides,
  }) as unknown as KnowledgeBaseService;

const makeBookingRules = (
  result: RulesValidation = { pass: true },
): BookingRulesService =>
  ({
    validate: jest.fn().mockReturnValue(result),
  }) as unknown as BookingRulesService;

const makeHolds = (hasOverlap = false): HoldsService =>
  ({
    hasOverlap: jest.fn().mockResolvedValue(hasOverlap),
    createHold: jest.fn().mockResolvedValue({ id: 'rec1', fields: {} }),
  }) as unknown as HoldsService;

const makeFollowUps = (): FollowUpsService =>
  ({
    schedule: jest.fn().mockResolvedValue({ id: 'fu1', fields: {} }),
    cancel: jest.fn().mockResolvedValue(undefined),
  }) as unknown as FollowUpsService;

const build = (
  over: {
    parser?: ParserService;
    availability?: AvailabilityService;
    pricing?: PricingService;
    bookingRules?: BookingRulesService;
    holds?: HoldsService;
    followUps?: FollowUpsService;
    response?: ResponseService;
    whatsapp?: WhatsappService;
    conversation?: ConversationService;
    messageLog?: MessageLogService;
    knowledgeBase?: KnowledgeBaseService;
    notifications?: NotificationsService;
    logger?: LoggerService;
    config?: ConfigService;
  } = {},
) =>
  new MessageHandlerService(
    over.parser ?? makeParser(),
    over.availability ?? makeAvailability(),
    over.pricing ?? makePricing(),
    over.bookingRules ?? makeBookingRules(),
    over.holds ?? makeHolds(),
    over.followUps ?? makeFollowUps(),
    over.response ?? makeResponse(),
    over.whatsapp ?? makeWhatsapp(),
    over.conversation ?? makeConversation(),
    over.messageLog ?? makeMessageLog(),
    over.knowledgeBase ?? makeKnowledgeBase(),
    over.notifications ?? makeNotifications(),
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
    const response = makeResponse('hi, what dates?');
    const messageLog = makeMessageLog();
    const handler = build({ parser, response, messageLog });

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
    const notifications = makeNotifications();
    const handler = build({ conversation, notifications });

    await handler.handle({ from: OWNER, text: '/pause 30' });

    expect(conversation.setStatus).toHaveBeenCalledWith(OWNER, 'paused', {
      pauseForMinutes: 30,
    });
    expect(notifications.notifyOwner).toHaveBeenCalledWith(
      expect.stringContaining('paused'),
      expect.objectContaining({ reason: 'owner_command' }),
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
    const notifications = makeNotifications();
    const handler = build({ conversation, notifications });

    await handler.handle({ from: OWNER, text: `/pause ${CUSTOMER} 1440` });

    expect(conversation.setStatus).toHaveBeenCalledWith(CUSTOMER, 'paused', {
      pauseForMinutes: 1440,
    });
    expect(notifications.notifyOwner).toHaveBeenCalledWith(
      expect.stringContaining(CUSTOMER),
      expect.objectContaining({ reason: 'owner_command' }),
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
    const notifications = makeNotifications();
    const handler = build({ conversation, notifications });

    await handler.handle({ from: OWNER, text: `/status ${CUSTOMER}` });

    expect(notifications.notifyOwner).toHaveBeenCalledWith(
      expect.stringContaining('paused'),
      expect.objectContaining({ reason: 'owner_command' }),
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
    const response = makeResponse('booked');
    const handler = build({ parser, response });

    await handler.handle({ from: CUSTOMER, text: 'is Jul 6-13 free?' });

    expect(response.render).toHaveBeenCalledWith(
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
    const response = makeResponse('rendered');
    const handler = build({ parser, response });

    await handler.handle({ from: CUSTOMER, text: '7-14 sep?' });

    const calls = (response.render as jest.Mock).mock.calls.map(
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
    const response = makeResponse('taken');
    const handler = build({ parser, availability, response });

    await handler.handle({ from: CUSTOMER, text: 'is Jul 6-13 free?' });

    expect(response.render).toHaveBeenCalledWith(
      'availability_no_handoff',
      expect.objectContaining({ check_in: expect.any(String), check_out: expect.any(String), month: expect.any(String) }),
    );
  });

  it('asks for clarification when dates are missing', async () => {
    const parser = makeParser({ intent: 'availability_inquiry' });
    const response = makeResponse();
    const handler = build({ parser, response });

    await handler.handle({ from: CUSTOMER, text: 'free this summer?' });

    expect(response.render).toHaveBeenCalledWith(
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
    const response = makeResponse();
    const handler = build({ parser, bookingRules, response });

    await handler.handle({ from: CUSTOMER, text: 'available in 2026?' });

    expect(response.render).toHaveBeenCalledWith(
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
    const response = makeResponse();
    const handler = build({ parser, bookingRules, response });

    await handler.handle({ from: CUSTOMER, text: 'Jul 7-13?' });

    expect(response.render).toHaveBeenCalledWith(
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
    const response = makeResponse();
    const handler = build({ parser, bookingRules, response });

    await handler.handle({ from: CUSTOMER, text: 'just one night?' });

    expect(response.render).toHaveBeenCalledWith(
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
    const response = makeResponse();
    const conversation = makeConversation();
    const handler = build({ parser, bookingRules, response, conversation });

    await handler.handle({ from: CUSTOMER, text: 'can I rent for November?' });

    expect(response.render).toHaveBeenCalledWith(
      'long_stay_manual_pricing',
      expect.any(Object),
    );
    expect(conversation.setStatus).not.toHaveBeenCalledWith(
      CUSTOMER,
      'paused',
      expect.any(Object),
    );
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
    const response = makeResponse();
    const conversation = makeConversation();
    const notifications = makeNotifications();
    const handler = build({ parser, response, conversation, notifications });

    await handler.handle({ from: CUSTOMER, text: 'can I get a better rate?' });

    expect(response.render).toHaveBeenCalledWith(
      'discount_request',
      expect.any(Object),
    );
    expect(conversation.setStatus).not.toHaveBeenCalledWith(
      CUSTOMER,
      'paused',
      expect.any(Object),
    );
    expect(notifications.notifyOwnerAboutConversation).toHaveBeenCalledWith(
      CUSTOMER,
      'discount_request',
      expect.any(Object),
    );
  });

  it('does not intercept normal pricing inquiry without discount flag', async () => {
    const parser = makeParser({
      intent: 'pricing_inquiry',
      mentionsDiscount: false,
      checkIn: SUN_CHECK_IN,
      checkOut: SUN_CHECK_OUT,
    });
    const response = makeResponse();
    const handler = build({ parser, response });

    await handler.handle({ from: CUSTOMER, text: 'how much for Jul?' });

    const calledKeys = (response.render as jest.Mock).mock.calls.map(
      (c) => c[0],
    );
    expect(calledKeys).not.toContain('discount_request');
  });
});

describe('MessageHandlerService.handle — other intents', () => {
  it('greeting without dates asks for them', async () => {
    const parser = makeParser({ intent: 'greeting' });
    const response = makeResponse();
    const handler = build({ parser, response });

    await handler.handle({ from: CUSTOMER, text: 'hi' });

    expect(response.render).toHaveBeenCalledWith(
      'greeting_ask_dates',
      expect.any(Object),
    );
  });

  it('pricing_inquiry without dates asks for clarification', async () => {
    const parser = makeParser({ intent: 'pricing_inquiry' });
    const response = makeResponse();
    const handler = build({ parser, response });

    await handler.handle({ from: CUSTOMER, text: 'how much?' });

    expect(response.render).toHaveBeenCalledWith(
      'dates_unclear_ask_clarify',
      expect.any(Object),
    );
  });

  it('booking_confirmation with INSTANT_BOOK_ENABLED=true sends instant-book template', async () => {
    const parser = makeParser({ intent: 'booking_confirmation' });
    const response = makeResponse();
    const conversation = makeConversation();
    const notifications = makeNotifications();
    const config = makeConfig({ instantBook: true });
    const handler = build({
      parser,
      response,
      conversation,
      notifications,
      config,
    });

    await handler.handle({ from: CUSTOMER, text: "let's book" });

    expect(response.render).toHaveBeenCalledWith(
      'booking_confirmed_instant_book',
      expect.any(Object),
    );
    expect(response.render).not.toHaveBeenCalledWith(
      'booking_confirmed_handoff',
      expect.any(Object),
    );
    expect(notifications.notifyOwnerAboutConversation).toHaveBeenCalledWith(
      CUSTOMER,
      'booking_confirmation',
      expect.any(Object),
    );
  });

  it('booking_confirmation notifies Jim and keeps the bot active', async () => {
    const parser = makeParser({ intent: 'booking_confirmation' });
    const response = makeResponse();
    const conversation = makeConversation();
    const notifications = makeNotifications();
    const handler = build({ parser, response, conversation, notifications });

    await handler.handle({ from: CUSTOMER, text: "let's book" });

    expect(response.render).toHaveBeenCalledWith(
      'booking_confirmed_handoff',
      expect.any(Object),
    );
    expect(conversation.setStatus).not.toHaveBeenCalledWith(
      CUSTOMER,
      'paused',
      expect.any(Object),
    );
    expect(notifications.notifyOwnerAboutConversation).toHaveBeenCalledWith(
      CUSTOMER,
      'booking_confirmation',
      expect.any(Object),
    );
  });

  it('human_request hands off via human_request_handoff and pauses the bot', async () => {
    const parser = makeParser({ intent: 'human_request' });
    const response = makeResponse();
    const conversation = makeConversation();
    const handler = build({ parser, response, conversation });

    await handler.handle({ from: CUSTOMER, text: 'let me talk to someone' });

    expect(response.render).toHaveBeenCalledWith(
      'human_request_handoff',
      expect.any(Object),
    );
    expect(conversation.setStatus).toHaveBeenCalledWith(CUSTOMER, 'paused', {
      pauseForMinutes: 60,
    });
  });

  it('complaint_or_frustration hands off via complaint_handoff and pauses the bot', async () => {
    const parser = makeParser({ intent: 'complaint_or_frustration' });
    const response = makeResponse();
    const conversation = makeConversation();
    const handler = build({ parser, response, conversation });

    await handler.handle({ from: CUSTOMER, text: 'this is awful' });

    expect(response.render).toHaveBeenCalledWith(
      'complaint_handoff',
      expect.any(Object),
    );
    expect(conversation.setStatus).toHaveBeenCalledWith(CUSTOMER, 'paused', {
      pauseForMinutes: 60,
    });
  });

  it('general_info hands off via faq_unknown_handoff', async () => {
    const parser = makeParser({ intent: 'general_info' });
    const response = makeResponse();
    const handler = build({ parser, response });

    await handler.handle({
      from: CUSTOMER,
      text: 'do you have a hair dryer?',
    });

    expect(response.render).toHaveBeenCalledWith(
      'faq_unknown_handoff',
      expect.any(Object),
    );
  });

  it('acknowledgment replies with acknowledgment_reply when previous intent was different', async () => {
    const parser = makeParser({ intent: 'acknowledgment' });
    const response = makeResponse();
    const whatsapp = makeWhatsapp();
    const conversation = makeConversation({
      getState: jest.fn().mockResolvedValue({
        status: 'bot',
        lastIntent: 'availability_inquiry',
        pendingDates: null,
        customerName: null,
      }),
    });
    const handler = build({ parser, response, whatsapp, conversation });

    await handler.handle({ from: CUSTOMER, text: 'thanks' });

    expect(response.render).toHaveBeenCalledWith(
      'acknowledgment_reply',
      expect.any(Object),
    );
    expect(whatsapp.sendMessage).toHaveBeenCalled();
  });

  it('acknowledgment is silently dropped when previous intent was also acknowledgment', async () => {
    const parser = makeParser({ intent: 'acknowledgment' });
    const response = makeResponse();
    const whatsapp = makeWhatsapp();
    const conversation = makeConversation({
      getState: jest.fn().mockResolvedValue({
        status: 'bot',
        lastIntent: 'acknowledgment',
        pendingDates: null,
        customerName: null,
      }),
    });
    const handler = build({ parser, response, whatsapp, conversation });

    await handler.handle({ from: CUSTOMER, text: 'thanks again' });

    expect(response.render).not.toHaveBeenCalled();
    expect(whatsapp.sendMessage).not.toHaveBeenCalled();
  });

  it('off_topic_or_unclear hands off via unclear_handoff', async () => {
    const parser = makeParser({ intent: 'off_topic_or_unclear' });
    const response = makeResponse();
    const handler = build({ parser, response });

    await handler.handle({ from: CUSTOMER, text: 'glarg' });

    expect(response.render).toHaveBeenCalledWith(
      'unclear_handoff',
      expect.any(Object),
    );
  });
});

describe('MessageHandlerService.handle — follow-up sequence wiring', () => {
  it('schedules a follow-up after sending availability_yes_quote', async () => {
    const parser = makeParser({
      intent: 'availability_inquiry',
      checkIn: SUN_CHECK_IN,
      checkOut: SUN_CHECK_OUT,
    });
    const followUps = makeFollowUps();
    const handler = build({ parser, followUps });

    await handler.handle({ from: CUSTOMER, text: 'is Jul 6-13 free?' });

    expect(followUps.schedule).toHaveBeenCalledWith(CUSTOMER);
  });

  it('does not schedule a follow-up when dates are unavailable', async () => {
    const parser = makeParser({
      intent: 'availability_inquiry',
      checkIn: SUN_CHECK_IN,
      checkOut: SUN_CHECK_OUT,
    });
    const availability = makeAvailability(false);
    const followUps = makeFollowUps();
    const handler = build({ parser, availability, followUps });

    await handler.handle({ from: CUSTOMER, text: 'is Jul 6-13 free?' });

    expect(followUps.schedule).not.toHaveBeenCalled();
  });

  it('cancels open follow-up sequences on every inbound customer message', async () => {
    const followUps = makeFollowUps();
    const handler = build({ followUps });

    await handler.handle({ from: CUSTOMER, text: 'hi' });

    expect(followUps.cancel).toHaveBeenCalledWith(CUSTOMER);
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
    const response = makeResponse();
    const notifications = makeNotifications();
    const logger = makeLogger();
    const handler = build({
      parser,
      availability,
      conversation,
      response,
      notifications,
      logger,
    });

    await handler.handle({ from: CUSTOMER, text: 'is Jul 6-13 free?' });

    expect(response.render).toHaveBeenCalledWith(
      'unclear_handoff',
      expect.any(Object),
    );
    expect(conversation.setStatus).not.toHaveBeenCalledWith(
      CUSTOMER,
      'paused',
      expect.any(Object),
    );
    expect(notifications.notifyOwnerAboutConversation).toHaveBeenCalledWith(
      CUSTOMER,
      'orchestrator_error',
      expect.objectContaining({
        extra: expect.objectContaining({ error: 'ical down' }),
      }),
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

describe('MessageHandlerService.handle — hold flows', () => {
  it('sends hold_offer_post_quote when availability ok and highIntentSignal is true', async () => {
    const parser = makeParser({
      intent: 'availability_inquiry',
      checkIn: SUN_CHECK_IN,
      checkOut: SUN_CHECK_OUT,
      highIntentSignal: true,
    });
    const response = makeResponse('rendered');
    const handler = build({ parser, response });

    await handler.handle({ from: CUSTOMER, text: 'those dates look great, can I book?' });

    const calls = (response.render as jest.Mock).mock.calls.map((c) => c[0]);
    expect(calls).toContain('hold_offer_post_quote');
  });

  it('does not send hold_offer_post_quote when highIntentSignal is false', async () => {
    const parser = makeParser({
      intent: 'availability_inquiry',
      checkIn: SUN_CHECK_IN,
      checkOut: SUN_CHECK_OUT,
      highIntentSignal: false,
    });
    const response = makeResponse('rendered');
    const handler = build({ parser, response });

    await handler.handle({ from: CUSTOMER, text: 'are those dates free?' });

    const calls = (response.render as jest.Mock).mock.calls.map((c) => c[0]);
    expect(calls).not.toContain('hold_offer_post_quote');
  });

  it('treats held dates as unavailable (sends availability_no_handoff)', async () => {
    const parser = makeParser({
      intent: 'availability_inquiry',
      checkIn: SUN_CHECK_IN,
      checkOut: SUN_CHECK_OUT,
    });
    const holds = makeHolds(true); // overlap
    const availability = makeAvailability(true);
    const response = makeResponse('rendered');
    const handler = build({ parser, holds, availability, response });

    await handler.handle({ from: CUSTOMER, text: 'are those dates free?' });

    const calls = (response.render as jest.Mock).mock.calls.map((c) => c[0]);
    expect(calls).toContain('availability_no_handoff');
    expect(availability.isRangeAvailable).not.toHaveBeenCalled();
  });

  it('creates a hold and sends hold_confirmed on hold_request intent', async () => {
    const parser = makeParser({
      intent: 'hold_request',
      checkIn: SUN_CHECK_IN,
      checkOut: SUN_CHECK_OUT,
    });
    const holds = makeHolds(false);
    const response = makeResponse('confirmed');
    const handler = build({ parser, holds, response });

    await handler.handle({ from: CUSTOMER, text: 'please hold those dates' });

    expect(holds.createHold).toHaveBeenCalledWith(CUSTOMER, SUN_CHECK_IN, SUN_CHECK_OUT);
    const calls = (response.render as jest.Mock).mock.calls.map((c) => c[0]);
    expect(calls).toContain('hold_confirmed');
  });

  it('asks for dates on hold_request when no dates provided', async () => {
    const parser = makeParser({ intent: 'hold_request' });
    const response = makeResponse('rendered');
    const holds = makeHolds(false);
    const handler = build({ parser, holds, response });

    await handler.handle({ from: CUSTOMER, text: 'can you hold dates for me?' });

    const calls = (response.render as jest.Mock).mock.calls.map((c) => c[0]);
    expect(calls).toContain('dates_unclear_ask_clarify');
    expect(holds.createHold).not.toHaveBeenCalled();
  });

  it('sends availability_no_handoff on hold_request when dates are already held', async () => {
    const parser = makeParser({
      intent: 'hold_request',
      checkIn: SUN_CHECK_IN,
      checkOut: SUN_CHECK_OUT,
    });
    const holds = makeHolds(true);
    const response = makeResponse('rendered');
    const handler = build({ parser, holds, response });

    await handler.handle({ from: CUSTOMER, text: 'please hold those dates' });

    const calls = (response.render as jest.Mock).mock.calls.map((c) => c[0]);
    expect(calls).toContain('availability_no_handoff');
    expect(holds.createHold).not.toHaveBeenCalled();
  });
});
