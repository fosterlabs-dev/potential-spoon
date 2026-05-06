import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as ical from 'node-ical';
import { LoggerService } from '../logger/logger.service';

type VEvent = { type: 'VEVENT'; start: Date; end: Date; summary?: string };

@Injectable()
export class AvailabilityService {
  private readonly icalUrl: string;

  constructor(
    config: ConfigService,
    private readonly logger: LoggerService,
  ) {
    const url = config.get<string>('ICAL_URL');
    if (!url) throw new Error('ICAL_URL must be set');
    this.icalUrl = url;
  }

  async isRangeAvailable(checkIn: Date, checkOut: Date): Promise<boolean> {
    if (checkOut.getTime() <= checkIn.getTime()) {
      throw new Error('checkOut must be after checkIn');
    }

    const events = await this.fetchEvents();

    return !this.eventsOverlapRange(events, checkIn, checkOut);
  }

  /**
   * Returns Sunday-to-Sunday week ranges within [rangeStart, rangeEnd) that
   * have no overlap with any iCal event. Single iCal fetch.
   */
  async findAvailableSundayWeeks(
    rangeStart: Date,
    rangeEnd: Date,
  ): Promise<Array<{ checkIn: Date; checkOut: Date }>> {
    if (rangeEnd.getTime() <= rangeStart.getTime()) {
      throw new Error('rangeEnd must be after rangeStart');
    }
    const events = await this.fetchEvents();
    const out: Array<{ checkIn: Date; checkOut: Date }> = [];
    const cursor = this.firstSundayOnOrAfter(rangeStart);
    while (cursor.getTime() < rangeEnd.getTime()) {
      const checkIn = new Date(cursor.getTime());
      const checkOut = new Date(cursor.getTime() + 7 * 24 * 60 * 60 * 1000);
      if (!this.eventsOverlapRange(events, checkIn, checkOut)) {
        out.push({ checkIn, checkOut });
      }
      cursor.setUTCDate(cursor.getUTCDate() + 7);
    }
    return out;
  }

  private firstSundayOnOrAfter(d: Date): Date {
    const result = new Date(
      Date.UTC(
        d.getUTCFullYear(),
        d.getUTCMonth(),
        d.getUTCDate(),
        0,
        0,
        0,
        0,
      ),
    );
    const dow = result.getUTCDay();
    if (dow !== 0) result.setUTCDate(result.getUTCDate() + (7 - dow));
    return result;
  }

  private eventsOverlapRange(
    events: VEvent[],
    checkIn: Date,
    checkOut: Date,
  ): boolean {
    return events.some(
      (e) =>
        e.start.getTime() < checkOut.getTime() &&
        e.end.getTime() > checkIn.getTime(),
    );
  }

  private async fetchEvents(): Promise<VEvent[]> {
    try {
      const parsed = await ical.async.fromURL(this.icalUrl);
      return Object.values(parsed).filter(
        (entry) => (entry as { type?: string }).type === 'VEVENT',
      ) as unknown as VEvent[];
    } catch (err) {
      const message = (err as Error).message;
      this.logger.error('availability', 'iCal fetch failed', {
        url: this.icalUrl,
        error: message,
      });
      throw err;
    }
  }
}
