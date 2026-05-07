import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AvailabilityService } from '../availability/availability.service';
import { BookingRulesService } from '../booking-rules/booking-rules.service';
import {
  ComposerService,
  CompositionFact,
  CompositionPackage,
} from '../composer/composer.service';
import {
  ConversationService,
  ParsedCommand,
  PendingDates,
} from '../conversation/conversation.service';
import { FollowUpsService } from '../follow-ups/follow-ups.service';
import { Fragment, FragmentsService } from '../fragments/fragments.service';
import { HelpersService } from '../helpers/helpers.service';
import { HoldsService } from '../holds/holds.service';
import { KnowledgeBaseService } from '../knowledge-base/knowledge-base.service';
import { LoggerService } from '../logger/logger.service';
import { MessageLogService } from '../messagelog/messagelog.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  HistoryMessage,
  Intent,
  ParseResult,
  ParserService,
} from '../parser/parser.service';
import { PricingService } from '../pricing/pricing.service';
import { TemplatesService, TemplateVars } from '../templates/templates.service';
import { WhatsappService } from '../whatsapp/whatsapp.service';

const PAUSE_ON_HANDOFF_MIN = 60;
const HISTORY_LIMIT = 10;
const SEPTEMBER = 8;
const DAY_MS = 24 * 60 * 60 * 1000;
const WEBSITE_URL = 'www.bontemaison.com';
const SCENARIOS_WITH_WEBSITE = new Set(['greeting', 'general_info']);

type IncomingMessage = { from: string; text: string; profileName?: string };

type MergedIntent = {
  checkIn: Date | null;
  checkOut: Date | null;
  guests: number | null;
  customerName: string | null;
};

@Injectable()
export class MessageHandlerService {
  private readonly ownerPhone: string | undefined;
  private readonly instantBookEnabled: boolean;

  constructor(
    private readonly parser: ParserService,
    private readonly availability: AvailabilityService,
    private readonly pricing: PricingService,
    private readonly bookingRules: BookingRulesService,
    private readonly holds: HoldsService,
    private readonly followUps: FollowUpsService,
    private readonly templates: TemplatesService,
    private readonly composer: ComposerService,
    private readonly fragments: FragmentsService,
    private readonly knowledgeBase: KnowledgeBaseService,
    private readonly helpers: HelpersService,
    private readonly whatsapp: WhatsappService,
    private readonly conversation: ConversationService,
    private readonly messageLog: MessageLogService,
    private readonly notifications: NotificationsService,
    private readonly logger: LoggerService,
    config: ConfigService,
  ) {
    this.ownerPhone = config.get<string>('OWNER_PHONE');
    this.instantBookEnabled =
      config.get<string>('INSTANT_BOOK_ENABLED') === 'true';
  }

  async handle(msg: IncomingMessage): Promise<void> {
    await this.messageLog.log(msg.from, 'in', msg.text);

    const cmd = this.conversation.parseCommand(msg.text);
    if (cmd) {
      if (msg.from !== this.ownerPhone) {
        this.logger.warn('conversation', 'ignoring command from non-owner', {
          from: msg.from,
        });
        return;
      }
      await this.runOwnerCommand(cmd);
      return;
    }

    try {
      await this.followUps.cancel(msg.from);
    } catch (err) {
      this.logger.warn('follow-ups', 'cancel on inbound failed', {
        from: msg.from,
        error: (err as Error).message,
      });
    }

    const state = await this.conversation.getState(msg.from);
    if (state.status !== 'bot') {
      this.logger.info('conversation', 'silent drop: not in bot mode', {
        from: msg.from,
        status: state.status,
      });
      return;
    }

    const storedName = state.customerName ?? msg.profileName ?? null;
    const previousIntent = state.lastIntent;

    try {
      const history = await this.messageLog.recent(msg.from, HISTORY_LIMIT);
      const kbTopics = await this.fetchTopicHintsSafe();
      const parsed = await this.parser.parse(msg.text, history, kbTopics);
      const merged = this.mergeWithPending(
        {
          checkIn: parsed.checkIn,
          checkOut: parsed.checkOut,
          guests: parsed.guests,
          customerName: parsed.customerName,
        },
        state.pendingDates,
        storedName,
      );

      await this.conversation.updateContext(msg.from, {
        lastIntent: parsed.intent,
        customerName: merged.customerName ?? undefined,
        pendingDates: this.serializePending(merged),
      });

      if (parsed.guestEmail) {
        try {
          await this.conversation.recordEmail(msg.from, parsed.guestEmail);
        } catch (err) {
          this.logger.warn('conversation', 'recordEmail failed', {
            from: msg.from,
            error: (err as Error).message,
          });
        }
      }

      if (parsed.mentionsDiscount) {
        await this.handoffTemplate(msg.from, msg.text, 'discount_request', {
          name: merged.customerName ?? '',
        });
        return;
      }

      await this.route(msg.from, parsed, merged, history, previousIntent);
    } catch (err) {
      const error = (err as Error).message;
      this.logger.error('conversation', 'message handling failed', {
        from: msg.from,
        error,
      });
      await this.handoffTemplate(
        msg.from,
        msg.text,
        'unclear_handoff',
        { name: storedName ?? '' },
        { reason: 'orchestrator_error', extra: { error } },
      );
    }
  }

