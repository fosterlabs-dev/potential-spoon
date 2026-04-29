import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosError } from 'axios';
import { LoggerService } from '../../logger/logger.service';
import { IncomingMessage, WhatsAppProvider } from './provider.interface';

// Wati webhook body shape (inbound message event)
type WatiWebhookPayload = {
  waId?: string;
  text?: string;
  id?: string;
  type?: string;
  created?: string;
  timestamp?: string;
  owner?: boolean;
  senderName?: string;
};

const MAX_MESSAGE_AGE_MS = 2 * 60 * 1000;

@Injectable()
export class WatiProvider implements WhatsAppProvider {
  private readonly baseUrl: string;
  private readonly accessToken: string;

  constructor(
    config: ConfigService,
    private readonly logger: LoggerService,
  ) {
    const baseUrl = config.get<string>('WATI_API_URL');
    const token = config.get<string>('WATI_ACCESS_TOKEN');
    if (!baseUrl || !token) {
      throw new Error('WATI_API_URL and WATI_ACCESS_TOKEN must be set');
    }
    this.baseUrl = baseUrl;
    this.accessToken = token;
  }

  async sendMessage(to: string, text: string): Promise<void> {
    try {
      const res = await axios.post(
        `${this.baseUrl}/sendSessionMessage/${to}`,
        {},
        {
          params: { messageText: text },
          headers: { Authorization: `Bearer ${this.accessToken}` },
        },
      );
      this.logger.info('whatsapp', 'sent message via wati', { to, id: res.data?.id });
    } catch (err) {
      const ax = err as AxiosError;
      this.logger.error('whatsapp', 'wati send failed', {
        to,
        status: ax.response?.status,
        url: ax.config?.url,
        responseBody: ax.response?.data,
        message: ax.message,
      });
      throw err;
    }
  }

  async sendTemplate(
    to: string,
    templateName: string,
    vars: Record<string, string>,
  ): Promise<void> {
    const parameters = Object.entries(vars).map(([name, value]) => ({ name, value }));
    try {
      await axios.post(
        `${this.baseUrl}/sendTemplateMessage`,
        {
          whatsappNumber: to,
          template_name: templateName,
          broadcast_name: templateName,
          parameters,
        },
        { headers: { Authorization: `Bearer ${this.accessToken}` } },
      );
      this.logger.info('whatsapp', 'sent template via wati', { to, templateName });
    } catch (err) {
      const ax = err as AxiosError;
      this.logger.error('whatsapp', 'wati template send failed', {
        to,
        templateName,
        status: ax.response?.status,
        url: ax.config?.url,
        responseBody: ax.response?.data,
        message: ax.message,
      });
      throw err;
    }
  }

  parseWebhook(payload: unknown): IncomingMessage | null {
    const body = payload as WatiWebhookPayload;
    if (body.owner === true) return null;
    if (body.type !== 'text' || !body.waId || !body.text) return null;

    const createdMs = this.messageCreatedMs(body);
    if (createdMs !== null && Date.now() - createdMs > MAX_MESSAGE_AGE_MS) {
      this.logger.warn('whatsapp', 'dropping stale wati webhook (likely replay)', {
        waId: body.waId,
        id: body.id,
        ageMs: Date.now() - createdMs,
      });
      return null;
    }

    const profileName = body.senderName?.trim() || undefined;
    return { from: body.waId, text: body.text, id: body.id, profileName };
  }

  private messageCreatedMs(body: WatiWebhookPayload): number | null {
    if (body.created) {
      const ms = Date.parse(body.created);
      if (!Number.isNaN(ms)) return ms;
    }
    if (body.timestamp) {
      const secs = Number(body.timestamp);
      if (Number.isFinite(secs) && secs > 0) return secs * 1000;
    }
    return null;
  }

  // Wati does not provide HMAC signatures on webhook payloads
  validateWebhookSignature(
    _raw: Buffer,
    _headers: Record<string, string | undefined>,
  ): boolean {
    return true;
  }

  async assignToHuman(conversationId: string): Promise<void> {
    try {
      await axios.post(
        `${this.baseUrl}/assignConversation/${conversationId}`,
        {},
        { headers: { Authorization: `Bearer ${this.accessToken}` } },
      );
      this.logger.info('whatsapp', 'assigned conversation to human via wati', { conversationId });
    } catch (err) {
      const ax = err as AxiosError;
      this.logger.error('whatsapp', 'wati assign failed', {
        conversationId,
        status: ax.response?.status,
        url: ax.config?.url,
        responseBody: ax.response?.data,
        message: ax.message,
      });
      throw err;
    }
  }
}
