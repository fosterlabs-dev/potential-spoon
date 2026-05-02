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
  // ── 1. ENQUIRY FLOW ──────────────────────────────────────────────────

  // greeting_ask_dates
  {
    key: 'greeting_ask_dates',
    variant: 1,
    text: `Hi! How can I help?\n\nMany thanks`,
  },
  {
    key: 'greeting_ask_dates',
    variant: 2,
    text: `Hello! What can I help you with?\n\nMany thanks`,
  },
  {
    key: 'greeting_ask_dates',
    variant: 3,
    text: `Hi! How can I help?\n\nMany thanks`,
  },

  // dates_unclear_ask_clarify
  {
    key: 'dates_unclear_ask_clarify',
    variant: 1,
    text: `Thanks, just to make sure I quote the right week, could you share the specific dates? For example: "9th to 16th August".\n\nWe run Sunday to Sunday, so any week in that window should work well. Once I have the exact dates I'll come back with availability and pricing.\n\nMany thanks`,
  },
  {
    key: 'dates_unclear_ask_clarify',
    variant: 2,
    text: `To make sure I check the right dates, could you let me know the exact Sunday you'd arrive and Sunday you'd leave?\n\nMany thanks`,
  },
  {
    key: 'dates_unclear_ask_clarify',
    variant: 3,
    text: `Thank you, could you confirm the exact dates you have in mind? The house runs Sunday to Sunday, so something like "12th to 19th July" is perfect.\n\nMany thanks`,
  },

  // dates_not_sunday_to_sunday
  {
    key: 'dates_not_sunday_to_sunday',
    variant: 1,
    text: `Thanks for those dates.\n\nThe house runs on Sunday changeovers, so the closest Sunday-to-Sunday week to what you're looking at would be {suggested_check_in} to {suggested_check_out}.\n\nWould that work for you? Happy to check availability if so.\n\nMany thanks`,
  },
  {
    key: 'dates_not_sunday_to_sunday',
    variant: 2,
    text: `Thank you, one thing to mention, Bonté Maison is let Sunday to Sunday only.\n\nBased on your preferred dates, the nearest option would be {suggested_check_in} to {suggested_check_out}. Let me know if that works and I'll check availability.\n\nMany thanks`,
  },
  {
    key: 'dates_not_sunday_to_sunday',
    variant: 3,
    text: `Just a quick note, the house runs on Sunday changeovers, so stays are Sunday to Sunday.\n\nWould {suggested_check_in} to {suggested_check_out} work for you? If so, I'll come back with availability.\n\nMany thanks`,
  },

  // minimum_stay_not_met
  {
    key: 'minimum_stay_not_met',
    variant: 1,
    text: `Thanks for reaching out.\n\nThe house has a 7-night minimum stay, Sunday to Sunday. If you can stretch to {suggested_check_out} that would give you a full week, and honestly, most guests say a week flies by.\n\nLet me know and I'll check availability.\n\nMany thanks`,
  },
  {
    key: 'minimum_stay_not_met',
    variant: 2,
    text: `Thank you, bookings here are in one-week blocks (Sunday to Sunday), so the minimum would be {suggested_check_in} to {suggested_check_out}.\n\nIf that works, I'll check availability for you.\n\nMany thanks`,
  },

  // ── 2. AVAILABILITY & QUOTING ─────────────────────────────────────────

  // availability_yes_quote
  {
    key: 'availability_yes_quote',
    variant: 1,
    text: `Great news, the villa is available from {check_in} to {check_out}.\n\nFor {nights} nights, it's {price}.\n\nIt's a lovely time to be here, warm evenings, local markets, food and wine to enjoy.\n\nIf it helps, I can pencil those dates in for you while you have a think. Just let me know.\n\nMany thanks`,
  },
  {
    key: 'availability_yes_quote',
    variant: 2,
    text: `Thanks for your dates.\n\nGood news, {check_in} to {check_out} is available. The rate for that week is {price}.\n\nThere's loads happening locally that time of year and the house really comes into its own in the evenings.\n\nHappy to hold those dates for you for a few days while you decide, just say the word.\n\nMany thanks`,
  },
  {
    key: 'availability_yes_quote',
    variant: 3,
    text: `Thank you for getting in touch.\n\n{check_in} to {check_out} is available. {nights} nights comes to {price}.\n\nIf you'd like, I can pencil those dates in for you while you have a think, it's always worth doing as we do get a lot of enquiries.\n\nMany thanks`,
  },
  {
    key: 'availability_yes_quote',
    variant: 4,
    text: `Lovely to hear from you.\n\nThe villa is free from {check_in} to {check_out}. The total for the week is {price}.\n\nThere's a real atmosphere here that time of year, vineyards, markets, long evenings outside. Most guests end up outside with a drink on that first evening.\n\nWould you like me to hold those dates for you for a few days?\n\nMany thanks`,
  },

  // september_wine_harvest_note (append to quote when check-in is in September)
  {
    key: 'september_wine_harvest_note',
    variant: 1,
    text: `By the way, that's right in the middle of the wine harvest, so there's a lovely atmosphere in the area. Vineyards busy, local food and wine events, usually still hot and sunny.`,
  },
  {
    key: 'september_wine_harvest_note',
    variant: 2,
    text: `One thing to mention, September is one of the best times to visit here. It's wine harvest season, so the whole area comes alive with tastings, markets and vineyard events.`,
  },

  // availability_no_handoff
  // NOTE: do NOT suggest alternative dates here — Jim handles those.
  {
    key: 'availability_no_handoff',
    variant: 1,
    text: `Unfortunately {check_in} to {check_out} is already reserved, {month} tends to book up early.\n\nMany thanks`,
  },
  {
    key: 'availability_no_handoff',
    variant: 2,
    text: `Thank you for your message. That week is already reserved.\n\nMany thanks`,
  },
  {
    key: 'availability_no_handoff',
    variant: 3,
    text: `Appreciate you reaching out.\n\nThose dates are already reserved I'm afraid.\n\nMany thanks`,
  },

  // availability_subject_to_confirmation
  {
    key: 'availability_subject_to_confirmation',
    variant: 1,
    text: `Those dates look available based on what I'm seeing, though it's subject to final confirmation.\n\nI'll double-check and come back to you shortly.\n\nMany thanks`,
  },

  // ── 3. HOLD FLOW ──────────────────────────────────────────────────────

  // hold_offer_post_quote (usually bundled into availability_yes_quote)
  {
    key: 'hold_offer_post_quote',
    variant: 1,
    text: `If it helps, I can hold those dates for you for 5 days while you decide. Just let me know.`,
  },
  {
    key: 'hold_offer_post_quote',
    variant: 2,
    text: `I'm very happy to pencil those dates in for you for 5 days while you have a think, just say the word.`,
  },

  // hold_confirmed
  {
    key: 'hold_confirmed',
    variant: 1,
    text: `Lovely, I've held {check_in} to {check_out} for you.\n\nThose dates are yours until {hold_expiry} (5 days from today). I'll drop you a gentle reminder before then.\n\nIf you'd like to confirm sooner, just let me know.\n\nMany thanks`,
  },
  {
    key: 'hold_confirmed',
    variant: 2,
    text: `That's great, I've pencilled in {check_in} to {check_out} for you.\n\nThey'll stay held until {hold_expiry}. No rush, I'll check in with you before then.\n\nMany thanks`,
  },
  {
    key: 'hold_confirmed',
    variant: 3,
    text: `Perfect, dates held. {check_in} to {check_out} are yours until {hold_expiry}.\n\nI'll send a quick reminder the day before if I haven't heard back. If you have any questions in the meantime, just ask.\n\nMany thanks`,
  },

  // hold_reminder (sent on day 4 of hold)
  {
    key: 'hold_reminder',
    variant: 1,
    text: `Just a quick note, the hold on {check_in} to {check_out} expires tomorrow.\n\nIf you'd still like the week, just let me know and I'll help you through the next step. If plans have changed, no problem at all, let me know and I'll release the dates.\n\nMany thanks`,
  },
  {
    key: 'hold_reminder',
    variant: 2,
    text: `Just checking in, your dates ({check_in} to {check_out}) are held until tomorrow.\n\nHappy to help you confirm, or if you're still thinking let me know and I can extend or release.\n\nMany thanks`,
  },

  // hold_expired (auto-sent when hold expires without reply)
  {
    key: 'hold_expired',
    variant: 1,
    text: `Just to let you know I've released the hold on {check_in} to {check_out} as I hadn't heard back.\n\nNo problem at all, if you'd still like to book or have a look at other dates, just let me know and I'll help.\n\nMany thanks`,
  },
  {
    key: 'hold_expired',
    variant: 2,
    text: `Quick note, the hold on your dates has now expired and I've released them.\n\nCompletely understand plans can change. If you'd like to look at anything else, do give me a shout.\n\nMany thanks`,
  },

  // ── 4. BOOKING CONFIRMATION ───────────────────────────────────────────

  // booking_confirmed_handoff (manual email flow — current)
  {
    key: 'booking_confirmed_handoff',
    variant: 1,
    text: `That's wonderful, delighted you'd like to book.\n\nCould you share your email address? I'll send over everything you need to confirm the week.\n\nMany thanks`,
  },
  {
    key: 'booking_confirmed_handoff',
    variant: 2,
    text: `Thank you, that's great to hear.\n\nIf you could drop me your email address, I'll send over the booking details and next steps.\n\nMany thanks`,
  },
  {
    key: 'booking_confirmed_handoff',
    variant: 3,
    text: `Perfect. Could you share your email address and Jim will send over the booking details to confirm.\n\nMany thanks`,
  },

  // booking_confirmed_instant_book (used once INSTANT_BOOK_ENABLED=true)
  // NOTE: website URL kept — it's the operational point of this scenario.
  {
    key: 'booking_confirmed_instant_book',
    variant: 1,
    text: `That's great, delighted you'd like to book.\n\nThe quickest way is to use the website below, where you can confirm everything and secure the dates instantly. All cards accepted, secure 3D payment.\n\nwww.bontemaison.com\n\nOnce booked, everything is confirmed straight away and you'll receive full details by email.\n\nMany thanks`,
  },
  {
    key: 'booking_confirmed_instant_book',
    variant: 2,
    text: `Thank you, lovely to hear.\n\nYou can book directly on the website, it only takes a moment and everything is confirmed instantly: www.bontemaison.com\n\nYou'll get full details through by email straight after. Any questions, just shout.\n\nMany thanks`,
  },

  // ── 5. FAQ HANDOFF ────────────────────────────────────────────────────
  // Property-fact FAQs (pool, sleeps, car, etc.) now live in the
  // KnowledgeBase table — see scripts/seed-knowledge-base.ts

  {
    key: 'faq_unknown_handoff',
    variant: 1,
    text: `Good question, let me check on that and get back to you shortly.\n\nMany thanks`,
  },
  {
    key: 'faq_unknown_handoff',
    variant: 2,
    text: `Thanks, I'll come back to you on that one shortly so I can give you the right answer.\n\nMany thanks`,
  },
  {
    key: 'faq_unknown_handoff',
    variant: 3,
    text: `Let me check with Jim on that, he'll reply here soon.\n\nMany thanks`,
  },

  // ── 6. SPECIAL CASES ──────────────────────────────────────────────────

  // year_2026_redirect
  {
    key: 'year_2026_redirect',
    variant: 1,
    text: `Thanks for getting in touch.\n\n2026 is fully booked, I'm afraid, it went very quickly this year. However, I do have good availability in 2027 if you'd like to look at dates there?\n\nMany thanks`,
  },
  {
    key: 'year_2026_redirect',
    variant: 2,
    text: `Thank you for your message.\n\nUnfortunately 2026 is now fully reserved. I do still have some lovely weeks available in 2027 though, if you'd like to share roughly when you're thinking, I'll send options.\n\nMany thanks`,
  },

  // long_stay_manual_pricing
  {
    key: 'long_stay_manual_pricing',
    variant: 1,
    text: `Thanks for your enquiry.\n\nFor longer stays in the autumn and winter months (October through May), the pricing is done a bit differently, I'll put something together for you personally and come back shortly with a quote.\n\nMany thanks`,
  },
  {
    key: 'long_stay_manual_pricing',
    variant: 2,
    text: `Thank you for getting in touch.\n\nLonger stays between October and May are something I price individually. Leave it with me and I'll come back to you shortly with options.\n\nMany thanks`,
  },

  // discount_request
  {
    key: 'discount_request',
    variant: 1,
    text: `Thanks for asking.\n\nI don't usually build discounts in as most weeks book well in advance, but let me take a look at your dates and see what might be possible. I'll come back to you shortly.\n\nMany thanks`,
  },
  {
    key: 'discount_request',
    variant: 2,
    text: `Thanks, let me have a look at the dates and get back to you on that.\n\nMany thanks`,
  },

  // group_size_confirmation
  {
    key: 'group_size_confirmation',
    variant: 1,
    text: `Yes, that works very well. The house comfortably sleeps 10 across 5 bedrooms, and we can accommodate an 11th guest if it's a child using a good quality fold-out bed.\n\nThere's plenty of space both inside and outside, so it works really nicely for groups.\n\nIf you'd like to share your dates, I can check availability for you.\n\nMany thanks`,
  },

  // ── 7. FOLLOW-UP SEQUENCE ─────────────────────────────────────────────

  {
    key: 'followup_24h',
    variant: 1,
    text: `Just a quick note as I know plans can take a bit of coordinating.\n\nThose dates are still available at the moment. If it helps, I'm very happy to pencil them in for you while you have a think.\n\nHappy to help if you have any questions at all.\n\nMany thanks`,
  },
  {
    key: 'followup_7d',
    variant: 1,
    text: `Just a final note from me.\n\nTotally understand if plans have changed, but if you're still thinking about a stay, I'd be very happy to help or suggest alternatives.\n\nHappy to help in any way.\n\nMany thanks`,
  },

  // ── 8. SUPERCONTROL EMAIL NUDGES ──────────────────────────────────────
  // NOTE: in-body URLs (arrival-details, useful-guide, tourism page) are
  // functional content, not decorative sign-offs — kept intentionally.

  {
    key: 'nudge_booking_confirmation',
    variant: 1,
    text: `I've just sent over your booking confirmation by email with all the details for your stay.\n\nIf you could have a quick look and let me know everything is in order, that would be great.\n\nReally looking forward to welcoming you to Bonté Maison, I'm sure you'll have an amazing time.\n\nMany thanks`,
  },
  {
    key: 'nudge_directions',
    variant: 1,
    text: `I've just sent you an email with full directions and arrival details for Bonté Maison.\n\nIt should have everything you need for a smooth arrival, but if anything isn't clear just let me know.\n\nThere's more information here:\n- https://bontemaison.com/arrival-details\n- https://bontemaison.com/useful-guide\n\nI'll drop you another message with a reminder just before your holiday.\n\nMany thanks`,
  },
  {
    key: 'nudge_pre_arrival',
    variant: 1,
    text: `Just a quick note ahead of your stay, I've sent a short email with arrival details and a few useful bits for the week.\n\nThe house will be ready for you from 4pm on Sunday.\n\nMost people arrive, settle in and end up outside with a drink on that first evening, it's a great way to start the week.\n\nThere'll be a welcome pack for you at the house, all detailed here:\nhttps://bontemaison.com/arrival-details\n\nSunday afternoon is very quiet in France and most shops are closed, so worth taking a few things with you if you can. Towels, pool towels and bedding are all provided.\n\nIf you need anything before you arrive, just let me know.\n\nMany thanks`,
  },
  {
    key: 'nudge_mid_stay',
    variant: 1,
    text: `Just checking in to make sure everything is perfect for you at the house.\n\nHopefully you've had a chance to settle in and enjoy it properly.\n\nThere's loads happening in the area, one of the best sources for what's on is the local tourism Facebook page: https://www.facebook.com/search/top?q=office%20de%20tourisme%20du%20pays%20de%20duras\n\nIf you need anything at all during your stay, please let me know.\n\nEnjoy the rest of your week.\n\nMany thanks`,
  },
  {
    key: 'nudge_thank_you',
    variant: 1,
    text: `I've just sent you a quick email to say thank you following your stay.\n\nIt was a pleasure having you at Bonté Maison and I hope you had a really special week.\n\nYou'd be very welcome back anytime.\n\nMany thanks`,
  },
  {
    key: 'nudge_review_request',
    variant: 1,
    text: `I've just sent a short email with a quick review link, I'd really appreciate it if you had a moment to take a look.\n\nIt makes a big difference for a small business like ours.\n\nThanks again, and hopefully we'll see you back at Bonté Maison in the future.\n\nMany thanks`,
  },

  // ── 9. ESCALATION & HANDOFF ───────────────────────────────────────────

  {
    key: 'human_request_handoff',
    variant: 1,
    text: `Of course, I'll pass this straight to Jim and he'll come back to you shortly.\n\nMany thanks`,
  },
  {
    key: 'human_request_handoff',
    variant: 2,
    text: `No problem at all, Jim will be in touch with you shortly.\n\nMany thanks`,
  },
  {
    key: 'human_request_handoff',
    variant: 3,
    text: `Got it, Jim will take over from here.\n\nMany thanks`,
  },
  {
    key: 'complaint_handoff',
    variant: 1,
    text: `I'm sorry to hear that, Jim will reach out to you personally as soon as possible.\n\nMany thanks`,
  },
  {
    key: 'complaint_handoff',
    variant: 2,
    text: `Really sorry about this. I'm flagging this to Jim now so he can be in touch with you personally.\n\nMany thanks`,
  },
  {
    key: 'complaint_handoff',
    variant: 3,
    text: `Sorry about that. Passing this to Jim straight away.\n\nMany thanks`,
  },
  {
    key: 'acknowledgment_reply',
    variant: 1,
    text: `Thanks, let me know if anything else comes up.`,
  },
  {
    key: 'acknowledgment_reply',
    variant: 2,
    text: `Thanks — happy to help if anything else comes to mind.`,
  },
  {
    key: 'acknowledgment_reply',
    variant: 3,
    text: `Thanks. Just shout if you need anything else.`,
  },
  {
    key: 'unclear_handoff',
    variant: 1,
    text: `Sorry for the misunderstanding. Could you clarify your question again?\n\nMany thanks`,
  },
  {
    key: 'unclear_handoff',
    variant: 2,
    text: `Apologies if I misread that. Could you rephrase what you'd like to know?\n\nMany thanks`,
  },
  {
    key: 'unclear_handoff',
    variant: 3,
    text: `Sorry, I want to make sure I answer the right thing. Could you let me know what you're after?\n\nMany thanks`,
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
