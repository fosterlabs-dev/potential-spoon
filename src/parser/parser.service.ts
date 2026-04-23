import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import { LoggerService } from '../logger/logger.service';

export type Intent =
  | 'greeting'
  | 'availability_inquiry'
  | 'pricing_inquiry'
  | 'general_info'
  | 'booking_confirmation'
  | 'human_request'
  | 'complaint_or_frustration'
  | 'off_topic_or_unclear';

export type HistoryMessage = {
  role: 'customer' | 'assistant';
  text: string;
};

export type ParseResult = {
  intent: Intent;
  confidence: number;
  customerName: string | null;
  checkIn: Date | null;
  checkOut: Date | null;
  guests: number | null;
  mentionsDiscount: boolean;
  highIntentSignal: boolean;
};

const SYSTEM_PROMPT = `You parse short WhatsApp messages from prospective guests of a rental property into structured data.

Return ONLY a JSON object with these keys (no prose, no code fences):
- intent: one of
  - "greeting" — the guest just said hi / introduced themselves / opened the conversation without a question
  - "availability_inquiry" — asks whether specific dates are free, or asks about availability in general
  - "pricing_inquiry" — asks about prices, rates, cost, or a quote
  - "general_info" — asks a factual question about the property, location, amenities, check-in time, etc.
  - "booking_confirmation" — explicitly confirms they want to proceed with a booking they've already discussed (e.g. "yes let's book those dates", "confirmed", "I'll pay now"). NOT a first-contact "I'd like to book the villa" — that's a greeting or availability_inquiry depending on whether they gave dates.
  - "human_request" — explicitly asks to talk to a person, the owner, or a human
  - "complaint_or_frustration" — is upset, frustrated, complaining, or expressing dissatisfaction
  - "off_topic_or_unclear" — anything else you cannot classify confidently
- confidence: number from 0 to 1 indicating how confident you are in the intent classification
- customerName: the guest's name if they introduced themselves (e.g. "Hi I'm Maria"), otherwise null
- checkIn: ISO date "YYYY-MM-DD" or null
- checkOut: ISO date "YYYY-MM-DD" or null (exclusive — the guest's departure date)
- guests: integer or null
- mentionsDiscount: true if the guest asks for a discount, special rate, or tries to negotiate the price
- highIntentSignal: true if the message suggests readiness to book (e.g. "this looks great", multiple questions, "we'd like to come", expressing enthusiasm, asking about payment or deposits)

Rules:
- Use the recent conversation history (if provided) to disambiguate references like "those dates" or "yes".
- Never invent dates or guest counts. If absent from both the message and recent context, return null.
- If dates appear only as month names or rough phrases ("this summer", "next month"), still set intent correctly but leave dates null.
- If you cannot confidently classify, use "off_topic_or_unclear" with confidence <= 0.5.`;

const UNKNOWN: ParseResult = {
  intent: 'off_topic_or_unclear',
  confidence: 0,
  customerName: null,
  checkIn: null,
  checkOut: null,
  guests: null,
  mentionsDiscount: false,
  highIntentSignal: false,
};

const VALID_INTENTS: readonly Intent[] = [
  'greeting',
  'availability_inquiry',
  'pricing_inquiry',
  'general_info',
  'booking_confirmation',
  'human_request',
  'complaint_or_frustration',
  'off_topic_or_unclear',
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

  async parse(
    message: string,
    history: HistoryMessage[] = [],
  ): Promise<ParseResult> {
    const userContent = this.buildUserContent(message, history);

    let raw: string;
    try {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: 512,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userContent }],
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

  private buildUserContent(
    message: string,
    history: HistoryMessage[],
  ): string {
    if (history.length === 0) return `New message: ${message}`;
    const lines = history.map(
      (h) => `${h.role === 'customer' ? 'Customer' : 'Assistant'}: ${h.text}`,
    );
    return `Recent conversation:\n${lines.join('\n')}\n\nNew message: ${message}`;
  }

  private coerce(raw: string, originalMessage: string): ParseResult {
    const candidate = this.extractJson(raw);
    let parsed: unknown;
    try {
      parsed = JSON.parse(candidate);
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
      : 'off_topic_or_unclear';

    const confidence =
      typeof p.confidence === 'number' && p.confidence >= 0 && p.confidence <= 1
        ? p.confidence
        : 0;

    const customerName =
      typeof p.customerName === 'string' && p.customerName.trim().length > 0
        ? p.customerName.trim()
        : null;

    const checkIn = this.toDate(p.checkIn);
    const checkOut = this.toDate(p.checkOut);
    const guests = typeof p.guests === 'number' ? p.guests : null;
    const mentionsDiscount = p.mentionsDiscount === true;
    const highIntentSignal = p.highIntentSignal === true;

    return {
      intent,
      confidence,
      customerName,
      checkIn,
      checkOut,
      guests,
      mentionsDiscount,
      highIntentSignal,
    };
  }

  private toDate(value: unknown): Date | null {
    if (typeof value !== 'string') return null;
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  private extractJson(raw: string): string {
    const fenced = raw.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    if (fenced) return fenced[1].trim();
    const braced = raw.match(/\{[\s\S]*\}/);
    return braced ? braced[0] : raw;
  }
}