  private async route(
    from: string,
    parsed: ParseResult,
    merged: MergedIntent,
    history: HistoryMessage[],
    previousIntent: string | null,
  ): Promise<void> {
    const name = merged.customerName ?? '';
    const intent =
      parsed.guestEmail && previousIntent === 'booking_confirmation'
        ? 'booking_confirmation'
        : parsed.intent;

    switch (intent) {
      case 'greeting':
        if (merged.checkIn && merged.checkOut) {
          await this.handleAvailability(from, merged);
          return;
        }
        await this.composeOrFallback(from, parsed, merged, history, {
          scenario: 'greeting',
          fallbackKey: 'greeting_ask_dates',
        });
        return;

      case 'availability_inquiry':
      case 'pricing_inquiry':
        if (parsed.monthQuery || parsed.monthRangeQuery) {
          await this.handleMonthQuery(from, parsed, merged, history);
          return;
        }
        if (!merged.checkIn || !merged.checkOut) {
          await this.composeOrFallback(from, parsed, merged, history, {
            scenario: 'dates_unclear',
            fallbackKey: 'dates_unclear_ask_clarify',
          });
          return;
        }
        await this.handleAvailability(from, merged);
        return;

      case 'general_info':
        await this.handleGeneralInfo(from, parsed, merged, history);
        return;

      case 'booking_confirmation': {
        const templateKey = this.instantBookEnabled
          ? 'booking_confirmed_instant_book'
          : parsed.guestEmail
            ? 'booking_email_received_handoff'
            : 'booking_confirmed_handoff';
        const vars: TemplateVars = parsed.guestEmail
          ? { name, email: parsed.guestEmail }
          : { name };
        await this.handoffTemplate(from, '', templateKey, vars);
        try {
          await this.conversation.setLifecycleStatus(from, 'Booked');
        } catch (err) {
          this.logger.warn('conversation', 'set Booked failed', {
            from,
            error: (err as Error).message,
          });
        }
        return;
      }

      case 'hold_request':
        await this.handleHoldRequest(from, merged);
        return;

      case 'human_request':
        await this.handoffTemplate(
          from,
          '',
          'human_request_handoff',
          { name },
          undefined,
          { pause: true },
        );
        return;

      case 'acknowledgment':
        if (previousIntent === 'acknowledgment') {
          this.logger.info('conversation', 'silent drop: repeat acknowledgment', {
            from,
          });
          return;
        }
        await this.composeOrFallback(from, parsed, merged, history, {
          scenario: 'acknowledgment',
          fallbackKey: 'acknowledgment_reply',
        });
        return;

      case 'polite_close':
        await this.composeOrFallback(from, parsed, merged, history, {
          scenario: 'polite_close',
          fallbackKey: 'acknowledgment_reply',
        });
        return;

      case 'correction':
        await this.composeOrFallback(from, parsed, merged, history, {
          scenario: 'correction',
          fallbackKey: 'unclear_handoff',
        });
        return;

      case 'complaint_or_frustration':
        await this.handoffTemplate(
          from,
          '',
          'complaint_handoff',
          { name },
          undefined,
          { pause: true },
        );
        return;

      case 'off_topic_or_unclear':
      default:
        await this.composeOrFallback(from, parsed, merged, history, {
          scenario: 'unclear',
          fallbackKey: 'unclear_handoff',
        });
        return;
    }
  }

