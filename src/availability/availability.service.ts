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

    return !events.some(
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
