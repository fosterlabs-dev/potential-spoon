import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Airtable, { FieldSet } from 'airtable';
import { LoggerService } from '../logger/logger.service';

export type AirtableRecord<T> = { id: string; fields: T };

export type ListOptions = {
  filterByFormula?: string;
  maxRecords?: number;
  view?: string;
  sort?: Array<{ field: string; direction?: 'asc' | 'desc' }>;
};

@Injectable()
export class AirtableService {
  private readonly base: ReturnType<Airtable['base']>;

  constructor(
    config: ConfigService,
    private readonly logger: LoggerService,
  ) {
    const apiKey = config.get<string>('AIRTABLE_API_KEY');
    const baseId = config.get<string>('AIRTABLE_BASE_ID');
    if (!apiKey || !baseId) {
      throw new Error('AIRTABLE_API_KEY and AIRTABLE_BASE_ID must be set');
    }
    this.base = new Airtable({ apiKey }).base(baseId);
  }

  async list<T extends FieldSet>(
    table: string,
    options: ListOptions = {},
  ): Promise<AirtableRecord<T>[]> {
    try {
      const records = await this.base<T>(table).select(options).all();
      return records.map((r) => ({ id: r.id, fields: r.fields }));
    } catch (err) {
      this.logger.error('airtable', 'list failed', {
        table,
        error: (err as Error).message,
      });
      throw err;
    }
  }

  async find<T extends FieldSet>(
    table: string,
    id: string,
  ): Promise<AirtableRecord<T> | null> {
    try {
      const record = await this.base<T>(table).find(id);
      return { id: record.id, fields: record.fields };
    } catch (err) {
      const e = err as { error?: string; message?: string };
      if (e.error === 'NOT_FOUND') return null;
      this.logger.error('airtable', 'find failed', {
        table,
        id,
        error: e.message,
      });
      throw err;
    }
  }

  async create<T extends FieldSet>(
    table: string,
    fields: T,
  ): Promise<AirtableRecord<T>> {
    try {
      const record = await this.base<T>(table).create(fields);
      return { id: record.id, fields: record.fields };
    } catch (err) {
      this.logger.error('airtable', 'create failed', {
        table,
        error: (err as Error).message,
      });
      throw err;
    }
  }

  async update<T extends FieldSet>(
    table: string,
    id: string,
    fields: Partial<T>,
  ): Promise<AirtableRecord<T>> {
    try {
      const record = await this.base<T>(table).update(id, fields);
      return { id: record.id, fields: record.fields };
    } catch (err) {
      this.logger.error('airtable', 'update failed', {
        table,
        id,
        error: (err as Error).message,
      });
      throw err;
    }
  }
}
