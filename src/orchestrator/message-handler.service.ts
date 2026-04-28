import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AvailabilityService } from '../availability/availability.service';
import { BookingRulesService } from '../booking-rules/booking-rules.service';
import {
  ConversationService,
  ParsedCommand,
  PendingDates,
} from '../conversation/conversation.service';
import { HoldsService } from '../holds/holds.service';
import { KnowledgeBaseService } from '../knowledge-base/knowledge-base.service';
import { LoggerService } from '../logger/logger.service';
import { MessageLogService } from '../messagelog/messagelog.service';
import { Intent, ParserService } from '../parser/parser.service';
import { PricingService } from '../pricing/pricing.service';
import { ResponseService, TemplateVars } from '../response/response.service';
import { WhatsappService } from '../whatsapp/whatsapp.service';

const PAUSE_ON_HANDOFF_MIN = 60;
const HISTORY_LIMIT = 6;
const SEPTEMBER = 8; // UTC month index
const KB_CONFIDENCE_THRESHOLD = 0.7;

type IncomingMessage = { from: string; text: string };

type MergedIntent = {
  checkIn: Date | null;
  checkOut: Date | null;
  guests: number | null;
  customerName: string | null;
};

@Injectable()
export class MessageHandlerService {
  private readonly ownerPhone: string | undefined;

  constructor(
    private readonly parser: ParserService,
    private readonly availability: AvailabilityService,
    private readonly pricing: PricingService,
    private readonly bookingRules: BookingRulesService,
    private readonly holds: HoldsService,
    private readonly response: ResponseService,
    private readonly whatsapp: WhatsappService,
    private readonly conversation: ConversationService,
    private readonly messageLog: MessageLogService,
    private readonly knowledgeBase: KnowledgeBaseService,
    private readonly logger: LoggerService,
    config: ConfigService,
  ) {
    this.ownerPhone = config.get<string>('OWNER_PHONE');
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

    const state = await this.conversation.getState(msg.from);
    if (state.status !== 'bot') {
      this.logger.info('conversation', 'silent drop: not in bot mode', {
        from: msg.from,
        status: state.status,
      });
      return;
    }

    const storedName = state.customerName;

    try {
      const history = await this.messageLog.recent(msg.from, HISTORY_LIMIT);
      const kbTopics = await this.fetchKbTopicsSafe();
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

      if (parsed.mentionsDiscount) {
        await this.handoff(msg.from, msg.text, 'discount_request', {
          name: merged.customerName ?? '',
        });
        return;
      }

      await this.route(
        msg.from,
        parsed.intent,
        merged,
        { kbTopic: parsed.kbTopic, confidence: parsed.confidence },
        parsed.highIntentSignal,
      );
    } catch (err) {
      this.logger.error('conversation', 'message handling failed', {
        from: msg.from,
        error: (err as Error).message,
      });
      await this.handoff(msg.from, msg.text, 'unclear_handoff', {
        name: storedName ?? '',
      });
    }
  }

  private async route(
    from: string,
    intent: Intent,
    merged: MergedIntent,
    kb: { kbTopic: string | null; confidence: number },
    highIntentSignal: boolean,
  ): Promise<void> {
    const name = merged.customerName ?? '';

    switch (intent) {
      case 'greeting':
        if (merged.checkIn && merged.checkOut) {
          await this.handleAvailability(from, merged, highIntentSignal);
          return;
        }
        await this.reply(from, 'greeting_ask_dates', { name });
        return;

      case 'availability_inquiry':
        if (!merged.checkIn || !merged.checkOut) {
          await this.reply(from, 'dates_unclear_ask_clarify', { name });
          return;
        }
        await this.handleAvailability(from, merged, highIntentSignal);
        return;

      case 'pricing_inquiry':
        if (!merged.checkIn || !merged.checkOut) {
          await this.reply(from, 'dates_unclear_ask_clarify', { name });
          return;
        }
        await this.handleAvailability(from, merged, highIntentSignal);
        return;

      case 'general_info':
        await this.handleGeneralInfo(from, name, kb);
        return;

      case 'booking_confirmation':
        await this.handoff(from, '', 'booking_confirmed_handoff', { name });
        return;

      case 'hold_request':
        await this.handleHoldRequest(from, merged);
        return;

      case 'human_request':
        await this.handoff(from, '', 'human_request_handoff', { name });
        return;

      case 'complaint_or_frustration':
        await this.handoff(from, '', 'complaint_handoff', { name });
        return;

      case 'off_topic_or_unclear':
      default:
        await this.handoff(from, '', 'unclear_handoff', { name });
        return;
    }
  }

