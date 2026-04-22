import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  HttpCode,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import type { Request } from 'express';
import { LoggerService } from '../logger/logger.service';
import { MessageHandlerService } from '../orchestrator/message-handler.service';

type IncomingMessage = { from: string; text: string; id?: string };

type WebhookPayload = {
  entry?: Array<{
    changes?: Array<{
      value?: {
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

type RawRequest = Request & { rawBody?: Buffer };

@Controller('webhook')
export class WhatsappController {
  constructor(
    private readonly config: ConfigService,
    private readonly logger: LoggerService,
    private readonly handler: MessageHandlerService,
  ) {}

  @Get()
  verify(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') token: string,
    @Query('hub.challenge') challenge: string,
  ): string {
    const expected = this.config.get<string>('WHATSAPP_VERIFY_TOKEN');
    if (mode === 'subscribe' && expected && token === expected) {
      this.logger.info('whatsapp', 'webhook verified');
      return challenge;
    }
    this.logger.warn('whatsapp', 'webhook verification rejected', { mode });
    throw new ForbiddenException();
  }

  @Post()
  @HttpCode(200)
  async receive(
    @Req() req: RawRequest,
    @Headers('x-hub-signature-256') signature: string | undefined,
    @Body() body: WebhookPayload,
  ): Promise<{ status: 'ok' }> {
    const raw = req.rawBody;
    if (!raw || !this.isValidSignature(raw, signature)) {
      this.logger.warn('whatsapp', 'dropping webhook: invalid signature', {
        hasRaw: Boolean(raw),
        hasSignature: Boolean(signature),
      });
      return { status: 'ok' };
    }

    const messages = this.extractMessages(body);
    for (const m of messages) {
      this.logger.info('whatsapp', 'received message', {
        from: m.from,
        text: m.text,
        id: m.id,
      });
      try {
        await this.handler.handle({ from: m.from, text: m.text });
      } catch (err) {
        this.logger.error('whatsapp', 'handler threw; swallowed to keep 200', {
          from: m.from,
          error: (err as Error).message,
        });
      }
    }

    return { status: 'ok' };
  }

  private isValidSignature(raw: Buffer, header: string | undefined): boolean {
    if (!header) return false;
    const secret = this.config.get<string>('WHATSAPP_APP_SECRET');
    if (!secret) return false;

    const expected =
      'sha256=' +
      crypto.createHmac('sha256', secret).update(raw).digest('hex');
    const expectedBuf = Buffer.from(expected);
    const givenBuf = Buffer.from(header);
    if (expectedBuf.length !== givenBuf.length) return false;
    return crypto.timingSafeEqual(expectedBuf, givenBuf);
  }

  private extractMessages(body: WebhookPayload): IncomingMessage[] {
    const out: IncomingMessage[] = [];
    for (const entry of body.entry ?? []) {
      for (const change of entry.changes ?? []) {
        for (const msg of change.value?.messages ?? []) {
          if (msg.type === 'text' && msg.from && msg.text?.body) {
            out.push({ from: msg.from, text: msg.text.body, id: msg.id });
          }
        }
      }
    }
    return out;
  }
}
