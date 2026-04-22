/**
 * Seed/update Templates table in Airtable.
 *
 * Usage:
 *   npm run seed:templates
 *
 * Idempotent: upserts by (key, variant). Edit TEMPLATES below and re-run.
 */
import Airtable from 'airtable';

type TemplateRow = {
  key: string;
  variant: number;
  text: string;
};

const TEMPLATES: TemplateRow[] = [
  // ── Greeting (customer said hi, no dates yet) ─────────────────────────
  {
    key: 'greeting_ask_dates',
    variant: 1,
    text: "Hi! Thanks for reaching out. What dates are you looking at, and how many guests?",
  },
  {
    key: 'greeting_ask_dates',
    variant: 2,
    text: "Hello! Happy to help. Could you share your check-in and check-out dates, plus the number of guests?",
  },
  {
    key: 'greeting_ask_dates',
    variant: 3,
    text: "Hi there! Let me know the dates you have in mind and how many people will be staying.",
  },

  // ── Availability: yes, with quote ─────────────────────────────────────
  {
    key: 'availability_yes_quote',
    variant: 1,
    text: "Good news — {checkIn} to {checkOut} ({nights} nights) is available. Total: {total}. Want me to put you in touch with the owner to confirm?",
  },
  {
    key: 'availability_yes_quote',
    variant: 2,
    text: "Those dates are free! {nights} nights from {checkIn} to {checkOut} comes to {total}. Shall I connect you with the owner to book?",
  },
  {
    key: 'availability_yes_quote',
    variant: 3,
    text: "Yes, {checkIn} → {checkOut} is open. {nights} nights, {total} total. Let me know if you'd like to move forward.",
  },

  // ── Availability: no ──────────────────────────────────────────────────
  {
    key: 'availability_no_handoff',
    variant: 1,
    text: "Sorry, {checkIn} to {checkOut} isn't available. Would other dates work for you?",
  },
  {
    key: 'availability_no_handoff',
    variant: 2,
    text: "Unfortunately those dates are already booked. Happy to check other dates if you have flexibility.",
  },
  {
    key: 'availability_no_handoff',
    variant: 3,
    text: "Those nights are taken. If you can shift your dates, I can check again.",
  },

  // ── Minimum stay not met ──────────────────────────────────────────────
  {
    key: 'minimum_stay_not_met',
    variant: 1,
    text: "The minimum stay for those dates is {minNights} nights. Could you extend your trip?",
  },
  {
    key: 'minimum_stay_not_met',
    variant: 2,
    text: "We have a {minNights}-night minimum for that period. Let me know if you can adjust.",
  },
  {
    key: 'minimum_stay_not_met',
    variant: 3,
    text: "Those dates require at least {minNights} nights. Want to try a longer stay?",
  },

  // ── Dates unclear, ask for clarification ──────────────────────────────
  {
    key: 'dates_unclear_ask_clarify',
    variant: 1,
    text: "Could you confirm the exact dates (check-in and check-out) so I can check availability?",
  },
  {
    key: 'dates_unclear_ask_clarify',
    variant: 2,
    text: "Just to be sure — what's your check-in date and check-out date?",
  },
  {
    key: 'dates_unclear_ask_clarify',
    variant: 3,
    text: "Can you share the specific dates you're thinking of? That way I can check if we're free.",
  },

  // ── Booking confirmation intent → hand off ────────────────────────────
  {
    key: 'booking_confirmed_handoff',
    variant: 1,
    text: "Great! I'll pass you to the owner now to finalize the booking. One moment.",
  },
  {
    key: 'booking_confirmed_handoff',
    variant: 2,
    text: "Wonderful — connecting you with the owner to sort out the details.",
  },
  {
    key: 'booking_confirmed_handoff',
    variant: 3,
    text: "Perfect. The owner will reach out shortly to confirm the booking.",
  },

  // ── FAQ we can't answer → hand off ────────────────────────────────────
  {
    key: 'faq_unknown_handoff',
    variant: 1,
    text: "Good question — let me get the owner to answer that properly. They'll be in touch shortly.",
  },
  {
    key: 'faq_unknown_handoff',
    variant: 2,
    text: "I'll pass that to the owner so they can give you an accurate answer.",
  },
  {
    key: 'faq_unknown_handoff',
    variant: 3,
    text: "Let me check with the owner on that — they'll reply here soon.",
  },

  // ── Pricing asked without dates ───────────────────────────────────────
  {
    key: 'pricing_needs_dates',
    variant: 1,
    text: "Prices vary by season. Could you share your dates so I can give you an exact quote?",
  },
  {
    key: 'pricing_needs_dates',
    variant: 2,
    text: "Rates depend on the dates. What check-in and check-out are you thinking of?",
  },
  {
    key: 'pricing_needs_dates',
    variant: 3,
    text: "Happy to quote — just need your dates first.",
  },

  // ── Explicit human request ────────────────────────────────────────────
  {
    key: 'human_request_handoff',
    variant: 1,
    text: "Of course — I'll let the owner know you'd like to chat. They'll reply here shortly.",
  },
  {
    key: 'human_request_handoff',
    variant: 2,
    text: "Sure thing, passing you to the owner now.",
  },
  {
    key: 'human_request_handoff',
    variant: 3,
    text: "Got it — the owner will take over from here.",
  },

  // ── Complaint / frustration → hand off immediately ────────────────────
  {
    key: 'complaint_handoff',
    variant: 1,
    text: "I'm sorry to hear that. I'm letting the owner know right away so they can help.",
  },
  {
    key: 'complaint_handoff',
    variant: 2,
    text: "Apologies for the trouble — the owner will reach out to you shortly.",
  },
  {
    key: 'complaint_handoff',
    variant: 3,
    text: "Sorry about that. Passing this to the owner straight away.",
  },

  // ── Unclear / off-topic → hand off ────────────────────────────────────
  {
    key: 'unclear_handoff',
    variant: 1,
    text: "Let me get the owner to take a look at this — they'll be with you shortly.",
  },
  {
    key: 'unclear_handoff',
    variant: 2,
    text: "I'll pass this along so the owner can reply properly.",
  },
  {
    key: 'unclear_handoff',
    variant: 3,
    text: "Hold on a moment — the owner will jump in to help.",
  },

  // ── September wine harvest appended note ──────────────────────────────
  {
    key: 'september_wine_harvest_note',
    variant: 1,
    text: "Heads up: September is wine-harvest season here, so the area is especially lively — lots of local events at the vineyards.",
  },
  {
    key: 'september_wine_harvest_note',
    variant: 2,
    text: "One note — in September we're right in the middle of the wine harvest, so expect a buzzier atmosphere around the vineyards.",
  },
];