  private async handleAvailability(
    from: string,
    merged: MergedIntent,
  ): Promise<void> {
    if (!merged.checkIn || !merged.checkOut) return;
    const name = merged.customerName ?? '';

    const rule = this.bookingRules.validate(merged.checkIn, merged.checkOut);
    if (!rule.pass) {
      switch (rule.reason) {
        case 'year_2026_redirect':
          await this.sendTemplate(from, 'year_2026_redirect', { name });
          return;
        case 'not_sunday':
          await this.sendTemplate(from, 'dates_not_sunday_to_sunday', {
            name,
            suggested_check_in: this.formatDate(new Date(rule.suggestedCheckIn)),
            suggested_check_out: this.formatDate(
              new Date(rule.suggestedCheckOut),
            ),
          });
          return;
        case 'min_stay':
          await this.sendTemplate(from, 'minimum_stay_not_met', {
            name,
            suggested_check_in: this.formatDate(new Date(rule.suggestedCheckIn)),
            suggested_check_out: this.formatDate(
              new Date(rule.suggestedCheckOut),
            ),
          });
          return;
        case 'long_stay_manual':
          await this.handoffTemplate(from, '', 'long_stay_manual_pricing', {
            name,
          });
          return;
      }
    }

    const held = await this.holds.hasOverlap(merged.checkIn, merged.checkOut);
    const icalOk = held
      ? false
      : await this.availability.isRangeAvailable(merged.checkIn, merged.checkOut);

    const datesLabel = `${this.isoDate(merged.checkIn)} → ${this.isoDate(merged.checkOut)}`;

    if (!icalOk) {
      await this.sendTemplate(from, 'availability_no_handoff', {
        name,
        check_in: this.formatDate(merged.checkIn),
        check_out: this.formatDate(merged.checkOut),
        month: this.monthName(merged.checkIn),
      });
      await this.recordQuoteSafe(from, datesLabel, 0, 'unavailable');
      await this.notifications.notifyOwnerAboutConversation(
        from,
        held ? 'hold_conflict' : 'dates_unavailable',
        { intent: 'availability_inquiry', extra: { held } },
      );
      return;
    }

    const quote = await this.pricing.calculate(merged.checkIn, merged.checkOut);

    const quoteText = await this.templates.render('availability_yes_quote', {
      name,
      check_in: this.formatDate(merged.checkIn),
      check_out: this.formatDate(merged.checkOut),
      nights: quote.nights,
      price: this.formatPrice(quote.total),
    });

    let combined = quoteText;
    if (this.shouldAppendHarvest(merged.checkIn, merged.checkOut)) {
      try {
        const note = await this.templates.render('september_wine_harvest_note', {});
        combined = this.insertBeforeSignOff(combined, note);
      } catch (err) {
        this.logger.warn('templates', 'wine harvest append failed', {
          error: (err as Error).message,
        });
      }
    }

    await this.whatsapp.sendMessage(from, combined);
    await this.messageLog.log(from, 'out', combined);
    await this.markResponded(from);

    await this.recordQuoteSafe(from, datesLabel, quote.total, 'available');

    try {
      await this.followUps.schedule(from);
    } catch (err) {
      this.logger.warn('follow-ups', 'schedule after quote failed', {
        from,
        error: (err as Error).message,
      });
    }
  }

