import { ConfigService } from '@nestjs/config';
import { BookingRulesService } from './booking-rules.service';

const makeConfig = (year2026Booked: 'true' | 'false' = 'true'): ConfigService =>
  ({ get: () => year2026Booked }) as unknown as ConfigService;

// Known Sundays
const SUN_2025_07_06 = new Date('2025-07-06'); // Sunday
const SUN_2025_07_13 = new Date('2025-07-13'); // Sunday
const SUN_2025_07_27 = new Date('2025-07-27'); // Sunday (21 nights from Jul 6)
const SUN_2025_07_27_28d = new Date('2025-08-03'); // Sunday (28 nights from Jul 6)
const SUN_2025_09_07 = new Date('2025-09-07'); // Sunday
const SUN_2025_09_14 = new Date('2025-09-14'); // Sunday
const SUN_2025_11_02 = new Date('2025-11-02'); // Sunday
const SUN_2025_11_30 = new Date('2025-11-30'); // Sunday (28 nights from Nov 2)
const MON_2025_07_07 = new Date('2025-07-07'); // Monday
const SAT_2025_07_12 = new Date('2025-07-12'); // Saturday
const SUN_2026_07_05 = new Date('2026-07-05'); // Sunday in 2026
const SUN_2026_07_12 = new Date('2026-07-12'); // Sunday in 2026

