import {
  isSuperControlSender,
  matchSubject,
  SUPERCONTROL_CONFIG,
} from './subject-matcher';

describe('matchSubject (SuperControl exact subjects)', () => {
  it('matches each configured subject to its NudgeKey', () => {
    for (const [key, subject] of Object.entries(SUPERCONTROL_CONFIG.subjects)) {
      expect(matchSubject(subject)).toBe(key);
    }
  });

  it('is tolerant of case and whitespace differences', () => {
    expect(matchSubject('your stay at bonté is confirmed')).toBe('nudge_booking_confirmation');
    expect(matchSubject('  Your Stay at Bonté   is   Confirmed  ')).toBe('nudge_booking_confirmation');
  });

  it("normalises unicode dashes so en/em-dashes don't break matching", () => {
    // Jim's subjects use em-dashes; subjects typed with a plain hyphen
    // should still match after normalisation.
    expect(
      matchSubject('Your stay at Bonté - everything you need for arrival'),
    ).toBe('nudge_1_week_practical');
  });

  it('normalises curly apostrophes vs straight ones', () => {
    // Jim's mid-stay subject uses a curly apostrophe in "you're";
    // a straight apostrophe should still match.
    expect(
      matchSubject("Just checking in — hope you're enjoying Bonté"),
    ).toBe('nudge_mid_stay');
  });

  it('returns null for unrelated subjects', () => {
    expect(matchSubject('Marketing newsletter')).toBeNull();
    expect(matchSubject('Booking confirmed for August')).toBeNull(); // wording differs
    expect(matchSubject('')).toBeNull();
    expect(matchSubject(null)).toBeNull();
    expect(matchSubject(undefined)).toBeNull();
  });
});

describe('isSuperControlSender', () => {
  it('accepts the configured sender, case-insensitively', () => {
    expect(isSuperControlSender('bookings@bontemaison.com')).toBe(true);
    expect(isSuperControlSender('Bookings@BonteMaison.com')).toBe(true);
    expect(isSuperControlSender('  bookings@bontemaison.com  ')).toBe(true);
  });

  it('rejects anything else', () => {
    expect(isSuperControlSender('jim@bontemaison.com')).toBe(false);
    expect(isSuperControlSender('nadine@fosterlabs.dev')).toBe(false);
    expect(isSuperControlSender('')).toBe(false);
    expect(isSuperControlSender(null)).toBe(false);
    expect(isSuperControlSender(undefined)).toBe(false);
  });
});
