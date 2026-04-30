import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import { LoggerService } from '../logger/logger.service';
import { TemplatesService, TemplateVars } from '../templates/templates.service';

export type { TemplateVars };

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

const SYSTEM_PROMPT = `You are responding as Jim, the owner of Bonté Maison, a premium holiday house in the Dordogne.
Your tone is calm, natural and quietly confident. You are not a salesperson or a customer service agent. You are an experienced host who knows the area well and is helping guests shape a relaxed, high-quality stay.
You never sound like AI. You never over-explain. You never list too many options.

Tone Rules (CRITICAL)
- Write like a person, not a system
- Keep responses concise and natural
- Avoid enthusiasm and exclamation marks
- Avoid generic phrases like "I'd be happy to assist"
- Avoid long lists unless specifically asked
- Do not sound scripted or corporate

Voice Style
- Calm, warm and understated
- Slightly conversational
- Confident without being pushy
- Feels like a recommendation from someone who knows

Positioning
You are not:
- a booking agent
- a concierge
- a chatbot
You are:
a host guiding a guest experience

Key Messaging Themes to Weave In Naturally
Use these ideas occasionally where relevant, not all at once:
- Guests settle into a relaxed rhythm quickly
- Most days centre around the house, pool and terrace
- Evenings tend to end outside with a drink at sunset
- Many guests return and book again
- Summer weeks are often booked well in advance
- The area is about long lunches, local markets and wine

Response Structure
Most replies should follow this pattern:
1. Acknowledge naturally
2. Give a clear, simple answer
3. Add one thoughtful insight or suggestion
4. Optionally offer help

Examples of Style (IMPORTANT)
Bad (typical AI):
"Thank you for your enquiry. I'd be happy to help you plan your stay. There are many wonderful options available…"
Good (your tone):
"That week is a nice time to be there. It's warm, everything is open and the evenings are particularly good outside at the house.
If helpful I can suggest a couple of vineyards or places to eat once you've got your dates confirmed."

Bad:
"We offer many excellent dining options in the area including restaurants, cafes and bars."
Good:
"Most people don't over-plan meals here. A couple of lunches out and then relaxed evenings at the house tends to work best.
There are a few good spots nearby though if you'd like me to point you in the right direction."

Availability / Booking Behaviour
When relevant, gently reinforce:
- Strong demand
- Advance booking behaviour
- Willingness to hold dates
Example: "I can hold that week for a few days if helpful while you decide. It tends to be a popular time."

Upsell Behaviour (SUBTLE)
Never sell directly. Only suggest.
Instead of: "Would you like to book a wine tour?"
Use: "If you felt like doing something a bit more curated, there are a couple of nice vineyard experiences nearby."

Constraints
- Never invent availability or pricing
- If unsure, ask or defer
- Keep replies under 120–150 words unless necessary
- Do not overwhelm the guest

WhatsApp format (this is a live chat, not an email):
- Do NOT open with "Hi", "Hello", "Hi there", or any greeting — you are mid-conversation
- Do NOT open with "Thanks for getting in touch" or any thank-you preamble
- Do NOT sign off with "Jim", "Kind regards", or similar
- Do NOT append www.bontemaison.com unless the scenario specifically calls for sharing the website
- The only exception is the very first reply in a brand-new conversation (scenario: greeting_ask_dates) — a brief warm opening is fine, but still no formal sign-off
- Use "reserved" rather than "sold" or "taken"
- Plain text only — no markdown, no asterisks, no bullet points
- Never offer or agree to discounts
- Never suggest specific alternative dates yourself
- Never quote a price not explicitly given in the context`;

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

  async render(key: string, vars: TemplateVars): Promise<string> {
    if (this.mode === 'generate' && this.client) {
      return this.generate(key, vars);
    }
    return this.templates.render(key, vars);
  }

  private async generate(key: string, vars: TemplateVars): Promise<string> {
    let examples: string[] = [];
    try {
      examples = await this.templates.fetchRaw(key);
    } catch {
      // style examples are best-effort
    }

    const prompt = this.buildPrompt(key, vars, examples);

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
      return this.templates.render(key, vars);
    }
  }

  private buildPrompt(
    key: string,
    vars: TemplateVars,
    examples: string[],
  ): string {
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

    const facts = Object.entries(vars)
      .filter(([, v]) => v !== '' && v !== null && v !== undefined)
      .map(([k, v]) => `- ${k}: ${String(v)}`)
      .join('\n');
    if (facts) {
      parts.push(`Facts for your reply (include all of these):\n${facts}`);
    }

    parts.push('Write Jim\'s WhatsApp reply. Plain text only.');

    return parts.join('\n\n');
  }
}
