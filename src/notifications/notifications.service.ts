import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LoggerService } from '../logger/logger.service';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import { EmailService } from './email.service';

export type NotificationContext = {
  reason?: string;
  from?: string;
  message?: string;
  intent?: string;
  extra?: Record<string, unknown>;
};

@Injectable()
export class NotificationsService {
  private readonly ownerPhone: string | undefined;
  private readonly ownerEmail: string | undefined;

  constructor(
    config: ConfigService,
    private readonly whatsapp: WhatsappService,
    private readonly email: EmailService,
    private readonly logger: LoggerService,
  ) {
    this.ownerPhone = config.get<string>('OWNER_PHONE');
    this.ownerEmail = config.get<string>('OWNER_EMAIL');
  }

  /**
   * Send a notification to the owner over every configured channel.
   * Never throws — failures are logged so callers can fire-and-forget.
   */
  async notifyOwner(text: string, context?: NotificationContext): Promise<void> {
    const composed = this.compose(text, context);

    await Promise.allSettled([
      this.sendWhatsapp(composed.whatsapp),
      this.sendEmail(composed.subject, composed.body),
    ]);
  }

  private async sendWhatsapp(text: string): Promise<void> {
    if (!this.ownerPhone) return;
    try {
      await this.whatsapp.sendMessage(this.ownerPhone, text, { override: true });
    } catch (err) {
      this.logger.error('notifications', 'whatsapp delivery failed', {
        error: (err as Error).message,
      });
    }
  }

  private async sendEmail(subject: string, body: string): Promise<void> {
    if (!this.ownerEmail) return;
    try {
      await this.email.send({ to: this.ownerEmail, subject, body });
    } catch (err) {
      this.logger.error('notifications', 'email delivery failed', {
        error: (err as Error).message,
      });
    }
  }

  private compose(
    text: string,
    ctx?: NotificationContext,
  ): { whatsapp: string; subject: string; body: string } {
    const reason = ctx?.reason ?? 'notification';

    const subject = ctx?.from
      ? `[Bonté Maison] ${reason} — ${ctx.from}`
      : `[Bonté Maison] ${reason}`;

    const lines: string[] = [text];
    if (ctx?.from) lines.push(`From: ${ctx.from}`);
    if (ctx?.intent) lines.push(`Intent: ${ctx.intent}`);
    if (ctx?.message) lines.push(`Message: ${ctx.message}`);
    if (ctx?.extra) {
      for (const [k, v] of Object.entries(ctx.extra)) {
        lines.push(`${k}: ${this.stringify(v)}`);
      }
    }

    return {
      whatsapp: text,
      subject,
      body: lines.join('\n'),
    };
  }

  private stringify(v: unknown): string {
    if (v === null || v === undefined) return '';
    if (typeof v === 'string') return v;
    try {
      return JSON.stringify(v);
    } catch {
      return String(v);
    }
  }
}
