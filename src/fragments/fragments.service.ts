import { Injectable } from '@nestjs/common';
import { AirtableService } from '../airtable/airtable.service';
import { LoggerService } from '../logger/logger.service';

export type FragmentCategory = 'opener' | 'knowledge' | 'nudge' | 'closer';

export type Fragment = {
  key: string;
  category: FragmentCategory;
  text: string;
  topicKeys: string[];
};

type FragmentFields = {
  key?: string;
  category?: FragmentCategory;
  text?: string;
  topic_keys?: string[] | string;
  active?: boolean;
};

const VALID_CATEGORIES: readonly FragmentCategory[] = [
  'opener',
  'knowledge',
  'nudge',
  'closer',
];

@Injectable()
export class FragmentsService {
  constructor(
    private readonly airtable: AirtableService,
    private readonly logger: LoggerService,
  ) {}

  async listAll(): Promise<Fragment[]> {
    const rows = await this.airtable.list<FragmentFields>('Fragments');
    return rows
      .filter((r) => r.fields.active !== false)
      .map((r) => this.toFragment(r.fields))
      .filter((f): f is Fragment => f !== null);
  }

  async listByCategory(category: FragmentCategory): Promise<Fragment[]> {
    const rows = await this.airtable.list<FragmentFields>('Fragments', {
      filterByFormula: `AND({category}='${category}', NOT({active}=FALSE()))`,
    });
    return rows
      .map((r) => this.toFragment(r.fields))
      .filter((f): f is Fragment => f !== null);
  }

  async fetchByTopicKeys(topicKeys: string[]): Promise<Fragment[]> {
    if (topicKeys.length === 0) return [];
    const all = await this.listAll();
    const wanted = new Set(topicKeys);
    return all.filter((f) => f.topicKeys.some((t) => wanted.has(t)));
  }

  private toFragment(fields: FragmentFields): Fragment | null {
    if (
      typeof fields.key !== 'string' ||
      typeof fields.text !== 'string' ||
      !VALID_CATEGORIES.includes(fields.category as FragmentCategory)
    ) {
      this.logger.warn('templates', 'skipping malformed fragment row', {
        key: fields.key,
      });
      return null;
    }
    const topicKeys = this.normalizeTopicKeys(fields.topic_keys);
    return {
      key: fields.key,
      category: fields.category as FragmentCategory,
      text: fields.text,
      topicKeys,
    };
  }

  private normalizeTopicKeys(raw: string[] | string | undefined): string[] {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw.filter((v) => typeof v === 'string');
    return raw
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }
}