  private async handleHoldRequest(
    from: string,
    merged: MergedIntent,
  ): Promise<void> {
    const name = merged.customerName ?? '';

    if (!merged.checkIn || !merged.checkOut) {
      await this.sendTemplate(from, 'dates_unclear_ask_clarify', { name });
      return;
    }

    const rule = this.bookingRules.validate(merged.checkIn, merged.checkOut);
    if (!rule.pass) {
      switch (rule.reason) {
        case 'year_2026_redirect':
          await this.sendTemplate(from, 'year_2026_redirect', { name });
          return;
        case 'not_sunday':
          await this.sendTemplate(from, 'dates_not_sunday_to_sunday', {
            name,
            suggested_check_in: this.formatDate(new Date(rule.suggestedCheckIn)),
            suggested_check_out: this.formatDate(new Date(rule.suggestedCheckOut)),
          });
          return;
        case 'min_stay':
          await this.sendTemplate(from, 'minimum_stay_not_met', {
            name,
            suggested_check_in: this.formatDate(new Date(rule.suggestedCheckIn)),
            suggested_check_out: this.formatDate(new Date(rule.suggestedCheckOut)),
          });
          return;
        case 'long_stay_manual':
          await this.handoffTemplate(from, '', 'long_stay_manual_pricing', {
            name,
          });
          return;
      }
    }

    const held = await this.holds.hasOverlap(merged.checkIn, merged.checkOut);
    const icalOk = held
      ? false
      : await this.availability.isRangeAvailable(merged.checkIn, merged.checkOut);

    if (!icalOk) {
      const datesLabel = `${this.isoDate(merged.checkIn)} → ${this.isoDate(merged.checkOut)}`;
      await this.sendTemplate(from, 'availability_no_handoff', {
        name,
        check_in: this.formatDate(merged.checkIn),
        check_out: this.formatDate(merged.checkOut),
        month: this.monthName(merged.checkIn),
      });
      await this.recordQuoteSafe(from, datesLabel, 0, 'unavailable');
      await this.notifications.notifyOwnerAboutConversation(
        from,
        held ? 'hold_conflict' : 'dates_unavailable',
        { intent: 'hold_request', extra: { held } },
      );
      return;
    }

    const hold = await this.holds.createHold(from, merged.checkIn, merged.checkOut);
    await this.sendTemplate(from, 'hold_confirmed', {
      name,
      check_in: this.formatDate(merged.checkIn),
      check_out: this.formatDate(merged.checkOut),
      hold_expiry: this.formatDate(new Date(hold.fields.hold_expires_at)),
    });
  }

  private async handleGeneralInfo(
    from: string,
    parsed: ParseResult,
    merged: MergedIntent,
    history: HistoryMessage[],
  ): Promise<void> {
    const knowledgeFacts = await this.assembleKnowledgeFacts(
      parsed.topicKeys,
      merged.customerName,
    );

    if (knowledgeFacts.length === 0) {
      await this.composeOrFallback(from, parsed, merged, history, {
        scenario: 'faq_unknown',
        fallbackKey: 'faq_unknown_handoff',
      });
      await this.notifications.notifyOwnerAboutConversation(
        from,
        'faq_unknown',
        { intent: 'general_info' },
      );
      return;
    }

    await this.composeOrFallback(from, parsed, merged, history, {
      scenario: 'general_info',
      fallbackKey: 'faq_unknown_handoff',
      knowledgeFragments: [],
      extraFacts: knowledgeFacts,
    });
  }

  private async handleMonthQuery(
    from: string,
    parsed: ParseResult,
    merged: MergedIntent,
    history: HistoryMessage[],
  ): Promise<void> {
    const name = merged.customerName ?? '';
    const years = this.monthQueryYears(parsed);
    const allBlocked =
      years.length > 0 && years.every((y) => this.bookingRules.isYearFullyBooked(y));
    if (allBlocked) {
      await this.sendTemplate(from, 'year_2026_redirect', { name });
      return;
    }

    const facts: CompositionFact[] = [];
    if (parsed.monthQuery) {
      const summary = await this.helpers.monthAvailabilitySummary(
        parsed.monthQuery.year,
        parsed.monthQuery.month,
      );
      facts.push({
        key: 'available_weeks',
        text:
          summary.length === 0
            ? `No Sunday-to-Sunday weeks are available in ${this.formatMonthYear(parsed.monthQuery)}.`
            : summary
                .map(
                  (w) =>
                    `${this.formatDate(w.checkIn)} → ${this.formatDate(w.checkOut)} at ${this.formatPrice(w.total)}`,
                )
                .join('; '),
      });
    } else if (parsed.monthRangeQuery) {
      const summary = await this.helpers.multiMonthAvailabilitySummary(
        parsed.monthRangeQuery.start,
        parsed.monthRangeQuery.end,
      );
      facts.push({
        key: 'available_weeks',
        text:
          summary.length === 0
            ? `No Sunday-to-Sunday weeks are available across ${this.formatMonthYear(parsed.monthRangeQuery.start)}–${this.formatMonthYear(parsed.monthRangeQuery.end)}.`
            : summary
                .map(
                  (w) =>
                    `${this.formatDate(w.checkIn)} → ${this.formatDate(w.checkOut)} at ${this.formatPrice(w.total)}`,
                )
                .join('; '),
      });
    }

    await this.composeOrFallback(from, parsed, merged, history, {
      scenario: 'month_query',
      fallbackKey: 'dates_unclear_ask_clarify',
      extraFacts: facts,
    });
  }

