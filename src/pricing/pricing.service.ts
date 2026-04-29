import { Injectable } from '@nestjs/common';
import { AirtableService } from '../airtable/airtable.service';
import { LoggerService } from '../logger/logger.service';

export type PricingRule = {
  startDate: Date;
  endDate: Date;
  weeklyRate: number;
  minWeeks?: number;
  label?: string;
};

export type Quote = {
  weeks: number;
  nights: number;
  weeklyRate: number;
  label?: string;
  subtotal: number;
  total: number;
  minWeeks: number;
  meetsMinWeeks: boolean;
};

type PricingFields = {
  start_date?: string;
  end_date?: string;
  weekly_rate?: number;
  min_weeks?: number;
  label?: string;
};

const DAY_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class PricingService {
  constructor(
    private readonly airtable: AirtableService,
    private readonly logger: LoggerService,
  ) {}

  async calculate(checkIn: Date, checkOut: Date): Promise<Quote> {
    const rows = await this.airtable.list<PricingFields>('Pricing');
    const rules: PricingRule[] = [];
    for (const row of rows) {
      const f = row.fields;
      if (
        typeof f.weekly_rate !== 'number' ||
        !f.start_date ||
        !f.end_date
      ) {
        this.logger.warn('pricing', 'skipping malformed pricing row', {
          id: row.id,
        });
        continue;
      }
      rules.push({
        startDate: new Date(f.start_date),
        endDate: new Date(f.end_date),
        weeklyRate: f.weekly_rate,
        minWeeks: f.min_weeks,
        label: f.label,
      });
    }
    return this.quote(rules, checkIn, checkOut);
  }

  quote(rules: PricingRule[], checkIn: Date, checkOut: Date): Quote {
    if (checkOut.getTime() <= checkIn.getTime()) {
      throw new Error('checkOut must be after checkIn');
    }

    const nights = Math.round(
      (checkOut.getTime() - checkIn.getTime()) / DAY_MS,
    );
    if (nights % 7 !== 0) {
      throw new Error(
        `stay length must be a multiple of 7 nights (got ${nights})`,
      );
    }
    const weeks = nights / 7;

    const rule = this.pickRule(rules, checkIn);
    if (!rule) {
      throw new Error(
        `no pricing rule covers check-in ${checkIn.toISOString().slice(0, 10)}`,
      );
    }

    const subtotal = weeks * rule.weeklyRate;
    const minWeeks = rule.minWeeks ?? 0;

    return {
      weeks,
      nights,
      weeklyRate: rule.weeklyRate,
      label: rule.label,
      subtotal,
      total: subtotal,
      minWeeks,
      meetsMinWeeks: weeks >= minWeeks,
    };
  }

  private pickRule(rules: PricingRule[], checkIn: Date): PricingRule | undefined {
    const t = checkIn.getTime();
    const matching = rules.filter(
      (r) => r.startDate.getTime() <= t && r.endDate.getTime() >= t,
    );
    if (matching.length === 0) return undefined;
    return matching.reduce((narrowest, r) => {
      const span = (x: PricingRule) =>
        x.endDate.getTime() - x.startDate.getTime();
      return span(r) < span(narrowest) ? r : narrowest;
    });
  }
}
