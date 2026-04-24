import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import { LoggerService } from '../logger/logger.service';
import { TemplatesService } from '../templates/templates.service';

const SCENARIO_LABELS: Record<string, string> = {
  greeting_ask_dates: 'Guest made first contact without providing dates — ask for their dates politely',
  dates_unclear_ask_clarify: 'Guest gave vague dates — ask for specific Sunday check-in and check-out',
  dates_not_sunday_to_sunday: 'Guest gave non-Sunday dates — explain Sunday changeovers and suggest the corrected dates',
  minimum_stay_not_met: 'Guest requested fewer than 7 nights — explain minimum stay and suggest a full week',
  availability_yes_quote: 'Dates are available — confirm and quote the price',
  availability_no_handoff: 'Dates are already reserved — let the guest know and offer to look at alternatives',
  availability_subject_to_confirmation: 'Availability looks likely but needs final confirmation',
  hold_offer_post_quote: 'Offer to hold the dates for 5 days',
  hold_confirmed: 'Confirm the date hold has been placed',
  hold_reminder: 'Remind the guest their hold expires tomorrow',
  hold_expired: 'Let the guest know their hold has expired and the dates are released',
  booking_confirmed_handoff: 'Guest wants to book — ask for their email address to proceed',
  booking_confirmed_instant_book: 'Guest wants to book — direct them to complete it on the website',
  faq_unknown_handoff: 'Question outside knowledge base — acknowledge and say you will come back shortly',
  year_2026_redirect: '2026 dates requested — 2026 is fully booked, offer to look at 2027',
  long_stay_manual_pricing: 'Long stay Oct-May requested — pricing is individual, say you will come back with a quote',
  discount_request: 'Guest asked for a discount — handle gracefully, say you will look into it',
  group_size_confirmation: 'Confirm the house works for the group and offer to check availability',
  followup_24h: '24h follow-up nudge — dates still available, offer to pencil them in',
  followup_7d: '7-day follow-up — gentle final check-in',
  human_request_handoff: 'Guest asked to speak to a person — Jim will be in touch shortly',
  complaint_handoff: 'Guest expressed frustration — Jim will reach out personally',
  unclear_handoff: 'Message was unclear — acknowledge and say you will come back shortly',
};

const SYSTEM_PROMPT = `You are writing WhatsApp replies on behalf of Jim, owner of Bonté Maison (premium rental villa near Duras, south-west France).

This is a live WhatsApp chat — write like a real person continuing a conversation, not like an email.

Tone: warm, premium, human, confident but never pushy. Use "reserved" not "sold" or "taken."

Conversation flow rules:
- Do NOT open with "Hi", "Hithere", "Hello", or any greeting — you are mid-conversation
- Do NOT open with "Thanks for getting in touch", "Thank you for your message", or any thank-you preamble
- Do NOT sign off with "Jim", "Thanks\\nJim", "Kind regards", or similar — WhatsApp replies don't need sign-offs
- Do NOT append www.bontemaison.com unless the scenario specifically calls for sharing the website
- The ONLY exception is the very first reply in a brand-new conversation (scenario: greeting_ask_dates) — there a brief warm opening is fine, but still no formal sign-off
- Get straight to the point, keep it short (2–4 sentences max), end with a natural open question or next step

Absolute rules:
- Never offer or agree to discounts
- Never suggest specific alternative dates yourself
- Never invent facts about the property
- Never quote a price not explicitly given in the context
- Never promise availability beyond what is confirmed in the context
- Plain text only — no markdown, no asterisks, no bullet points`;

@Injectable()
export class ResponseService {
  private readonly mode: 'template' | 'generate';
  private readonly client: Anthropic | null = null;
  private readonly model: string;

  constructor(
    private readonly templates: TemplatesService,
    private readonly logger: LoggerService,
    config: ConfigService,
  ) {
    this.mode =
      config.get<string>('RESPONSE_MODE') === 'generate'
        ? 'generate'
        : 'template';
    this.model =
      config.get<string>('CLAUDE_RESPONSE_MODEL') ?? 'claude-sonnet-4-6';

    if (this.mode === 'generate') {
      const apiKey = config.get<string>('ANTHROPIC_API_KEY');
      if (!apiKey) throw new Error('ANTHROPIC_API_KEY must be set');
      this.client = new Anthropic({ apiKey });
      this.logger.info('response', `generate mode active (${this.model})`);
    }
  }

  async render(key: string): Promise<string> {
    if (this.mode === 'generate' && this.client) {
      return this.generate(key);
    }
    return this.templates.render(key);
  }

  private async generate(key: string): Promise<string> {
    let examples: string[] = [];
    try {
      examples = await this.templates.fetchRaw(key);
    } catch {
      // style examples are best-effort
    }

    const prompt = this.buildPrompt(key, examples);

    try {
      const response = await this.client!.messages.create({
        model: this.model,
        max_tokens: 512,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: prompt }],
      });
      const block = response.content[0];
      const text = block?.type === 'text' ? block.text.trim() : '';
      if (!text) throw new Error('empty response');
      this.logger.info('response', 'generated', { key });
      return text;
    } catch (err) {
      this.logger.warn('response', 'generate failed, falling back to template', {
        key,
        error: (err as Error).message,
      });
      return this.templates.render(key);
    }
  }

  private buildPrompt(key: string, examples: string[]): string {
    const parts: string[] = [];

    if (examples.length > 0) {
      const capped = examples.slice(0, 3);
      const exampleBlock = capped
        .map((t, i) => `Example ${i + 1}:\n${t}`)
        .join('\n\n');
      parts.push(
        `Style examples from Jim's actual replies for this scenario (use these ONLY to calibrate warmth and vocabulary — do NOT copy their structure, greetings, or sign-offs. The examples are formal email-style; your reply must be mid-chat WhatsApp style with no "Hi"/"Thanks for getting in touch" opener and no "Jim" sign-off):\n\n${exampleBlock}`,
      );
    }

    const scenario = SCENARIO_LABELS[key] ?? `Handle scenario: ${key}`;
    parts.push(`Scenario: ${scenario}`);

    parts.push('Write Jim\'s WhatsApp reply. Plain text only.');

    return parts.join('\n\n');
  }
}
