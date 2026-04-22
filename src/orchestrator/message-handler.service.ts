import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AvailabilityService } from '../availability/availability.service';
import {
  ConversationService,
  ParsedCommand,
} from '../conversation/conversation.service';
import { LoggerService } from '../logger/logger.service';
import { ParserService } from '../parser/parser.service';
import { PricingService } from '../pricing/pricing.service';
import { TemplatesService } from '../templates/templates.service';
import { WhatsappService } from '../whatsapp/whatsapp.service';

const PAUSE_ON_ERROR_MIN = 60;

type IncomingMessage = { from: string; text: string };

@Injectable()
export class MessageHandlerService {
  private readonly ownerPhone: string | undefined;

  constructor(
    private readonly parser: ParserService,
    private readonly availability: AvailabilityService,
    private readonly pricing: PricingService,
    private readonly templates: TemplatesService,
    private readonly whatsapp: WhatsappService,
    private readonly conversation: ConversationService,
    private readonly logger: LoggerService,
    config: ConfigService,
  ) {
    this.ownerPhone = config.get<string>('OWNER_PHONE');
  }

  async handle(msg: IncomingMessage): Promise<void> {
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
      const parsed = await this.parser.parse(msg.text);

      switch (parsed.intent) {
        case 'availability_check': {
          if (!parsed.checkIn || !parsed.checkOut) {
            await this.reply(msg.from, 'needs_details', {});
            return;
          }
          const ok = await this.availability.isRangeAvailable(
            parsed.checkIn,
            parsed.checkOut,
          );
          if (!ok) {
            await this.reply(msg.from, 'availability_unavailable', {
              checkIn: parsed.checkIn.toISOString().slice(0, 10),
              checkOut: parsed.checkOut.toISOString().slice(0, 10),
            });
            return;
          }
          const quote = await this.pricing.calculate(
            parsed.checkIn,
            parsed.checkOut,
          );
          await this.reply(msg.from, 'availability_confirmed', {
            nights: quote.nights,
            total: quote.total,
            guests: parsed.guests ?? '',
          });
          return;
        }

        case 'pricing_check':
        case 'greeting': {
          await this.reply(msg.from, 'needs_details', {});
          return;
        }

        case 'handoff_request':
        case 'unknown':
        default: {
          await this.handoff(msg.from, msg.text);
          return;
        }
      }
    } catch (err) {
      this.logger.error('conversation', 'message handling failed', {
        from: msg.from,
        error: (err as Error).message,
      });
      await this.handoff(msg.from, msg.text);
    }
  }

  private async runOwnerCommand(cmd: ParsedCommand): Promise<void> {
    if (!this.ownerPhone) return;

    if (cmd.command === 'pause') {
      await this.conversation.setStatus(
        this.ownerPhone,
        'paused',
        cmd.minutes ? { pauseForMinutes: cmd.minutes } : {},
      );
      await this.whatsapp.sendMessage(
        this.ownerPhone,
        cmd.minutes ? `bot paused for ${cmd.minutes} min` : 'bot paused',
        { override: true },
      );
      return;
    }
    if (cmd.command === 'release') {
      await this.conversation.setStatus(this.ownerPhone, 'human');
      await this.whatsapp.sendMessage(
        this.ownerPhone,
        'released to human',
        { override: true },
      );
      return;
    }
    await this.conversation.setStatus(this.ownerPhone, 'bot');
    await this.whatsapp.sendMessage(this.ownerPhone, 'bot resumed', {
      override: true,
    });
  }

  private async reply(
    to: string,
    key: string,
    vars: Record<string, string | number | boolean>,
  ): Promise<void> {
    const text = await this.templates.render(key, vars);
    await this.whatsapp.sendMessage(to, text);
  }

  private async handoff(from: string, originalText: string): Promise<void> {
    try {
      await this.conversation.setStatus(from, 'paused', {
        pauseForMinutes: PAUSE_ON_ERROR_MIN,
      });
    } catch (err) {
      this.logger.error('conversation', 'failed to set pause status', {
        from,
        error: (err as Error).message,
      });
    }

    try {
      const text = await this.templates.render('holding_reply', {});
      await this.whatsapp.sendMessage(from, text);
    } catch (err) {
      this.logger.error('conversation', 'failed to send holding reply', {
        from,
        error: (err as Error).message,
      });
    }

    if (this.ownerPhone) {
      try {
        await this.whatsapp.sendMessage(
          this.ownerPhone,
          `needs attention from ${from}: ${originalText}`,
          { override: true },
        );
      } catch (err) {
        this.logger.error('conversation', 'failed to notify owner', {
          error: (err as Error).message,
        });
      }
    }
  }
}
