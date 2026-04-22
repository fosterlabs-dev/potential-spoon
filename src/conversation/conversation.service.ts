import { Injectable } from '@nestjs/common';
import { AirtableService } from '../airtable/airtable.service';
import { LoggerService } from '../logger/logger.service';

export type ConversationStatus = 'bot' | 'human' | 'paused';

export type ParsedCommand =
  | { command: 'release' }
  | { command: 'pause'; minutes?: number }
  | { command: 'resume' };

type ConversationFields = {
  phone?: string;
  status?: ConversationStatus;
  pause_until?: string;
  last_message_at?: string;
};

const COMMAND_RE = /^\/(release|pause|resume)(?:\s+(\d+))?$/;

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
    this.logger.info('conversation', 'status updated', { phone, status });
  }

  parseCommand(text: string): ParsedCommand | null {
    const normalized = text.trim().toLowerCase();
    const m = normalized.match(COMMAND_RE);
    if (!m) return null;
    const [, cmd, arg] = m;
    if (cmd === 'pause') {
      return arg ? { command: 'pause', minutes: Number(arg) } : { command: 'pause' };
    }
    if (cmd === 'release') return { command: 'release' };
    return { command: 'resume' };
  }

  private async findRow(phone: string) {
    const rows = await this.airtable.list<ConversationFields>('Conversations', {
      filterByFormula: `{phone}='${phone}'`,
      maxRecords: 1,
    });
    return rows[0];
  }
}
