import { AnyFields, FakeAirtable } from '../helpers/mocks';

const PRICING_BANDS: Array<{
  label: string;
  start_date: string;
  end_date: string;
  weekly: number;
}> = [
  { label: 'High Summer 2027', start_date: '2027-07-01', end_date: '2027-08-28', weekly: 4995 },
  { label: 'Summer 2027', start_date: '2027-05-01', end_date: '2027-06-30', weekly: 3995 },
  { label: 'Autumn 2027', start_date: '2027-08-29', end_date: '2027-09-30', weekly: 3995 },
  { label: 'Late Autumn 2027', start_date: '2027-10-01', end_date: '2027-11-30', weekly: 2495 },
];

const TEMPLATES = [
  'greeting_ask_dates',
  'dates_unclear_ask_clarify',
  'dates_not_sunday_to_sunday',
  'minimum_stay_not_met',
  'availability_yes_quote',
  'availability_no_handoff',
  'availability_subject_to_confirmation',
  'september_wine_harvest_note',
  'hold_offer_post_quote',
  'hold_confirmed',
  'hold_reminder',
  'hold_expired',
  'booking_confirmed_handoff',
  'booking_confirmed_instant_book',
  'faq_unknown_handoff',
  'year_2026_redirect',
  'long_stay_manual_pricing',
  'discount_request',
  'group_size_confirmation',
  'followup_24h',
  'followup_7d',
  'human_request_handoff',
  'complaint_handoff',
  'unclear_handoff',
];

const KB_TOPICS: Array<{ topic_key: string; question_examples: string; answer: string }> = [
  {
    topic_key: 'pool_heated',
    question_examples: 'is the pool heated, pool heating, heated pool',
    answer: 'The pool is sun-warmed and lovely from June to September.',
  },
  {
    topic_key: 'sleeps',
    question_examples: 'how many does it sleep, capacity, bedrooms',
    answer: '5 bedrooms, sleeps 10 (11 with the child fold-out). Can I check dates for you?',
  },
  {
    topic_key: 'car_needed',
    question_examples: 'do we need a car, car required',
    answer: 'A car is recommended — the villa is rural.',
  },
  {
    topic_key: 'ev_charger',
    question_examples: 'EV charger, electric car charging',
    answer: 'No charger on-site; nearest is in Pineuilh, about 10 minutes away.',
  },
  {
    topic_key: 'pool_towels',
    question_examples: 'pool towels, do you provide towels',
    answer: 'All towels including pool towels are provided.',
  },
  {
    topic_key: 'nearest_shops',
    question_examples: 'where are shops, nearest supermarket',
    answer: 'E.Leclerc in Pineuilh and Carrefour in Duras.',
  },
  {
    topic_key: 'cot_highchair',
    question_examples: 'cot, highchair, baby equipment',
    answer: 'We have 2 cots and 2 highchairs available.',
  },
  {
    topic_key: 'dogs',
    question_examples: 'can we bring dogs, pet policy',
    answer: 'Dogs welcome — no limit on numbers.',
  },
  {
    topic_key: 'check_in_out_times',
    question_examples: 'check in time, check out time',
    answer: 'Check-in 4pm Sunday, check-out 10am Sunday.',
  },
  {
    topic_key: 'location',
    question_examples: 'where is it, location, area',
    answer: 'Near Duras in south-west France, on the edge of the Dordogne.',
  },
];

export function seedAll(airtable: FakeAirtable): void {
  airtable.reset();

  airtable.seed(
    'Pricing',
    PRICING_BANDS.map<AnyFields>((b) => ({
      label: b.label,
      start_date: b.start_date,
      end_date: b.end_date,
      weekly_rate: b.weekly,
      min_weeks: 1,
    })),
  );

  airtable.seed(
    'Templates',
    TEMPLATES.map<AnyFields>((key) => ({
      key,
      variant: 1,
      text: `[${key}] reply`,
    })),
  );

  airtable.seed('KnowledgeBase', KB_TOPICS.map<AnyFields>((t) => ({ ...t, active: true })));

  airtable.seed(
    'Fragments',
    KB_TOPICS.map<AnyFields>((t) => ({
      key: t.topic_key,
      category: 'knowledge',
      text: t.answer,
      topic_keys: [t.topic_key],
      active: true,
    })),
  );
}