  private async composeOrFallback(
    from: string,
    parsed: ParseResult,
    merged: MergedIntent,
    history: HistoryMessage[],
    options: {
      scenario: string;
      fallbackKey: string;
      knowledgeFragments?: Fragment[];
      extraFacts?: CompositionFact[];
    },
  ): Promise<void> {
    const pkg = await this.buildCompositionPackage(
      parsed,
      merged,
      history,
      options,
    );
    const result = await this.composer.compose(pkg);

    if (result.ok) {
      await this.whatsapp.sendMessage(from, result.text);
      await this.messageLog.log(from, 'out', result.text);
      await this.markResponded(from);
      return;
    }

    this.logger.warn('templates', 'composer fallback to template', {
      from,
      scenario: options.scenario,
      fallbackKey: options.fallbackKey,
      reason: result.reason,
    });
    await this.notifications.notifyOwnerAboutConversation(from, 'composer_fallback', {
      intent: parsed.intent,
      extra: { reason: result.reason, scenario: options.scenario },
    });
    await this.sendTemplate(from, options.fallbackKey, {
      name: merged.customerName ?? '',
    });
  }

  private async buildCompositionPackage(
    parsed: ParseResult,
    merged: MergedIntent,
    history: HistoryMessage[],
    options: {
      scenario: string;
      knowledgeFragments?: Fragment[];
      extraFacts?: CompositionFact[];
    },
  ): Promise<CompositionPackage> {
    const knowledge =
      options.knowledgeFragments ?? (await this.fetchKnowledgeFragmentsSafe(parsed.topicKeys));
    const openers = await this.fetchByCategorySafe('opener');
    const nudges = await this.fetchByCategorySafe('nudge');

    const facts: CompositionFact[] = knowledge.map((f) => ({
      key: f.key,
      text: f.text,
    }));
    if (options.extraFacts) facts.push(...options.extraFacts);

    if (this.touchesSeptember(parsed, merged)) {
      facts.push({
        key: 'season_september',
        text:
          "September is the start of the wine harvest in this part of the Dordogne. Vineyards are busy, evenings are usually still warm, and there are local food and wine events around. Mention this once, naturally, where it fits.",
      });
    }

    if (SCENARIOS_WITH_WEBSITE.has(options.scenario)) {
      const websiteText =
        options.scenario === 'greeting'
          ? `Mention that most information about the property is on ${WEBSITE_URL}, in one short line before the sign-off.`
          : `Point the guest to ${WEBSITE_URL} for more detail on the topic they asked about, in a single short sentence (e.g. "More on the website if helpful: ${WEBSITE_URL}").`;
      facts.push({ key: 'website', text: websiteText });
    }

    const scenarioGuidance = this.scenarioGuidance(options.scenario);
    if (scenarioGuidance) {
      facts.push({ key: 'scenario_guidance', text: scenarioGuidance });
    }

    return {
      scenarioHint: options.scenario,
      guestName: merged.customerName,
      isFirstMessage: history.length <= 1,
      toneFlags: {
        needsGreeting: parsed.needsGreeting,
        needsAcknowledgment: parsed.needsAcknowledgment,
        needsNudgeToBook: parsed.highIntentSignal,
        needsSignOff: true,
      },
      facts,
      openers: openers.map((f) => f.text),
      closers: [],
      nudges: nudges.map((f) => f.text),
      history,
    };
  }

