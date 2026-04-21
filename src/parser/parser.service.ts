import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import { LoggerService } from '../logger/logger.service';

export type Intent =
  | 'availability_check'
  | 'pricing_check'
  | 'greeting'
  | 'handoff_request'
  | 'unknown';

export type ParseResult = {
  intent: Intent;
  checkIn: Date | null;
  checkOut: Date | null;
  guests: number | null;
};

const SYSTEM_PROMPT = `You parse short WhatsApp messages from prospective guests into structured data.

Return ONLY a JSON object with these keys (no prose, no code fences):
- intent: one of "availability_check" | "pricing_check" | "greeting" | "handoff_request" | "unknown"
- checkIn: ISO date "YYYY-MM-DD" or null
- checkOut: ISO date "YYYY-MM-DD" or null (exclusive — the guest's departure date)
- guests: integer or null

Rules:
- If the message asks if a date range is free, intent = "availability_check".
- If the message only asks for prices without specific dates, intent = "pricing_check".
- If the guest seems to want a human, intent = "handoff_request".
- If you cannot confidently extract intent, return "unknown" with nulls.
- Never invent dates or guest counts. If absent, return null.`;

const UNKNOWN: ParseResult = {
  intent: 'unknown',
  checkIn: null,
  checkOut: null,
  guests: null,
};

const VALID_INTENTS: readonly Intent[] = [
  'availability_check',
  'pricing_check',
  'greeting',
  'handoff_request',
  'unknown',
];

@Injectable()
export class ParserService {
  private readonly client: Anthropic;
  private readonly model: string;

  constructor(
    config: ConfigService,
    private readonly logger: LoggerService,
  ) {
    const apiKey = config.get<string>('ANTHROPIC_API_KEY');
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY must be set');
    this.client = new Anthropic({ apiKey });
    this.model =
      config.get<string>('CLAUDE_MODEL') ?? 'claude-haiku-4-5-20251001';
  }

  async parse(message: string): Promise<ParseResult> {
    let raw: string;
    try {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: 512,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: message }],
      });
      const block = response.content[0];
      raw = block && block.type === 'text' ? block.text : '';
    } catch (err) {
      this.logger.error('parser', 'Claude API call failed', {
        error: (err as Error).message,
      });
      throw err;
    }

    return this.coerce(raw, message);
  }

  private coerce(raw: string, originalMessage: string): ParseResult {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      this.logger.warn('parser', 'Claude returned non-JSON output', {
        raw,
        message: originalMessage,
      });
      return UNKNOWN;
    }

    if (!parsed || typeof parsed !== 'object') return UNKNOWN;
    const p = parsed as Record<string, unknown>;

    const intent = VALID_INTENTS.includes(p.intent as Intent)
      ? (p.intent as Intent)
      : 'unknown';

    const checkIn = this.toDate(p.checkIn);
    const checkOut = this.toDate(p.checkOut);
    const guests = typeof p.guests === 'number' ? p.guests : null;

    if (intent !== 'unknown' && !checkIn && !checkOut && guests === null) {
      return UNKNOWN;
    }

    return { intent, checkIn, checkOut, guests };
  }

  private toDate(value: unknown): Date | null {
    if (typeof value !== 'string') return null;
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
}
