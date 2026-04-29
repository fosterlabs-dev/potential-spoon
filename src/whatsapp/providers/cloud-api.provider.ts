import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosError } from 'axios';
import * as crypto from 'crypto';
import { LoggerService } from '../../logger/logger.service';
import { IncomingMessage, WhatsAppProvider } from './provider.interface';

const GRAPH_API_BASE = 'https://graph.facebook.com/v20.0';
const RETRY_DELAY_MS = 500;

type CloudApiPayload = {
  entry?: Array<{
    changes?: Array<{
      value?: {
        contacts?: Array<{
          wa_id?: string;
          profile?: { name?: string };
        }>;
        messages?: Array<{
          from?: string;
          id?: string;
          type?: string;
          text?: { body?: string };
        }>;
      };
    }>;
  }>;
};

@Injectable()
export class CloudApiProvider implements WhatsAppProvider {
  private readonly url: string;
  private readonly accessToken: string;
  private readonly appSecret: string;
  private readonly verifyToken: string;

  constructor(
    config: ConfigService,
    private readonly logger: LoggerService,
  ) {
    const phoneId = config.get<string>('WHATSAPP_PHONE_NUMBER_ID');
    const token = config.get<string>('WHATSAPP_ACCESS_TOKEN');
    if (!phoneId || !token) {
      throw new Error('WHATSAPP_PHONE_NUMBER_ID and WHATSAPP_ACCESS_TOKEN must be set');
    }
    this.url = `${GRAPH_API_BASE}/${phoneId}/messages`;
    this.accessToken = token;
    this.appSecret = config.get<string>('WHATSAPP_APP_SECRET') ?? '';
    this.verifyToken = config.get<string>('WHATSAPP_VERIFY_TOKEN') ?? '';
  }

  async sendMessage(to: string, text: string): Promise<void> {
    const payload = {
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body: text },
    };
    try {
      const res = await this.post(payload);
      const id = res.data?.messages?.[0]?.id;
      this.logger.info('whatsapp', 'sent message', { to, id });
    } catch (err) {
      const ax = err as AxiosError<{ error?: { message?: string } }>;
      this.logger.error('whatsapp', 'send failed', {
        to,
        status: ax.response?.status,
        error: ax.response?.data?.error?.message ?? ax.message,
      });
      throw err;
    }
  }

  async sendTemplate(
    to: string,
    templateName: string,
    vars: Record<string, string>,
  ): Promise<void> {
    const components = Object.keys(vars).length
      ? [
          {
            type: 'body',
            parameters: Object.values(vars).map((v) => ({ type: 'text', text: v })),
          },
        ]
      : [];
    const payload = {
      messaging_product: 'whatsapp',
      to,
      type: 'template',
      template: {
        name: templateName,
        language: { code: 'en' },
        components,
      },
    };
    try {
      const res = await this.post(payload);
      const id = res.data?.messages?.[0]?.id;
      this.logger.info('whatsapp', 'sent template', { to, templateName, id });
    } catch (err) {
      const ax = err as AxiosError<{ error?: { message?: string } }>;
      this.logger.error('whatsapp', 'template send failed', {
        to,
        templateName,
        status: ax.response?.status,
        error: ax.response?.data?.error?.message ?? ax.message,
      });
      throw err;
    }
  }

  parseWebhook(payload: unknown): IncomingMessage | null {
    const body = payload as CloudApiPayload;
    for (const entry of body.entry ?? []) {
      for (const change of entry.changes ?? []) {
        const contacts = change.value?.contacts ?? [];
        for (const msg of change.value?.messages ?? []) {
          if (msg.type === 'text' && msg.from && msg.text?.body) {
            const contact = contacts.find((c) => c.wa_id === msg.from);
            const profileName = contact?.profile?.name?.trim() || undefined;
            return {
              from: msg.from,
              text: msg.text.body,
              id: msg.id,
              profileName,
            };
          }
        }
      }
    }
    return null;
  }

  validateWebhookSignature(
    raw: Buffer,
    headers: Record<string, string | undefined>,
  ): boolean {
    const header = headers['x-hub-signature-256'];
    if (!header || !this.appSecret) return false;
    const expected =
      'sha256=' + crypto.createHmac('sha256', this.appSecret).update(raw).digest('hex');
    const expectedBuf = Buffer.from(expected);
    const givenBuf = Buffer.from(header);
    if (expectedBuf.length !== givenBuf.length) return false;
    return crypto.timingSafeEqual(expectedBuf, givenBuf);
  }

  verifyWebhook(mode: string, token: string, challenge: string): string {
    if (mode !== 'subscribe' || token !== this.verifyToken) {
      throw new Error('verification failed');
    }
    return challenge;
  }

  private async post(
    payload: unknown,
  ): Promise<{ data: { messages?: Array<{ id?: string }> } }> {
    const headers = {
      Authorization: `Bearer ${this.accessToken}`,
      'Content-Type': 'application/json',
    };
    try {
      return await axios.post(this.url, payload, { headers });
    } catch (err) {
      const ax = err as AxiosError;
      if (ax.response?.status === 429) {
        this.logger.warn('whatsapp', 'rate limited, retrying once', {
          delayMs: RETRY_DELAY_MS,
        });
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
        return await axios.post(this.url, payload, { headers });
      }
      throw err;
    }
  }
}
