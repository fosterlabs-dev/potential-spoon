import { Injectable } from '@nestjs/common';
import { AirtableRecord, AirtableService } from '../airtable/airtable.service';
import { LoggerService } from '../logger/logger.service';

export type HoldStatus = 'active' | 'expired' | 'converted' | 'cancelled';

type HoldFields = {
  phone: string;
  check_in: string;
  check_out: string;
  hold_created_at: string;
  hold_expires_at: string;
  reminder_sent: boolean;
  status: HoldStatus;
};

export type Hold = AirtableRecord<HoldFields>;

const HOLD_DAYS = 5;

@Injectable()
export class HoldsService {
  constructor(
    private readonly airtable: AirtableService,
    private readonly logger: LoggerService,
  ) {}

  async createHold(phone: string, checkIn: Date, checkOut: Date): Promise<Hold> {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + HOLD_DAYS * 24 * 60 * 60 * 1000);

    const fields: HoldFields = {
      phone,
      check_in: this.toIsoDate(checkIn),
      check_out: this.toIsoDate(checkOut),
      hold_created_at: now.toISOString(),
      hold_expires_at: expiresAt.toISOString(),
      reminder_sent: false,
      status: 'active',
    };

    const record = await this.airtable.create<HoldFields>('Holds', fields);
    this.logger.info('holds', 'hold created', {
      phone,
      checkIn: fields.check_in,
      checkOut: fields.check_out,
      expiresAt: fields.hold_expires_at,
    });
    return record;
  }

  async hasOverlap(checkIn: Date, checkOut: Date): Promise<boolean> {
    const active = await this.listActive();
    return active.some((h) => {
      if (h.fields.status !== 'active') return false;
      const hIn = new Date(h.fields.check_in);
      const hOut = new Date(h.fields.check_out);
      return hIn < checkOut && hOut > checkIn;
    });
  }

  async getActiveHoldForPhone(phone: string): Promise<Hold | null> {
    const rows = await this.airtable.list<HoldFields>('Holds', {
      filterByFormula: `AND({phone}='${phone}', {status}='active')`,
      maxRecords: 1,
    });
    return rows[0] ?? null;
  }

  async listActive(): Promise<Hold[]> {
    return this.airtable.list<HoldFields>('Holds', {
      filterByFormula: "{status}='active'",
    });
  }

  async setStatus(id: string, status: HoldStatus): Promise<void> {
    await this.airtable.update<HoldFields>('Holds', id, { status });
  }

  async setReminderSent(id: string): Promise<void> {
    await this.airtable.update<HoldFields>('Holds', id, { reminder_sent: true });
  }

  private toIsoDate(d: Date): string {
    return d.toISOString().slice(0, 10);
  }
}
