import { Injectable } from '@nestjs/common';
import { AirtableService } from '../airtable/airtable.service';
import { LoggerService } from '../logger/logger.service';

export type PricingRule = {
  startDate: Date;
  endDate: Date;
  nightlyRate: number;
  minNights?: number;
  label?: string;
};

export type Quote = {
  nights: number;
  nightlyBreakdown: Array<{ date: Date; rate: number; label?: string }>;
  subtotal: number;
  total: number;
  minNights: number;
  meetsMinNights: boolean;
};

type PricingFields = {
  start_date?: string;
  end_date?: string;
  nightly_rate?: number;
  min_nights?: number;
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
      if (!f.start_date || !f.end_date || typeof f.nightly_rate !== 'number') {
        this.logger.warn('pricing', 'skipping malformed pricing row', {
          id: row.id,
        });
        continue;
      }
      rules.push({
        startDate: new Date(f.start_date),
        endDate: new Date(f.end_date),
        nightlyRate: f.nightly_rate,
        minNights: f.min_nights,
        label: f.label,
      });
    }
    return this.quote(rules, checkIn, checkOut);
  }

  quote(rules: PricingRule[], checkIn: Date, checkOut: Date): Quote {
    if (checkOut.getTime() <= checkIn.getTime()) {
      throw new Error('checkOut must be after checkIn');
    }

    const breakdown: Quote['nightlyBreakdown'] = [];
    const matchingRules: PricingRule[] = [];

    for (
      let t = checkIn.getTime();
      t < checkOut.getTime();
      t += DAY_MS
    ) {
      const night = new Date(t);
      const rule = this.pickRule(rules, night);
      if (!rule) {
        throw new Error(
          `no pricing rule covers night ${night.toISOString().slice(0, 10)}`,
        );
      }
      matchingRules.push(rule);
      breakdown.push({
        date: night,
        rate: rule.nightlyRate,
        label: rule.label,
      });
    }

    const subtotal = breakdown.reduce((sum, n) => sum + n.rate, 0);
    const minNights = matchingRules.reduce(
      (max, r) => Math.max(max, r.minNights ?? 0),
      0,
    );

    return {
      nights: breakdown.length,
      nightlyBreakdown: breakdown,
      subtotal,
      total: subtotal,
      minNights,
      meetsMinNights: breakdown.length >= minNights,
    };
  }

  private pickRule(rules: PricingRule[], night: Date): PricingRule | undefined {
    const t = night.getTime();
    const candidates = rules.filter(
      (r) => r.startDate.getTime() <= t && r.endDate.getTime() >= t,
    );
    if (candidates.length === 0) return undefined;
    return candidates.reduce((narrowest, r) => {
      const span = (x: PricingRule) =>
        x.endDate.getTime() - x.startDate.getTime();
      return span(r) < span(narrowest) ? r : narrowest;
    });
  }
}
