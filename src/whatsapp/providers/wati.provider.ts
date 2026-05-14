import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosError } from 'axios';
import { LoggerService } from '../../logger/logger.service';
import {
  IncomingMessage,
  OutboundEcho,
  SendResult,
  WhatsAppProvider,
} from './provider.interface';

// Wati webhook body shape (inbound message + outbound echo events).
// `whatsappMessageId` is the canonical Meta wamid; `id` is WATI's internal
// record id and differs per WATI channel even for the same underlying
// WhatsApp message — prefer the wamid for dedup.
type WatiWebhookPayload = {
  waId?: string;
  text?: string;
  id?: string;
  whatsappMessageId?: string;
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
    // Accept either "eyJ..." or "Bearer eyJ..." — we add the prefix ourselves
    // when building the Authorization header, so strip it here if present.
    this.accessToken = token.replace(/^Bearer\s+/i, '').trim();
  }

  async sendMessage(to: string, text: string): Promise<SendResult> {
    try {
      const res = await axios.post(
        `${this.baseUrl}/sendSessionMessage/${to}`,
        {},
        {
          params: { messageText: text },
          headers: { Authorization: `Bearer ${this.accessToken}` },
        },
      );
      this.logger.debug('whatsapp', 'wati sendSessionMessage raw response', {
        to,
        data: res.data,
      });
      const id = this.extractMessageId(res.data);
      this.logger.info('whatsapp', 'sent message via wati', { to, id });
      return { id };
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
  ): Promise<SendResult> {
    const parameters = Object.entries(vars).map(([name, value]) => ({ name, value }));
    try {
      const res = await axios.post(
        `${this.baseUrl}/sendTemplateMessage`,
        {
          whatsappNumber: to,
          template_name: templateName,
          broadcast_name: templateName,
          parameters,
        },
        { headers: { Authorization: `Bearer ${this.accessToken}` } },
      );
      this.logger.debug('whatsapp', 'wati sendTemplateMessage raw response', {
        to,
        templateName,
        data: res.data,
      });
      const id = this.extractMessageId(res.data);
      this.logger.info('whatsapp', 'sent template via wati', {
        to,
        templateName,
        id,
      });
      return { id };
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

  private extractMessageId(data: unknown): string | undefined {
    if (!data || typeof data !== 'object') return undefined;
    const obj = data as Record<string, unknown>;
    // Observed WATI send response: { ok, result, message: { whatsappMessageId, id, ... } }
    // Prefer the wamid — the echo webhook reports the same value, so dedup
    // works across channels and matches bot-vs-manual replies correctly.
    const message = obj.message;
    if (message && typeof message === 'object') {
      const msg = message as Record<string, unknown>;
      if (typeof msg.whatsappMessageId === 'string') return msg.whatsappMessageId;
      if (typeof msg.id === 'string') return msg.id;
    }
    if (typeof obj.whatsappMessageId === 'string') return obj.whatsappMessageId;
    if (typeof obj.id === 'string') return obj.id;
    if (typeof obj.messageId === 'string') return obj.messageId;
    return undefined;
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
    // Prefer wamid so dedup catches cross-channel duplicate deliveries.
    const id = body.whatsappMessageId ?? body.id;
    return { from: body.waId, text: body.text, id, profileName };
  }

  parseOutboundEcho(payload: unknown): OutboundEcho | null {
    const body = payload as WatiWebhookPayload;
    if (body.owner !== true) return null;
    if (body.type !== 'text' || !body.waId || !body.text) return null;

    const createdMs = this.messageCreatedMs(body);
    if (createdMs !== null && Date.now() - createdMs > MAX_MESSAGE_AGE_MS) {
      this.logger.warn('whatsapp', 'dropping stale wati echo webhook (likely replay)', {
        waId: body.waId,
        id: body.id,
        ageMs: Date.now() - createdMs,
      });
      return null;
    }

    // Prefer wamid: the bot's own send response and its echo share this id,
    // so wasRecentlySentByBot can tell bot echoes apart from manual replies.
    const id = body.whatsappMessageId ?? body.id;
    return { to: body.waId, text: body.text, id };
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
