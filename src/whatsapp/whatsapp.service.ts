import { Inject, Injectable } from '@nestjs/common';
import { ConversationService } from '../conversation/conversation.service';
import { LoggerService } from '../logger/logger.service';
import type { IncomingMessage, WhatsAppProvider } from './providers/provider.interface';

export const WHATSAPP_PROVIDER = 'WHATSAPP_PROVIDER';

export type SendOptions = { override?: boolean };

@Injectable()
export class WhatsappService {
  constructor(
    @Inject(WHATSAPP_PROVIDER) private readonly provider: WhatsAppProvider,
    private readonly logger: LoggerService,
    private readonly conversation: ConversationService,
  ) {}

  async sendMessage(to: string, text: string, options: SendOptions = {}): Promise<void> {
    if (!options.override && !(await this.conversation.canSendBot(to))) {
      this.logger.warn('whatsapp', 'skipped send: conversation not in bot mode', { to });
      return;
    }
    return this.provider.sendMessage(to, text);
  }

  async sendTemplate(
    to: string,
    templateName: string,
    vars: Record<string, string>,
    options: SendOptions = {},
  ): Promise<void> {
    if (!options.override && !(await this.conversation.canSendBot(to))) {
      this.logger.warn('whatsapp', 'skipped template: conversation not in bot mode', { to });
      return;
    }
    return this.provider.sendTemplate(to, templateName, vars);
  }

  async assignToHuman(conversationId: string): Promise<void> {
    if (this.provider.assignToHuman) {
      await this.provider.assignToHuman(conversationId);
    }
  }

  parseWebhook(payload: unknown): IncomingMessage | null {
    return this.provider.parseWebhook(payload);
  }

  validateWebhookSignature(
    raw: Buffer,
    headers: Record<string, string | undefined>,
  ): boolean {
    return this.provider.validateWebhookSignature(raw, headers);
  }

  verifyWebhook(mode: string, token: string, challenge: string): string {
    if (!this.provider.verifyWebhook) {
      throw new Error('webhook verification not supported by this provider');
    }
    return this.provider.verifyWebhook(mode, token, challenge);
  }
}
