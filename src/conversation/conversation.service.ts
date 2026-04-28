import { Injectable } from '@nestjs/common';
import { AirtableService } from '../airtable/airtable.service';
import { LoggerService } from '../logger/logger.service';

export type ConversationStatus = 'bot' | 'human' | 'paused';

export type LifecycleStatus =
  | 'New'
  | 'Responded'
  | 'Follow-up'
  | 'Booked'
  | 'Lost';

export type AvailabilityResult = 'available' | 'unavailable' | 'pending';

export type PendingDates = {
  checkIn?: string | null;
  checkOut?: string | null;
  guests?: number | null;
};

export type ConversationState = {
  status: ConversationStatus;
  lifecycleStatus: LifecycleStatus;
  lastIntent: string | null;
  pendingDates: PendingDates | null;
  customerName: string | null;
};

export type ParsedCommand =
  | { command: 'release'; phone?: string }
  | { command: 'pause'; phone?: string; minutes?: number }
  | { command: 'resume'; phone?: string }
  | { command: 'status'; phone?: string };

type ConversationFields = {
  phone?: string;
  pause_status?: ConversationStatus;
  pause_until?: string;
  status?: LifecycleStatus;
  last_activity?: string;
  last_intent?: string;
  pending_dates?: string;
  customer_name?: string;
  email?: string;
  dates_requested?: string;
  price_quoted?: number;
  availability_result?: AvailabilityResult;
  follow_up_count?: number;
  follow_up_24h_sent?: boolean;
  follow_up_7d_sent?: boolean;
  enquiry_source?: string;
  notes?: string;
};

const COMMAND_NAMES = ['release', 'pause', 'resume', 'status'] as const;
type CommandName = (typeof COMMAND_NAMES)[number];

const DEFAULT_STATE: ConversationState = {
  status: 'bot',
  lifecycleStatus: 'New',
  lastIntent: null,
  pendingDates: null,
  customerName: null,
};

@Injectable()
export class ConversationService {
  constructor(
    private readonly airtable: AirtableService,
    private readonly logger: LoggerService,
  ) {}

  async getStatus(phone: string): Promise<ConversationStatus> {
    const row = await this.findRow(phone);
    if (!row) return 'bot';

    const f = row.fields;
    if (f.pause_status === 'paused' && f.pause_until) {
      if (new Date(f.pause_until).getTime() < Date.now()) return 'bot';
    }
    return f.pause_status ?? 'bot';
  }

  async getState(phone: string): Promise<ConversationState> {
    const row = await this.findRow(phone);
    if (!row) return DEFAULT_STATE;

    const f = row.fields;
    const effectiveStatus: ConversationStatus =
      f.pause_status === 'paused' &&
      f.pause_until &&
      new Date(f.pause_until).getTime() < Date.now()
        ? 'bot'
        : (f.pause_status ?? 'bot');

    return {
      status: effectiveStatus,
      lifecycleStatus: f.status ?? 'New',
      lastIntent: f.last_intent ?? null,
      pendingDates: this.parsePending(f.pending_dates),
      customerName: f.customer_name ?? null,
    };
  }

  async canSendBot(phone: string): Promise<boolean> {
    return (await this.getStatus(phone)) === 'bot';
  }

  async setStatus(
    phone: string,
    status: ConversationStatus,
    options: { pauseForMinutes?: number } = {},
  ): Promise<void> {
    const fields: ConversationFields = {
      phone,
      pause_status: status,
      last_activity: new Date().toISOString(),
    };
    if (options.pauseForMinutes !== undefined) {
      fields.pause_until = new Date(
        Date.now() + options.pauseForMinutes * 60_000,
      ).toISOString();
    }
    await this.upsert(phone, fields);
    this.logger.info('conversation', 'pause status updated', { phone, status });
  }

  async setLifecycleStatus(
    phone: string,
    status: LifecycleStatus,
  ): Promise<void> {
    await this.upsert(phone, {
      phone,
      status,
      last_activity: new Date().toISOString(),
    });
    this.logger.info('conversation', 'lifecycle status updated', {
      phone,
      status,
    });
  }