  private async handleAvailability(
    from: string,
    merged: MergedIntent,
    highIntentSignal = false,
  ): Promise<void> {
    if (!merged.checkIn || !merged.checkOut) return;

    const name = merged.customerName ?? '';

    const rule = this.bookingRules.validate(merged.checkIn, merged.checkOut);
    if (!rule.pass) {
      switch (rule.reason) {
        case 'year_2026_redirect':
          await this.reply(from, 'year_2026_redirect', { name });
          return;
        case 'not_sunday':
          await this.reply(from, 'dates_not_sunday_to_sunday', {
            name,
            suggested_check_in: this.formatDate(new Date(rule.suggestedCheckIn)),
            suggested_check_out: this.formatDate(
              new Date(rule.suggestedCheckOut),
            ),
          });
          return;
        case 'min_stay':
          await this.reply(from, 'minimum_stay_not_met', {
            name,
            suggested_check_in: this.formatDate(new Date(rule.suggestedCheckIn)),
            suggested_check_out: this.formatDate(
              new Date(rule.suggestedCheckOut),
            ),
          });
          return;
        case 'long_stay_manual':
          await this.handoff(from, '', 'long_stay_manual_pricing', { name });
          return;
      }
    }

    const held = await this.holds.hasOverlap(merged.checkIn, merged.checkOut);
    const icalOk = held
      ? false
      : await this.availability.isRangeAvailable(merged.checkIn, merged.checkOut);

    if (!icalOk) {
      await this.reply(from, 'availability_no_handoff', {
        name,
        check_in: this.formatDate(merged.checkIn),
        check_out: this.formatDate(merged.checkOut),
        month: this.monthName(merged.checkIn),
      });
      return;
    }

    const quote = await this.pricing.calculate(merged.checkIn, merged.checkOut);

    await this.reply(
      from,
      'availability_yes_quote',
      {
        name,
        check_in: this.formatDate(merged.checkIn),
        check_out: this.formatDate(merged.checkOut),
        nights: quote.nights,
        price: this.formatPrice(quote.total),
      },
      this.shouldAppendHarvest(merged.checkIn)
        ? 'september_wine_harvest_note'
        : undefined,
    );

    if (highIntentSignal) {
      await this.reply(from, 'hold_offer_post_quote', {
        name,
        check_in: this.formatDate(merged.checkIn),
        check_out: this.formatDate(merged.checkOut),
      });
    }
  }

  private async handleHoldRequest(
    from: string,
    merged: MergedIntent,
  ): Promise<void> {
    const name = merged.customerName ?? '';

    if (!merged.checkIn || !merged.checkOut) {
      await this.reply(from, 'dates_unclear_ask_clarify', { name });
      return;
    }

    const rule = this.bookingRules.validate(merged.checkIn, merged.checkOut);
    if (!rule.pass) {
      switch (rule.reason) {
        case 'year_2026_redirect':
          await this.reply(from, 'year_2026_redirect', { name });
          return;
        case 'not_sunday':
          await this.reply(from, 'dates_not_sunday_to_sunday', {
            name,
            suggested_check_in: this.formatDate(new Date(rule.suggestedCheckIn)),
            suggested_check_out: this.formatDate(new Date(rule.suggestedCheckOut)),
          });
          return;
        case 'min_stay':
          await this.reply(from, 'minimum_stay_not_met', {
            name,
            suggested_check_in: this.formatDate(new Date(rule.suggestedCheckIn)),
            suggested_check_out: this.formatDate(new Date(rule.suggestedCheckOut)),
          });
          return;
        case 'long_stay_manual':
          await this.handoff(from, '', 'long_stay_manual_pricing', { name });
          return;
      }
    }

    const held = await this.holds.hasOverlap(merged.checkIn, merged.checkOut);
    const icalOk = held
      ? false
      : await this.availability.isRangeAvailable(merged.checkIn, merged.checkOut);

    if (!icalOk) {
      await this.reply(from, 'availability_no_handoff', {
        name,
        check_in: this.formatDate(merged.checkIn),
        check_out: this.formatDate(merged.checkOut),
        month: this.monthName(merged.checkIn),
      });
      return;
    }

    const hold = await this.holds.createHold(from, merged.checkIn, merged.checkOut);
    await this.reply(from, 'hold_confirmed', {
      name,
      check_in: this.formatDate(merged.checkIn),
      check_out: this.formatDate(merged.checkOut),
      hold_expiry: this.formatDate(new Date(hold.fields.hold_expires_at)),
    });
  }

