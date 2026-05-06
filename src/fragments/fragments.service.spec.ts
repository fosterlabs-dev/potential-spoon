import { AirtableService } from '../airtable/airtable.service';
import { LoggerService } from '../logger/logger.service';
import { FragmentsService } from './fragments.service';

const makeLogger = (): LoggerService =>
  ({
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }) as unknown as LoggerService;

const makeAirtable = (rows: unknown[]): AirtableService =>
  ({
    list: jest.fn().mockResolvedValue(rows),
  }) as unknown as AirtableService;

describe('FragmentsService', () => {
  it('lists active fragments and skips malformed rows', async () => {
    const airtable = makeAirtable([
      {
        id: 'rec1',
        fields: {
          key: 'dogs_allowed',
          category: 'knowledge',
          text: 'Dogs are very welcome.',
          topic_keys: ['dogs'],
        },
      },
      {
        id: 'rec2',
        fields: {
          key: 'inactive',
          category: 'knowledge',
          text: 'inactive',
          active: false,
        },
      },
      { id: 'rec3', fields: { key: 'broken', category: 'unknown' } },
    ]);
    const svc = new FragmentsService(airtable, makeLogger());

    const result = await svc.listAll();

    expect(result).toEqual([
      {
        key: 'dogs_allowed',
        category: 'knowledge',
        text: 'Dogs are very welcome.',
        topicKeys: ['dogs'],
      },
    ]);
  });

  it('fetches fragments by topic keys', async () => {
    const airtable = makeAirtable([
      {
        id: 'r1',
        fields: {
          key: 'dogs_allowed',
          category: 'knowledge',
          text: 'Dogs welcome.',
          topic_keys: ['dogs', 'pets'],
        },
      },
      {
        id: 'r2',
        fields: {
          key: 'cots_highchairs',
          category: 'knowledge',
          text: 'Two cots and highchairs.',
          topic_keys: ['cot_highchair'],
        },
      },
      {
        id: 'r3',
        fields: {
          key: 'pool_unheated',
          category: 'knowledge',
          text: 'Pool unheated.',
          topic_keys: ['pool_heated'],
        },
      },
    ]);
    const svc = new FragmentsService(airtable, makeLogger());

    const result = await svc.fetchByTopicKeys(['dogs', 'cot_highchair']);

    expect(result.map((f) => f.key)).toEqual([
      'dogs_allowed',
      'cots_highchairs',
    ]);
  });

  it('returns empty array when topic keys is empty', async () => {
    const svc = new FragmentsService(makeAirtable([]), makeLogger());
    expect(await svc.fetchByTopicKeys([])).toEqual([]);
  });

  it('normalizes comma-string topic_keys', async () => {
    const airtable = makeAirtable([
      {
        id: 'r1',
        fields: {
          key: 'a',
          category: 'knowledge',
          text: 'x',
          topic_keys: 'dogs, pets , cot_highchair',
        },
      },
    ]);
    const svc = new FragmentsService(airtable, makeLogger());
    const [frag] = await svc.listAll();
    expect(frag.topicKeys).toEqual(['dogs', 'pets', 'cot_highchair']);
  });
});
