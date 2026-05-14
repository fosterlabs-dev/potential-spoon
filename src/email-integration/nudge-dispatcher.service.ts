import { Injectable } from '@nestjs/common';
import { AirtableService } from '../airtable/airtable.service';
import { LoggerService } from '../logger/logger.service';
import { NotificationsService } from '../notifications/notifications.service';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import { NudgeKey } from './subject-matcher';

type ConversationFields = {
  phone?: string;
  email?: string;
  customer_name?: string;
};

export type DispatchInput = {
  key: NudgeKey;
  guestEmail: string;
  subject: string;
  messageId: string;
};

export type DispatchResult =
  | { status: 'sent'; phone: string; key: NudgeKey }
  | { status: 'unmatched_guest'; email: string };

@Injectable()
export class NudgeDispatcherService {
  constructor(
    private readonly airtable: AirtableService,
    private readonly whatsapp: WhatsappService,
    private readonly notifications: NotificationsService,
    private readonly logger: LoggerService,
  ) {}

  async dispatch(input: DispatchInput): Promise<DispatchResult> {
    const email = input.guestEmail.trim().toLowerCase();
    if (!email) {
      this.logger.warn('email-integration', 'dispatch called with empty guestEmail', input);
      return { status: 'unmatched_guest', email: '' };
    }

    const safe = email.replace(/'/g, "\\'");
    const rows = await this.airtable.list<ConversationFields>('Conversations', {
      filterByFormula: `LOWER({email})='${safe}'`,
      maxRecords: 1,
    });
    const conv = rows[0];

    if (!conv?.fields?.phone) {
      this.logger.warn('email-integration', 'unmatched guest for SuperControl email', {
        email,
        subject: input.subject,
        key: input.key,
        messageId: input.messageId,
      });
      await this.notifications
        .notifyOwner(
          `Unmatched SuperControl email — no Conversations row with email "${email}". Subject: "${input.subject}".`,
          { reason: 'unmatched_guest', extra: { key: input.key, messageId: input.messageId } },
        )
        .catch(() => undefined);
      return { status: 'unmatched_guest', email };
    }

    const phone = conv.fields.phone;
    const name = (conv.fields.customer_name ?? '').trim() || 'there';

    // sendTemplate, not sendMessage: nudges fire outside the 24h CSW and
    // Meta will reject freeform text with error 131047. The template name
    // equals the NudgeKey by design — Jim's Meta templates use the same
    // identifiers. `{{1}}` is the guest name on every approved template.
    await this.whatsapp.sendTemplate(phone, input.key, { '1': name }, { override: true });

    this.logger.info('email-integration', 'sent SuperControl nudge', {
      key: input.key,
      phone,
      name,
      subject: input.subject,
      messageId: input.messageId,
    });

    return { status: 'sent', phone, key: input.key };
  }
}
