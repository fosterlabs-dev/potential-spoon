// Keys MUST exactly match the WhatsApp Business Template names registered
// with Meta — we call sendTemplate(phone, key, ...) and Meta resolves by name.
export type NudgeKey =
  | 'nudge_booking_confirmation'
  | 'nudge_4_weeks_anticipation'
  | 'nudge_1_week_practical'
  | 'nudge_pre_arrival'
  | 'nudge_mid_stay'
  | 'nudge_before_departure'
  | 'nudge_thank_you'
  | 'nudge_re_engagement';

// Single source of truth for SuperControl. Update the right-hand strings when
// Jim tweaks SuperControl subjects; the left-hand keys must stay aligned with
// the Meta template names.
export const SUPERCONTROL_CONFIG = {
  senderEmail: 'bookings@bontemaison.com',
  subjects: {
    nudge_booking_confirmation:  'Your Stay at Bonté is Confirmed',
    nudge_4_weeks_anticipation:  'Your stay at Bonté — wine, vineyards and long lunches ahead',
    nudge_1_week_practical:      'Your stay at Bonté — everything you need for arrival',
    nudge_pre_arrival:           'Bonté — your arrival details',
    nudge_mid_stay:              'Just checking in — hope you’re enjoying Bonté',
    nudge_before_departure:      'Before you leave Bonté',
    nudge_thank_you:             'Thank you for staying',
    nudge_re_engagement:         'Thinking about another stay at Bonté',
  } satisfies Record<NudgeKey, string>,
};

// Normalise for tolerant comparison: lowercase, collapse whitespace, unify
// dash + quote variants. Catches things like double-spaces, em/en-dashes,
// and curly apostrophes vs straight ones — all common when email subjects
// pass through different editors.
function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[‐-―−]/g, '-')   // unicode dashes → '-'
    .replace(/[’‘‛`]/g, "'")    // curly/back single quotes → '
    .replace(/[“”„]/g, '"')     // curly double quotes → "
    .replace(/\s+/g, ' ')
    .trim();
}

const SUBJECT_INDEX: Map<string, NudgeKey> = new Map(
  (Object.entries(SUPERCONTROL_CONFIG.subjects) as [NudgeKey, string][]).map(
    ([key, subject]) => [normalize(subject), key],
  ),
);

export function matchSubject(subject: string | null | undefined): NudgeKey | null {
  if (!subject) return null;
  return SUBJECT_INDEX.get(normalize(subject)) ?? null;
}

export function isSuperControlSender(fromAddress: string | null | undefined): boolean {
  if (!fromAddress) return false;
  return fromAddress.trim().toLowerCase() === SUPERCONTROL_CONFIG.senderEmail.toLowerCase();
}
