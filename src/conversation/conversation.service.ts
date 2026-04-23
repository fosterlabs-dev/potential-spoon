import { Injectable } from '@nestjs/common';
import { AirtableService } from '../airtable/airtable.service';
import { LoggerService } from '../logger/logger.service';

export type ConversationStatus = 'bot' | 'human' | 'paused';

export type PendingDates = {
  checkIn?: string | null;
  checkOut?: string | null;
  guests?: number | null;
};

export type ConversationState = {
  status: ConversationStatus;
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
  status?: ConversationStatus;
  pause_until?: string;
  last_message_at?: string;
  last_intent?: string;
  pending_dates?: string;
  customer_name?: string;
};

const COMMAND_NAMES = ['release', 'pause', 'resume', 'status'] as const;
type CommandName = (typeof COMMAND_NAMES)[number];

const DEFAULT_STATE: ConversationState = {
  status: 'bot',
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
    if (f.status === 'paused' && f.pause_until) {
      if (new Date(f.pause_until).getTime() < Date.now()) return 'bot';
    }
    return f.status ?? 'bot';
  }

  async getState(phone: string): Promise<ConversationState> {
    const row = await this.findRow(phone);
    if (!row) return DEFAULT_STATE;

    const f = row.fields;
    const effectiveStatus: ConversationStatus =
      f.status === 'paused' &&
      f.pause_until &&
      new Date(f.pause_until).getTime() < Date.now()
        ? 'bot'
        : (f.status ?? 'bot');

    return {
      status: effectiveStatus,
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
    const fields: ConversationFields = { phone, status };
    if (options.pauseForMinutes !== undefined) {
      fields.pause_until = new Date(
        Date.now() + options.pauseForMinutes * 60_000,
      ).toISOString();
    }
    await this.upsert(phone, fields);
    this.logger.info('conversation', 'status updated', { phone, status });
  }

  async updateContext(
    phone: string,
    patch: {
      lastIntent?: string;
      pendingDates?: PendingDates | null;
      customerName?: string | null;
    },
  ): Promise<void> {
    const fields: ConversationFields = { phone };
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
      await this.airtable.create<ConversationFields>('Conversations', fields);
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
