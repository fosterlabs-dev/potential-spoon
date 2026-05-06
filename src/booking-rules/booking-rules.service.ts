import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const DAY_MS = 24 * 60 * 60 * 1000;
const MIN_NIGHTS = 7;
const MAX_STANDARD_NIGHTS = 21;
// Months that trigger manual pricing for long stays: Oct(9) through May(4)
const LONG_STAY_MONTHS = new Set([9, 10, 11, 0, 1, 2, 3, 4]);

export type RulesValidation =
  | { pass: true }
  | { pass: false; reason: 'year_2026_redirect' }
  | {
      pass: false;
      reason: 'not_sunday';
      suggestedCheckIn: string;
      suggestedCheckOut: string;
    }
  | {
      pass: false;
      reason: 'min_stay';
      suggestedCheckIn: string;
      suggestedCheckOut: string;
    }
  | { pass: false; reason: 'long_stay_manual' };

@Injectable()
export class BookingRulesService {
  private readonly year2026Booked: boolean;

  constructor(config: ConfigService) {
    this.year2026Booked =
      config.get<string>('YEAR_2026_FULLY_BOOKED') === 'true';
  }

  validate(checkIn: Date, checkOut: Date): RulesValidation {
    if (this.year2026Booked && checkIn.getUTCFullYear() === 2026) {
      return { pass: false, reason: 'year_2026_redirect' };
    }

    if (checkIn.getUTCDay() !== 0 || checkOut.getUTCDay() !== 0) {
      const suggestedCheckIn = this.nextSunday(checkIn);
      const suggestedCheckOut = new Date(
        suggestedCheckIn.getTime() + MIN_NIGHTS * DAY_MS,
      );
      return {
        pass: false,
        reason: 'not_sunday',
        suggestedCheckIn: this.isoDate(suggestedCheckIn),
        suggestedCheckOut: this.isoDate(suggestedCheckOut),
      };
    }

    const nights = Math.round(
      (checkOut.getTime() - checkIn.getTime()) / DAY_MS,
    );

    if (nights < MIN_NIGHTS) {
      const suggestedCheckOut = new Date(
        checkIn.getTime() + MIN_NIGHTS * DAY_MS,
      );
      return {
        pass: false,
        reason: 'min_stay',
        suggestedCheckIn: this.isoDate(checkIn),
        suggestedCheckOut: this.isoDate(suggestedCheckOut),
      };
    }

    if (
      nights > MAX_STANDARD_NIGHTS &&
      LONG_STAY_MONTHS.has(checkIn.getUTCMonth())
    ) {
      return { pass: false, reason: 'long_stay_manual' };
    }

    return { pass: true };
  }

  /**
   * True when the bot should refuse a month-level query because the year is
   * fully booked. Used by the month-query path which has no concrete dates.
   */
  isYearFullyBooked(year: number): boolean {
    return this.year2026Booked && year === 2026;
  }

  private nextSunday(date: Date): Date {
    const daysUntilSunday = (7 - date.getUTCDay()) % 7;
    return new Date(date.getTime() + daysUntilSunday * DAY_MS);
  }

  private isoDate(d: Date): string {
    return d.toISOString().slice(0, 10);
  }
}
