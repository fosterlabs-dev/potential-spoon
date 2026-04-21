import { ConfigService } from '@nestjs/config';
import { AvailabilityService } from './availability.service';
import { LoggerService } from '../logger/logger.service';

const mockFromURL = jest.fn();

jest.mock('node-ical', () => ({
  async: { fromURL: (...args: unknown[]) => mockFromURL(...args) },
}));

const ICAL_URL = 'https://ical.test/cal.ics';
const makeConfig = (url: string | undefined): ConfigService =>
  ({ get: () => url }) as unknown as ConfigService;

const makeLogger = (): LoggerService =>
  ({
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }) as unknown as LoggerService;

const event = (start: string, end: string) => ({
  type: 'VEVENT',
  start: new Date(start),
  end: new Date(end),
  summary: 'Booked',
});

describe('AvailabilityService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('throws at construction when ICAL_URL is missing', () => {
    expect(
      () => new AvailabilityService(makeConfig(undefined), makeLogger()),
    ).toThrow();
  });

  it('returns true when the iCal feed has no events', async () => {
    mockFromURL.mockResolvedValue({});
    const service = new AvailabilityService(makeConfig(ICAL_URL), makeLogger());

    const ok = await service.isRangeAvailable(
      new Date('2026-06-01'),
      new Date('2026-06-05'),
    );

    expect(ok).toBe(true);
    expect(mockFromURL).toHaveBeenCalledWith('https://ical.test/cal.ics');
  });

  it('returns true when an event ends before the requested range starts', async () => {
    mockFromURL.mockResolvedValue({
      a: event('2026-05-20', '2026-05-25'),
    });
    const service = new AvailabilityService(makeConfig(ICAL_URL), makeLogger());

    const ok = await service.isRangeAvailable(
      new Date('2026-06-01'),
      new Date('2026-06-05'),
    );

    expect(ok).toBe(true);
  });

  it('returns true when an event starts at checkOut (abutting, DTEND exclusive)', async () => {
    mockFromURL.mockResolvedValue({
      a: event('2026-06-05', '2026-06-10'),
    });
    const service = new AvailabilityService(makeConfig(ICAL_URL), makeLogger());

    const ok = await service.isRangeAvailable(
      new Date('2026-06-01'),
      new Date('2026-06-05'),
    );

    expect(ok).toBe(true);
  });

  it('returns true when an event ends at checkIn (abutting)', async () => {
    mockFromURL.mockResolvedValue({
      a: event('2026-05-25', '2026-06-01'),
    });
    const service = new AvailabilityService(makeConfig(ICAL_URL), makeLogger());

    const ok = await service.isRangeAvailable(
      new Date('2026-06-01'),
      new Date('2026-06-05'),
    );

    expect(ok).toBe(true);
  });

  it('returns false when an event partially overlaps the range', async () => {
    mockFromURL.mockResolvedValue({
      a: event('2026-06-03', '2026-06-07'),
    });
    const service = new AvailabilityService(makeConfig(ICAL_URL), makeLogger());

    const ok = await service.isRangeAvailable(
      new Date('2026-06-01'),
      new Date('2026-06-05'),
    );

    expect(ok).toBe(false);
  });

  it('returns false when the event fully contains the request', async () => {
    mockFromURL.mockResolvedValue({
      a: event('2026-05-01', '2026-07-01'),
    });
    const service = new AvailabilityService(makeConfig(ICAL_URL), makeLogger());

    const ok = await service.isRangeAvailable(
      new Date('2026-06-01'),
      new Date('2026-06-05'),
    );

    expect(ok).toBe(false);
  });

  it('returns false when the request fully contains the event', async () => {
    mockFromURL.mockResolvedValue({
      a: event('2026-06-02', '2026-06-04'),
    });
    const service = new AvailabilityService(makeConfig(ICAL_URL), makeLogger());

    const ok = await service.isRangeAvailable(
      new Date('2026-06-01'),
      new Date('2026-06-05'),
    );

    expect(ok).toBe(false);
  });

  it('ignores non-VEVENT entries', async () => {
    mockFromURL.mockResolvedValue({
      tz: { type: 'VTIMEZONE', start: new Date('2026-06-03') },
      a: event('2026-07-01', '2026-07-05'),
    });
    const service = new AvailabilityService(makeConfig(ICAL_URL), makeLogger());

    const ok = await service.isRangeAvailable(
      new Date('2026-06-01'),
      new Date('2026-06-05'),
    );

    expect(ok).toBe(true);
  });

  it('logs and rethrows when the iCal fetch fails', async () => {
    mockFromURL.mockRejectedValue(new Error('network down'));
    const logger = makeLogger();
    const service = new AvailabilityService(makeConfig(ICAL_URL), logger);

    await expect(
      service.isRangeAvailable(
        new Date('2026-06-01'),
        new Date('2026-06-05'),
      ),
    ).rejects.toThrow('network down');
    expect(logger.error).toHaveBeenCalledWith(
      'availability',
      expect.stringContaining('fetch'),
      expect.objectContaining({ error: 'network down' }),
    );
  });

  it('throws on an invalid range (checkOut <= checkIn)', async () => {
    const service = new AvailabilityService(makeConfig(ICAL_URL), makeLogger());

    await expect(
      service.isRangeAvailable(
        new Date('2026-06-05'),
        new Date('2026-06-05'),
      ),
    ).rejects.toThrow();
    await expect(
      service.isRangeAvailable(
        new Date('2026-06-05'),
        new Date('2026-06-01'),
      ),
    ).rejects.toThrow();
  });
});
