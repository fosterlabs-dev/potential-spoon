import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosError } from 'axios';
import { LoggerService } from '../logger/logger.service';

const GRAPH_API_BASE = 'https://graph.facebook.com/v20.0';
const RETRY_DELAY_MS = 500;

@Injectable()
export class WhatsappService {
  private readonly url: string;
  private readonly accessToken: string;

  constructor(
    config: ConfigService,
    private readonly logger: LoggerService,
  ) {
    const phoneId = config.get<string>('WHATSAPP_PHONE_NUMBER_ID');
    const token = config.get<string>('WHATSAPP_ACCESS_TOKEN');
    if (!phoneId || !token) {
      throw new Error(
        'WHATSAPP_PHONE_NUMBER_ID and WHATSAPP_ACCESS_TOKEN must be set',
      );
    }
    this.url = `${GRAPH_API_BASE}/${phoneId}/messages`;
    this.accessToken = token;
  }

  async sendMessage(to: string, text: string): Promise<void> {
    const payload = {
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body: text },
    };
    const headers = {
      Authorization: `Bearer ${this.accessToken}`,
      'Content-Type': 'application/json',
    };

    try {
      const res = await this.post(payload, headers);
      const id = res.data?.messages?.[0]?.id;
      this.logger.info('whatsapp', 'sent message', { to, id });
    } catch (err) {
      const ax = err as AxiosError<{ error?: { message?: string } }>;
      const status = ax.response?.status;
      this.logger.error('whatsapp', 'send failed', {
        to,
        status,
        error: ax.response?.data?.error?.message ?? ax.message,
      });
      throw err;
    }
  }

  private async post(
    payload: unknown,
    headers: Record<string, string>,
  ): Promise<{ data: { messages?: Array<{ id?: string }> } }> {
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
