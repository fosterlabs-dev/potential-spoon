import { Injectable } from '@nestjs/common';
import { AirtableService } from '../airtable/airtable.service';
import { LoggerService } from '../logger/logger.service';

type KbFields = {
  topic_key?: string;
  question_examples?: string;
  answer?: string;
  active?: boolean;
};

export type KbTopic = {
  topicKey: string;
  questionExamples: string;
};

export type KbVars = Record<string, string | number | boolean>;

const PLACEHOLDER = /\{(\w+)\}/g;

@Injectable()
export class KnowledgeBaseService {
  constructor(
    private readonly airtable: AirtableService,
    private readonly logger: LoggerService,
  ) {}

  async listTopics(): Promise<KbTopic[]> {
    const rows = await this.airtable.list<KbFields>('KnowledgeBase');
    return rows
      .filter(
        (r) =>
          typeof r.fields.topic_key === 'string' &&
          r.fields.active !== false,
      )
      .map((r) => ({
        topicKey: r.fields.topic_key as string,
        questionExamples: r.fields.question_examples ?? '',
      }));
  }

  async render(topicKey: string, vars: KbVars): Promise<string | null> {
    const rows = await this.airtable.list<KbFields>('KnowledgeBase', {
      filterByFormula: `{topic_key}='${topicKey}'`,
      maxRecords: 1,
    });
    const entry = rows.find(
      (r) =>
        typeof r.fields.answer === 'string' && r.fields.active !== false,
    );
    if (!entry) return null;

    return this.substitute(entry.fields.answer as string, vars, topicKey);
  }

  private substitute(text: string, vars: KbVars, topicKey: string): string {
    return text.replace(PLACEHOLDER, (_m, name: string) => {
      if (!(name in vars)) {
        this.logger.error('knowledge-base', 'missing placeholder value', {
          topicKey,
          placeholder: name,
        });
        throw new Error(
          `missing placeholder "${name}" for KB topic "${topicKey}"`,
        );
      }
      return String(vars[name]);
    });
  }
}
