import { Injectable } from '@nestjs/common';
import { AirtableRecord, AirtableService } from '../airtable/airtable.service';
import { LoggerService } from '../logger/logger.service';

export type FollowUpStatus = 'pending' | 'sent_24h' | 'completed' | 'cancelled';

export type FollowUpFields = {
  phone: string;
  quote_sent_at: string;
  status: FollowUpStatus;
  created_at: string;
  updated_at: string;
};

export type FollowUp = AirtableRecord<FollowUpFields>;

@Injectable()
export class FollowUpsService {
  constructor(
    private readonly airtable: AirtableService,
    private readonly logger: LoggerService,
  ) {}

  async schedule(phone: string, quoteSentAt: Date = new Date()): Promise<FollowUp> {
    // Cancel any existing open sequence so we only ever track the latest quote.
    await this.cancel(phone);

    const now = new Date().toISOString();
    const fields: FollowUpFields = {
      phone,
      quote_sent_at: quoteSentAt.toISOString(),
      status: 'pending',
      created_at: now,
      updated_at: now,
    };
    const record = await this.airtable.create<FollowUpFields>('FollowUps', fields);
    this.logger.info('follow-ups', 'scheduled', { phone, quoteSentAt: fields.quote_sent_at });
    return record;
  }

  async cancel(phone: string): Promise<void> {
    const open = await this.listOpenForPhone(phone);
    for (const row of open) {
      await this.airtable.update<FollowUpFields>('FollowUps', row.id, {
        status: 'cancelled',
        updated_at: new Date().toISOString(),
      });
    }
    if (open.length > 0) {
      this.logger.info('follow-ups', 'cancelled open sequences', { phone, count: open.length });
    }
  }

  async listDue(): Promise<FollowUp[]> {
    const rows = await this.airtable.list<FollowUpFields>('FollowUps');
    return rows.filter((r) => r.fields.status === 'pending' || r.fields.status === 'sent_24h');
  }

  async markSent24h(id: string): Promise<void> {
    await this.airtable.update<FollowUpFields>('FollowUps', id, {
      status: 'sent_24h',
      updated_at: new Date().toISOString(),
    });
  }

  async markCompleted(id: string): Promise<void> {
    await this.airtable.update<FollowUpFields>('FollowUps', id, {
      status: 'completed',
      updated_at: new Date().toISOString(),
    });
  }

  private async listOpenForPhone(phone: string): Promise<FollowUp[]> {
    const rows = await this.airtable.list<FollowUpFields>('FollowUps', {
      filterByFormula: `{phone}='${phone}'`,
    });
    return rows.filter((r) => r.fields.status === 'pending' || r.fields.status === 'sent_24h');
  }
}
