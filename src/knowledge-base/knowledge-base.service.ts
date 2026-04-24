import { Injectable } from '@nestjs/common';
import { AirtableService } from '../airtable/airtable.service';

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

@Injectable()
export class KnowledgeBaseService {
  constructor(private readonly airtable: AirtableService) {}

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

  async render(topicKey: string): Promise<string | null> {
    const rows = await this.airtable.list<KbFields>('KnowledgeBase', {
      filterByFormula: `{topic_key}='${topicKey}'`,
      maxRecords: 1,
    });
    const entry = rows.find(
      (r) =>
        typeof r.fields.answer === 'string' && r.fields.active !== false,
    );
    if (!entry) return null;

    return entry.fields.answer as string;
  }
}