describe('BookingRulesService', () => {
  describe('2026 redirect', () => {
    it('blocks 2026 dates when YEAR_2026_FULLY_BOOKED=true', () => {
      const svc = new BookingRulesService(makeConfig('true'));
      const result = svc.validate(SUN_2026_07_05, SUN_2026_07_12);
      expect(result).toEqual({ pass: false, reason: 'year_2026_redirect' });
    });

    it('allows 2026 dates when YEAR_2026_FULLY_BOOKED=false', () => {
      const svc = new BookingRulesService(makeConfig('false'));
      const result = svc.validate(SUN_2026_07_05, SUN_2026_07_12);
      expect(result.pass).toBe(true);
    });

    it('allows 2025 dates regardless of flag', () => {
      const svc = new BookingRulesService(makeConfig('true'));
      const result = svc.validate(SUN_2025_07_06, SUN_2025_07_13);
      expect(result.pass).toBe(true);
    });
  });

  describe('Sunday-to-Sunday validation', () => {
    it('blocks when check-in is not a Sunday and suggests next Sunday pair', () => {
      const svc = new BookingRulesService(makeConfig('false'));
      const result = svc.validate(MON_2025_07_07, SUN_2025_07_13);

      expect(result).toEqual({
        pass: false,
        reason: 'not_sunday',
        suggestedCheckIn: '2025-07-13', // next Sunday >= Jul 7
        suggestedCheckOut: '2025-07-20', // + 7 days
      });
    });

    it('blocks when check-out is not a Sunday and keeps Sunday check-in', () => {
      const svc = new BookingRulesService(makeConfig('false'));
      const result = svc.validate(SUN_2025_07_06, SAT_2025_07_12);

      expect(result).toEqual({
        pass: false,
        reason: 'not_sunday',
        suggestedCheckIn: '2025-07-06', // already Sunday
        suggestedCheckOut: '2025-07-13', // + 7 days
      });
    });

    it('blocks when both are non-Sunday', () => {
      const svc = new BookingRulesService(makeConfig('false'));
      const result = svc.validate(MON_2025_07_07, SAT_2025_07_12);
      expect(result.pass).toBe(false);
      if (!result.pass) expect(result.reason).toBe('not_sunday');
    });

    it('passes when both are Sundays', () => {
      const svc = new BookingRulesService(makeConfig('false'));
      expect(svc.validate(SUN_2025_07_06, SUN_2025_07_13).pass).toBe(true);
    });
  });

  describe('minimum stay', () => {
    it('blocks when nights < 7 and suggests check-in + 7 days', () => {
      const checkIn = new Date('2025-07-06'); // Sunday
      const checkOut = new Date('2025-07-06'); // same day — 0 nights
      const svc = new BookingRulesService(makeConfig('false'));
      const result = svc.validate(checkIn, checkOut);

      expect(result).toEqual({
        pass: false,
        reason: 'min_stay',
        suggestedCheckIn: '2025-07-06',
        suggestedCheckOut: '2025-07-13',
      });
    });

    it('passes for a 7-night Sunday stay', () => {
      const svc = new BookingRulesService(makeConfig('false'));
      expect(svc.validate(SUN_2025_07_06, SUN_2025_07_13).pass).toBe(true);
    });

    it('passes for a 14-night Sunday stay', () => {
      const svc = new BookingRulesService(makeConfig('false'));
      const checkOut14 = new Date('2025-07-20'); // 14 nights from Jul 6
      expect(svc.validate(SUN_2025_07_06, checkOut14).pass).toBe(true);
    });

    it('passes for a 21-night Sunday stay', () => {
      const svc = new BookingRulesService(makeConfig('false'));
      expect(svc.validate(SUN_2025_07_06, SUN_2025_07_27).pass).toBe(true);
    });
  });

  describe('long stay detection (Oct–May)', () => {
    it('blocks a 28-night stay starting in November', () => {
      const svc = new BookingRulesService(makeConfig('false'));
      const result = svc.validate(SUN_2025_11_02, SUN_2025_11_30);
      expect(result).toEqual({ pass: false, reason: 'long_stay_manual' });
    });

    it('allows a 28-night stay starting in July (summer)', () => {
      const svc = new BookingRulesService(makeConfig('false'));
      const checkOut28 = new Date('2025-08-03'); // 28 nights from Jul 6 (Sunday)
      expect(svc.validate(SUN_2025_07_06, checkOut28).pass).toBe(true);
    });

    it('blocks a 28-night stay starting in October', () => {
      const svc = new BookingRulesService(makeConfig('false'));
      const checkIn = new Date('2025-10-05'); // Sunday
      const checkOut = new Date('2025-11-02'); // Sunday, 28 nights later
      const result = svc.validate(checkIn, checkOut);
      expect(result.pass).toBe(false);
      if (!result.pass) expect(result.reason).toBe('long_stay_manual');
    });

    it('blocks a 28-night stay starting in May', () => {
      const svc = new BookingRulesService(makeConfig('false'));
      const checkIn = new Date('2025-05-04'); // Sunday
      const checkOut = new Date('2025-06-01'); // Sunday, 28 nights later
      const result = svc.validate(checkIn, checkOut);
      expect(result.pass).toBe(false);
      if (!result.pass) expect(result.reason).toBe('long_stay_manual');
    });

    it('allows a 21-night stay in October (at or under limit)', () => {
      const svc = new BookingRulesService(makeConfig('false'));
      const checkIn = new Date('2025-10-05'); // Sunday
      const checkOut = new Date('2025-10-26'); // Sunday, 21 nights later
      expect(svc.validate(checkIn, checkOut).pass).toBe(true);
    });
  });

  describe('validation order', () => {
    it('checks year_2026 before Sunday validation', () => {
      const svc = new BookingRulesService(makeConfig('true'));
      // non-Sunday 2026 dates — should get year_2026 not not_sunday
      const result = svc.validate(new Date('2026-07-06'), new Date('2026-07-13'));
      if (!result.pass) expect(result.reason).toBe('year_2026_redirect');
    });

    it('checks Sunday before min_stay', () => {
      const svc = new BookingRulesService(makeConfig('false'));
      // Monday-to-Tuesday (not Sunday, also < 7 nights) — should get not_sunday
      const result = svc.validate(new Date('2025-07-07'), new Date('2025-07-08'));
      if (!result.pass) expect(result.reason).toBe('not_sunday');
    });
  });
});