  async recordQuote(
    phone: string,
    datesRequested: string,
    priceQuoted: number,
    availabilityResult: AvailabilityResult,
  ): Promise<void> {
    await this.upsert(phone, {
      phone,
      dates_requested: datesRequested,
      price_quoted: priceQuoted,
      availability_result: availabilityResult,
      last_activity: new Date().toISOString(),
    });
  }

  async recordEmail(phone: string, email: string): Promise<void> {
    await this.upsert(phone, {
      phone,
      email,
      last_activity: new Date().toISOString(),
    });
  }

  async markFollowUpSent(phone: string, stage: '24h' | '7d'): Promise<void> {
    const row = await this.findRow(phone);
    const current =
      (row?.fields.follow_up_count as number | undefined) ?? 0;
    const patch: ConversationFields = {
      phone,
      follow_up_count: current + 1,
      last_activity: new Date().toISOString(),
    };
    if (stage === '24h') patch.follow_up_24h_sent = true;
    else patch.follow_up_7d_sent = true;
    await this.upsert(phone, patch);
  }

  async updateContext(
    phone: string,
    patch: {
      lastIntent?: string;
      pendingDates?: PendingDates | null;
      customerName?: string | null;
    },
  ): Promise<void> {
    const fields: ConversationFields = {
      phone,
      last_activity: new Date().toISOString(),
    };
    if (patch.lastIntent !== undefined) fields.last_intent = patch.lastIntent;
    if (patch.pendingDates !== undefined) {
      fields.pending_dates = patch.pendingDates
        ? JSON.stringify(patch.pendingDates)
        : '';
    }
    if (patch.customerName !== undefined) {
      fields.customer_name = patch.customerName ?? '';
    }
    await this.upsert(phone, fields);
  }

  parseCommand(text: string): ParsedCommand | null {
    const tokens = text.trim().toLowerCase().split(/\s+/);
    const head = tokens[0];
    if (!head?.startsWith('/')) return null;
    const cmd = head.slice(1) as CommandName;
    if (!COMMAND_NAMES.includes(cmd)) return null;

    const args = tokens.slice(1);
    let phone: string | undefined;
    let minutes: number | undefined;

    for (const arg of args) {
      if (/^\+?\d{4,}$/.test(arg) && phone === undefined) {
        phone = arg.replace(/^\+/, '');
      } else if (/^\d{1,3}$/.test(arg) && minutes === undefined) {
        minutes = Number(arg);
      } else {
        return null;
      }
    }

    if (cmd === 'pause') return { command: 'pause', phone, minutes };
    if (cmd === 'release') return { command: 'release', phone };
    if (cmd === 'status') return { command: 'status', phone };
    return { command: 'resume', phone };
  }

  private parsePending(value: string | undefined): PendingDates | null {
    if (!value) return null;
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === 'object') return parsed as PendingDates;
    } catch {
      this.logger.warn('conversation', 'could not parse pending_dates', {
        value,
      });
    }
    return null;
  }

  private async upsert(
    phone: string,
    fields: ConversationFields,
  ): Promise<void> {
    const row = await this.findRow(phone);
    if (row) {
      await this.airtable.update<ConversationFields>(
        'Conversations',
        row.id,
        fields,
      );
    } else {
      // Defaults applied only on initial creation.
      const initial: ConversationFields = {
        status: 'New',
        enquiry_source: 'whatsapp',
        follow_up_count: 0,
        follow_up_24h_sent: false,
        follow_up_7d_sent: false,
        ...fields,
      };
      await this.airtable.create<ConversationFields>(
        'Conversations',
        initial,
      );
    }
  }

  private async findRow(phone: string) {
    const rows = await this.airtable.list<ConversationFields>('Conversations', {
      filterByFormula: `{phone}='${phone}'`,
      maxRecords: 1,
    });
    return rows[0];
  }
}
