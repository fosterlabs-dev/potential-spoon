import { Injectable } from '@nestjs/common';
import { AirtableService } from '../airtable/airtable.service';
import { LoggerService } from '../logger/logger.service';

type TemplateFields = {
  key?: string;
  variant?: number;
  text?: string;
};

@Injectable()
export class TemplatesService {
  private readonly counters = new Map<string, number>();

  constructor(
    private readonly airtable: AirtableService,
    private readonly logger: LoggerService,
  ) {}

  async fetchRaw(key: string): Promise<string[]> {
    const rows = await this.airtable.list<TemplateFields>('Templates', {
      filterByFormula: `{key}='${key}'`,
    });
    return rows
      .filter((r) => typeof r.fields.text === 'string')
      .sort((a, b) => (a.fields.variant ?? 0) - (b.fields.variant ?? 0))
      .map((r) => r.fields.text as string);
  }

  async render(key: string): Promise<string> {
    const rows = await this.airtable.list<TemplateFields>('Templates', {
      filterByFormula: `{key}='${key}'`,
    });

    const variants = rows
      .filter((r) => typeof r.fields.text === 'string')
      .sort((a, b) => (a.fields.variant ?? 0) - (b.fields.variant ?? 0));

    if (variants.length === 0) {
      throw new Error(`no template found for key "${key}"`);
    }

    const idx = this.counters.get(key) ?? 0;
    const chosen = variants[idx % variants.length];
    this.counters.set(key, idx + 1);

    return chosen.fields.text as string;
  }
}