  private async handleGeneralInfo(
    from: string,
    name: string,
    kb: { kbTopic: string | null; confidence: number },
  ): Promise<void> {
    if (!kb.kbTopic || kb.confidence < KB_CONFIDENCE_THRESHOLD) {
      await this.handoff(from, '', 'faq_unknown_handoff', { name });
      return;
    }

    let answer: string | null;
    try {
      answer = await this.knowledgeBase.render(kb.kbTopic, { name });
    } catch (err) {
      this.logger.error('knowledge-base', 'render failed', {
        topicKey: kb.kbTopic,
        error: (err as Error).message,
      });
      await this.handoff(from, '', 'faq_unknown_handoff', { name });
      return;
    }

    if (!answer) {
      this.logger.warn('knowledge-base', 'topic not found in KB', {
        topicKey: kb.kbTopic,
      });
      await this.handoff(from, '', 'faq_unknown_handoff', { name });
      return;
    }

    await this.whatsapp.sendMessage(from, answer);
    await this.messageLog.log(from, 'out', answer);
  }

  private async fetchKbTopicsSafe(): Promise<
    Array<{ topicKey: string; questionExamples: string }>
  > {
    try {
      return await this.knowledgeBase.listTopics();
    } catch (err) {
      this.logger.warn('knowledge-base', 'listTopics failed, parser will skip KB classification', {
        error: (err as Error).message,
      });
      return [];
    }
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
      await this.notifyOwner(
        cmd.minutes
          ? `paused ${target} for ${cmd.minutes} min`
          : `paused ${target}`,
      );
      return;
    }
    if (cmd.command === 'release') {
      await this.conversation.setStatus(target, 'human');
      await this.notifyOwner(`${target} released to human`);
      return;
    }
    if (cmd.command === 'status') {
      const state = await this.conversation.getState(target);
      await this.notifyOwner(
        `${target}: ${state.status}${state.lastIntent ? ` (last: ${state.lastIntent})` : ''}`,
      );
      return;
    }
    await this.conversation.setStatus(target, 'bot');
    await this.notifyOwner(`${target} bot resumed`);
  }

  private async reply(
    to: string,
    key: string,
    vars: TemplateVars,
    appendKey?: string,
    options: { override?: boolean } = {},
  ): Promise<void> {
    let text = await this.response.render(key, vars);
    if (appendKey) {
      try {
        const note = await this.response.render(appendKey, {});
        text = `${text}\n\n${note}`;
      } catch (err) {
        this.logger.warn('templates', 'could not render append template', {
          appendKey,
          error: (err as Error).message,
        });
      }
    }
    await this.whatsapp.sendMessage(to, text, options);
    await this.messageLog.log(to, 'out', text);
  }

  private async notifyOwner(text: string): Promise<void> {
    if (!this.ownerPhone) return;
    await this.whatsapp.sendMessage(this.ownerPhone, text, { override: true });
  }

  private async handoff(
    from: string,
    originalText: string,
    templateKey: string,
    vars: TemplateVars = {},
  ): Promise<void> {
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

    try {
      await this.reply(from, templateKey, vars, undefined, { override: true });
    } catch (err) {
      this.logger.error('conversation', 'failed to send handoff reply', {
        from,
        templateKey,
        error: (err as Error).message,
      });
    }

    if (this.ownerPhone) {
      try {
        await this.whatsapp.sendMessage(
          this.ownerPhone,
          `needs attention from ${from}${originalText ? `: ${originalText}` : ''}`,
          { override: true },
        );
      } catch (err) {
        this.logger.error('conversation', 'failed to notify owner', {
          error: (err as Error).message,
        });
      }
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

  private shouldAppendHarvest(checkIn: Date): boolean {
    return checkIn.getUTCMonth() === SEPTEMBER;
  }
}