  private async fetchKnowledgeFragmentsSafe(
    topicKeys: string[],
  ): Promise<Fragment[]> {
    if (topicKeys.length === 0) return [];
    try {
      return await this.fragments.fetchByTopicKeys(topicKeys);
    } catch (err) {
      this.logger.warn('templates', 'fetchByTopicKeys failed', {
        topicKeys,
        error: (err as Error).message,
      });
      return [];
    }
  }

  private async fetchByCategorySafe(
    category: 'opener' | 'closer' | 'nudge' | 'knowledge',
  ): Promise<Fragment[]> {
    try {
      return await this.fragments.listByCategory(category);
    } catch (err) {
      this.logger.warn('templates', 'listByCategory failed', {
        category,
        error: (err as Error).message,
      });
      return [];
    }
  }

  private async fetchTopicHintsSafe(): Promise<
    Array<{ topicKey: string; questionExamples: string }>
  > {
    try {
      const [fragments, kbTopics] = await Promise.all([
        this.fragments.listByCategory('knowledge').catch(() => []),
        this.knowledgeBase.listTopics().catch(() => []),
      ]);
      const examplesByKey = new Map<string, string>();
      for (const t of kbTopics) examplesByKey.set(t.topicKey, t.questionExamples);
      const allKeys = new Set<string>(examplesByKey.keys());
      for (const f of fragments) {
        for (const t of f.topicKeys) allKeys.add(t);
      }
      return Array.from(allKeys).map((topicKey) => ({
        topicKey,
        questionExamples: examplesByKey.get(topicKey) ?? '',
      }));
    } catch (err) {
      this.logger.warn('templates', 'topic hint fetch failed', {
        error: (err as Error).message,
      });
      return [];
    }
  }

  private async assembleKnowledgeFacts(
    topicKeys: string[],
    customerName: string | null,
  ): Promise<CompositionFact[]> {
    if (topicKeys.length === 0) return [];

    const fragments = await this.fetchKnowledgeFragmentsSafe(topicKeys);
    const facts: CompositionFact[] = fragments.map((f) => ({
      key: f.key,
      text: f.text,
    }));

    const covered = new Set<string>();
    for (const f of fragments) {
      for (const t of f.topicKeys) covered.add(t);
    }
    const missing = topicKeys.filter((k) => !covered.has(k));

    for (const key of missing) {
      try {
        const answer = await this.knowledgeBase.render(key, {
          name: customerName ?? '',
        });
        if (answer) facts.push({ key: `kb_${key}`, text: answer });
      } catch (err) {
        this.logger.warn('templates', 'KB fallback failed', {
          key,
          error: (err as Error).message,
        });
      }
    }

    return facts;
  }

  private async runOwnerCommand(cmd: ParsedCommand): Promise<void> {
    if (!this.ownerPhone) return;
    const target = cmd.phone ?? this.ownerPhone;

    if (cmd.command === 'pause') {
      await this.conversation.setStatus(
        target,
        'paused',
        cmd.minutes ? { pauseForMinutes: cmd.minutes } : {},
      );
      await this.notifications.notifyOwner(
        cmd.minutes
          ? `paused ${target} for ${cmd.minutes} min`
          : `paused ${target}`,
        { reason: 'owner_command', extra: { command: 'pause', target } },
      );
      return;
    }
    if (cmd.command === 'release') {
      await this.conversation.setStatus(target, 'human');
      await this.notifications.notifyOwner(`${target} released to human`, {
        reason: 'owner_command',
        extra: { command: 'release', target },
      });
      return;
    }
    if (cmd.command === 'status') {
      const state = await this.conversation.getState(target);
      await this.notifications.notifyOwner(
        `${target}: ${state.status}${state.lastIntent ? ` (last: ${state.lastIntent})` : ''}`,
        { reason: 'owner_command', extra: { command: 'status', target } },
      );
      return;
    }
    await this.conversation.setStatus(target, 'bot');
    await this.notifications.notifyOwner(`${target} bot resumed`, {
      reason: 'owner_command',
      extra: { command: 'resume', target },
    });
  }

  private async sendTemplate(
    to: string,
    key: string,
    vars: TemplateVars,
    options: { override?: boolean } = {},
  ): Promise<void> {
    const text = await this.templates.render(key, vars);
    await this.whatsapp.sendMessage(to, text, options);
    await this.messageLog.log(to, 'out', text);
    await this.markResponded(to);
  }