type FieldSet = { key: string; variant: number; text: string };

const { AIRTABLE_API_KEY, AIRTABLE_BASE_ID } = process.env;
if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) {
  console.error('AIRTABLE_API_KEY and AIRTABLE_BASE_ID must be set.');
  process.exit(1);
}

const base = new Airtable({ apiKey: AIRTABLE_API_KEY }).base(AIRTABLE_BASE_ID);
const table = base<FieldSet>('Templates');

async function upsert(row: TemplateRow): Promise<'created' | 'updated' | 'unchanged'> {
  const existing = await table
    .select({
      filterByFormula: `AND({key}='${row.key}', {variant}=${row.variant})`,
      maxRecords: 1,
    })
    .firstPage();

  if (existing.length === 0) {
    await table.create({ key: row.key, variant: row.variant, text: row.text });
    return 'created';
  }

  const current = existing[0];
  if (current.fields.text === row.text) return 'unchanged';

  await table.update(current.id, { text: row.text });
  return 'updated';
}

async function main(): Promise<void> {
  let created = 0;
  let updated = 0;
  let unchanged = 0;

  for (const row of TEMPLATES) {
    const result = await upsert(row);
    const label = `${row.key}#${row.variant}`;
    if (result === 'created') {
      created++;
      console.log(`+ created  ${label}`);
    } else if (result === 'updated') {
      updated++;
      console.log(`~ updated  ${label}`);
    } else {
      unchanged++;
      console.log(`  unchanged ${label}`);
    }
  }

  console.log(
    `\nDone. ${created} created, ${updated} updated, ${unchanged} unchanged (total ${TEMPLATES.length}).`,
  );
}

main().catch((err: Error) => {
  console.error('Seed failed:', err.message);
  process.exit(1);
});
