import { Injectable } from '@nestjs/common';
import { AirtableService } from '../airtable/airtable.service';
import { LoggerService } from '../logger/logger.service';
import { HistoryMessage } from '../parser/parser.service';

export type Direction = 'in' | 'out';

type MessageLogFields = {
  phone?: string;
  direction?: Direction;
  text?: string;
  intent?: string;
  timestamp?: string;
};

@Injectable()
export class MessageLogService {
  constructor(
    private readonly airtable: AirtableService,
    private readonly logger: LoggerService,
  ) {}

  async log(
    phone: string,
    direction: Direction,
    text: string,
    intent?: string,
  ): Promise<void> {
    const fields: MessageLogFields = {
      phone,
      direction,
      text,
      timestamp: new Date().toISOString(),
    };
    if (intent) fields.intent = intent;
    try {
      await this.airtable.create<MessageLogFields>('MessageLog', fields);
    } catch (err) {
      this.logger.error('messagelog', 'failed to write log entry', {
        phone,
        direction,
        error: (err as Error).message,
      });
    }
  }

  async recent(phone: string, limit = 6): Promise<HistoryMessage[]> {
    try {
      const rows = await this.airtable.list<MessageLogFields>('MessageLog', {
        filterByFormula: `{phone}='${phone}'`,
        sort: [{ field: 'timestamp', direction: 'desc' }],
        maxRecords: limit,
      });
      return rows
        .map((r) => r.fields)
        .filter((f): f is Required<Pick<MessageLogFields, 'text' | 'direction'>> & MessageLogFields =>
          typeof f.text === 'string' && (f.direction === 'in' || f.direction === 'out'),
        )
        .reverse()
        .map((f) => ({
          role: f.direction === 'in' ? ('customer' as const) : ('assistant' as const),
          text: f.text,
        }));
    } catch (err) {
      this.logger.error('messagelog', 'failed to read recent messages', {
        phone,
        error: (err as Error).message,
      });
      return [];
    }
  }
}