  private async markResponded(phone: string): Promise<void> {
    try {
      await this.conversation.setLifecycleStatus(phone, 'Responded');
    } catch (err) {
      this.logger.warn('conversation', 'set Responded failed', {
        phone,
        error: (err as Error).message,
      });
    }
  }

  private async recordQuoteSafe(
    phone: string,
    datesRequested: string,
    priceQuoted: number,
    result: 'available' | 'unavailable' | 'pending',
  ): Promise<void> {
    try {
      await this.conversation.recordQuote(
        phone,
        datesRequested,
        priceQuoted,
        result,
      );
    } catch (err) {
      this.logger.warn('conversation', 'recordQuote failed', {
        phone,
        error: (err as Error).message,
      });
    }
  }

  private async handoffTemplate(
    from: string,
    originalText: string,
    templateKey: string,
    vars: TemplateVars = {},
    notification?: { reason?: string; extra?: Record<string, unknown> },
    options: { pause?: boolean } = {},
  ): Promise<void> {
    if (options.pause) {
      try {
        await this.conversation.setStatus(from, 'paused', {
          pauseForMinutes: PAUSE_ON_HANDOFF_MIN,
        });
      } catch (err) {
        this.logger.error('conversation', 'failed to set pause status', {
          from,
          error: (err as Error).message,
        });
      }
    }

    try {
      await this.sendTemplate(from, templateKey, vars, { override: true });
    } catch (err) {
      this.logger.error('conversation', 'failed to send handoff reply', {
        from,
        templateKey,
        error: (err as Error).message,
      });
    }

    const reason = notification?.reason ?? this.handoffReason(templateKey);
    if (from) {
      await this.notifications.notifyOwnerAboutConversation(from, reason, {
        message: originalText || undefined,
        extra: notification?.extra,
      });
    } else {
      await this.notifications.notifyOwner(`needs attention: ${reason}`, {
        reason,
        message: originalText || undefined,
        extra: notification?.extra,
      });
    }
  }

  private handoffReason(templateKey: string): string {
    switch (templateKey) {
      case 'discount_request':
        return 'discount_request';
      case 'long_stay_manual_pricing':
        return 'long_stay_manual_pricing';
      case 'faq_unknown_handoff':
        return 'faq_unknown';
      case 'complaint_handoff':
        return 'complaint';
      case 'human_request_handoff':
        return 'human_request';
      case 'booking_confirmed_handoff':
      case 'booking_confirmed_instant_book':
        return 'booking_confirmation';
      case 'unclear_handoff':
      default:
        return 'unclear_or_off_topic';
    }
  }

  private mergeWithPending(
    parsed: MergedIntent,
    pending: PendingDates | null,
    storedName: string | null,
  ): MergedIntent {
    const pendingCheckIn = pending?.checkIn
      ? this.parseIso(pending.checkIn)
      : null;
    const pendingCheckOut = pending?.checkOut
      ? this.parseIso(pending.checkOut)
      : null;
    return {
      checkIn: parsed.checkIn ?? pendingCheckIn,
      checkOut: parsed.checkOut ?? pendingCheckOut,
      guests: parsed.guests ?? pending?.guests ?? null,
      customerName: parsed.customerName ?? storedName,
    };
  }

  private serializePending(merged: MergedIntent): PendingDates | null {
    if (!merged.checkIn && !merged.checkOut && merged.guests === null) {
      return null;
    }
    return {
      checkIn: merged.checkIn ? this.isoDate(merged.checkIn) : null,
      checkOut: merged.checkOut ? this.isoDate(merged.checkOut) : null,
      guests: merged.guests,
    };
  }

  private parseIso(value: string): Date | null {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  private isoDate(d: Date): string {
    return d.toISOString().slice(0, 10);
  }

  private formatDate(d: Date): string {
    return d.toLocaleDateString('en-GB', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    });
  }

  private formatPrice(amount: number): string {
    return `€${Math.round(amount).toLocaleString('en-GB')}`;
  }

  private monthName(d: Date): string {
    return d.toLocaleDateString('en-GB', { month: 'long', timeZone: 'UTC' });
  }

