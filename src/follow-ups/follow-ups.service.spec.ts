import { AirtableService } from '../airtable/airtable.service';
import { LoggerService } from '../logger/logger.service';
import { FollowUpFields, FollowUpsService } from './follow-ups.service';

const makeLogger = (): LoggerService =>
  ({
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }) as unknown as LoggerService;

const makeAirtable = (
  rows: Array<{ id: string; fields: FollowUpFields }> = [],
): AirtableService => {
  const store = [...rows];
  return {
    list: jest.fn().mockImplementation(async () => store.map((r) => ({ ...r, fields: { ...r.fields } }))),
    create: jest.fn().mockImplementation(async (_table: string, fields: FollowUpFields) => {
      const record = { id: `rec_${store.length + 1}`, fields };
      store.push(record);
      return record;
    }),
    update: jest.fn().mockImplementation(async (_t, id: string, patch: Partial<FollowUpFields>) => {
      const row = store.find((r) => r.id === id);
      if (!row) throw new Error('not found');
      row.fields = { ...row.fields, ...patch };
      return row;
    }),
  } as unknown as AirtableService;
};

const PHONE = '447111';

describe('FollowUpsService', () => {
  it('schedule creates a pending row keyed by phone', async () => {
    const airtable = makeAirtable();
    const svc = new FollowUpsService(airtable, makeLogger());

    const row = await svc.schedule(PHONE);

    expect(row.fields.phone).toBe(PHONE);
    expect(row.fields.status).toBe('pending');
    expect(row.fields.quote_sent_at).toBeDefined();
  });

  it('schedule cancels any prior open sequence for the same phone', async () => {
    const airtable = makeAirtable([
      {
        id: 'old',
        fields: {
          phone: PHONE,
          quote_sent_at: '2026-04-01T00:00:00.000Z',
          status: 'pending',
          created_at: '2026-04-01T00:00:00.000Z',
          updated_at: '2026-04-01T00:00:00.000Z',
        },
      },
    ]);
    const svc = new FollowUpsService(airtable, makeLogger());

    await svc.schedule(PHONE);

    expect(airtable.update).toHaveBeenCalledWith(
      'FollowUps',
      'old',
      expect.objectContaining({ status: 'cancelled' }),
    );
  });

  it('cancel marks all open rows as cancelled', async () => {
    const airtable = makeAirtable([
      {
        id: 'a',
        fields: {
          phone: PHONE,
          quote_sent_at: '2026-04-01T00:00:00.000Z',
          status: 'pending',
          created_at: '2026-04-01T00:00:00.000Z',
          updated_at: '2026-04-01T00:00:00.000Z',
        },
      },
      {
        id: 'b',
        fields: {
          phone: PHONE,
          quote_sent_at: '2026-04-02T00:00:00.000Z',
          status: 'sent_24h',
          created_at: '2026-04-02T00:00:00.000Z',
          updated_at: '2026-04-02T00:00:00.000Z',
        },
      },
      {
        id: 'c',
        fields: {
          phone: PHONE,
          quote_sent_at: '2026-04-03T00:00:00.000Z',
          status: 'completed',
          created_at: '2026-04-03T00:00:00.000Z',
          updated_at: '2026-04-03T00:00:00.000Z',
        },
      },
    ]);
    const svc = new FollowUpsService(airtable, makeLogger());

    await svc.cancel(PHONE);

    expect(airtable.update).toHaveBeenCalledWith('FollowUps', 'a', expect.objectContaining({ status: 'cancelled' }));
    expect(airtable.update).toHaveBeenCalledWith('FollowUps', 'b', expect.objectContaining({ status: 'cancelled' }));
    expect(airtable.update).not.toHaveBeenCalledWith('FollowUps', 'c', expect.anything());
  });

  it('listDue returns only pending and sent_24h rows', async () => {
    const rows: Array<{ id: string; fields: FollowUpFields }> = [
      ['p', 'pending'],
      ['s', 'sent_24h'],
      ['c', 'completed'],
      ['x', 'cancelled'],
    ].map(([id, status]) => ({
      id: id as string,
      fields: {
        phone: PHONE,
        quote_sent_at: '2026-04-01T00:00:00.000Z',
        status: status as FollowUpFields['status'],
        created_at: '2026-04-01T00:00:00.000Z',
        updated_at: '2026-04-01T00:00:00.000Z',
      },
    }));
    const svc = new FollowUpsService(makeAirtable(rows), makeLogger());

    const due = await svc.listDue();

    expect(due.map((r) => r.id).sort()).toEqual(['p', 's']);
  });
});