  private scenarioGuidance(scenario: string): string | null {
    switch (scenario) {
      case 'acknowledgment':
        return "The customer just said something like 'thanks' or 'thank you' to close the loop. Reply warmly with a 'you're welcome' style line — for example 'You're welcome, just shout if anything else comes up.' or 'My pleasure — happy to help any time.' Do NOT open with 'Perfect' / 'Great' / 'Got it'. Do NOT promise future contact like 'You'll hear from me soon' unless a fact says so. One short sentence is enough.";
      case 'polite_close':
        return "The customer is winding down ('I'll think about it', 'let me check with my partner'). Reply with a warm, no-pressure line acknowledging their pause. One short sentence is enough.";
      case 'correction':
        return "The customer is correcting or pushing back on YOUR previous reply. Apologise briefly for the misunderstanding and ask what they'd like to know. Don't escalate.";
      case 'unclear':
        return "You couldn't parse what the customer is asking. Apologise briefly and ask them to rephrase or clarify. Don't guess.";
      case 'faq_unknown':
        return "You don't have a fact to answer this question. Acknowledge the question and say you'll come back shortly with the answer. Do not invent details.";
      case 'dates_unclear':
        return "The customer asked about availability without giving Sunday-to-Sunday dates. Ask them to share specific Sunday check-in / check-out dates so you can quote properly.";
      default:
        return null;
    }
  }

  private monthQueryYears(parsed: ParseResult): number[] {
    if (parsed.monthQuery) return [parsed.monthQuery.year];
    if (parsed.monthRangeQuery) {
      const out = new Set<number>();
      for (
        let y = parsed.monthRangeQuery.start.year;
        y <= parsed.monthRangeQuery.end.year;
        y++
      ) {
        out.add(y);
      }
      return Array.from(out);
    }
    return [];
  }

  private formatMonthYear(m: { year: number; month: number }): string {
    const d = new Date(Date.UTC(m.year, m.month - 1, 1));
    return d.toLocaleDateString('en-GB', {
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    });
  }

  private isInSeptember(d: Date): boolean {
    return d.getUTCMonth() === SEPTEMBER;
  }

  private touchesSeptember(parsed: ParseResult, merged: MergedIntent): boolean {
    if (merged.checkIn && this.isInSeptember(merged.checkIn)) return true;
    if (merged.checkOut && this.isInSeptember(merged.checkOut)) return true;
    if (
      merged.checkIn &&
      merged.checkOut &&
      this.rangeCoversMonth(merged.checkIn, merged.checkOut, SEPTEMBER + 1)
    ) {
      return true;
    }
    if (parsed.monthQuery && parsed.monthQuery.month === SEPTEMBER + 1) {
      return true;
    }
    if (parsed.monthRangeQuery) {
      const { start, end } = parsed.monthRangeQuery;
      const startKey = start.year * 12 + (start.month - 1);
      const endKey = end.year * 12 + (end.month - 1);
      for (let k = startKey; k <= endKey; k++) {
        if (k % 12 === SEPTEMBER) return true;
      }
    }
    return false;
  }

  private rangeCoversMonth(
    start: Date,
    end: Date,
    month1Indexed: number,
  ): boolean {
    for (let t = start.getTime(); t < end.getTime(); t += DAY_MS) {
      if (new Date(t).getUTCMonth() === month1Indexed - 1) return true;
    }
    return false;
  }

  /**
   * Inserts `note` immediately before the trailing "Many thanks" sign-off in
   * `body`. If no sign-off is found, falls back to appending at the end.
   */
  private insertBeforeSignOff(body: string, note: string): string {
    const match = body.match(/\n+Many thanks\.?\s*$/i);
    if (!match) return `${body}\n\n${note}`;
    const head = body.slice(0, match.index ?? body.length).replace(/\s+$/, '');
    return `${head}\n\n${note}\n\nMany thanks`;
  }

  private shouldAppendHarvest(checkIn: Date, checkOut: Date): boolean {
    for (let t = checkIn.getTime(); t < checkOut.getTime(); t += DAY_MS) {
      if (new Date(t).getUTCMonth() === SEPTEMBER) return true;
    }
    return false;
  }
}
