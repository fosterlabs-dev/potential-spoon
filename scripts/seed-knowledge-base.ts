/**
 * Seed/update KnowledgeBase table in Airtable.
 *
 * Usage:
 *   npm run seed:kb
 *
 * Idempotent: upserts by topic_key. Edit KB_ENTRIES below and re-run.
 *
 * Airtable table must have fields: topic_key (string), question_examples (long text),
 * answer (long text), active (checkbox).
 */
import Airtable from 'airtable';

type KbRow = {
  topic_key: string;
  question_examples: string;
  answer: string;
  active?: boolean;
};

const KB_ENTRIES: KbRow[] = [
  {
    topic_key: 'pool_overview',
    question_examples: 'is there a pool, do you have a pool, swimming pool, what about the pool, pool size',
    answer: `Yes — there's a lovely outdoor pool at the house, set in a beautiful spot overlooking the countryside.\n\nIt's one of the favourite features of Bonté Maison, especially over the long summer days. Guests tend to spend a lot of the day in and around it.`,
  },
  {
    topic_key: 'pool_heated',
    question_examples: 'is the pool heated, pool temperature, warm pool',
    answer: `The pool isn't heated — it's warmed naturally by the sun, which works really well here.\n\nFrom around June through to September it sits at a really lovely temperature, and guests tend to spend most of the day in and around it.\n\nIt's one of those pools that just feels right for the setting — especially with the views and long summer days.`,
  },
  {
    topic_key: 'outdoor_area',
    question_examples: 'outdoor area, garden, terrace, outside, outdoor space, BBQ, grounds',
    answer: `There's a wonderful outdoor area to enjoy — a terrace for meals, plenty of space to relax, and lovely views over the surrounding countryside and vineyards.\n\nIn the warmer months it's where most of the day naturally spends itself: long lunches outside, evenings on the terrace, and quiet time around the pool.`,
  },
  {
    topic_key: 'sleeps',
    question_examples: 'how many people, how many guests, how many bedrooms, capacity',
    answer: `The house comfortably sleeps 10 across five bedrooms.\n\nWe can also accommodate an 11th guest if it's a child, using a good quality fold-out bed that's already at the house.\n\nThere are also two cots available if needed, so it works really well for families or mixed groups.`,
  },
  {
    topic_key: 'car_needed',
    question_examples: 'do we need a car, is a car required, can we get around without a car',
    answer: `Yes, I would definitely recommend having a car.\n\nThe house is in a lovely, peaceful setting surrounded by countryside and vineyards, which is part of what makes it so special, but it does mean you'll want a car to explore properly.\n\nThere are some fantastic local towns, markets and restaurants nearby, all within a short drive.`,
  },
  {
    topic_key: 'ev_charger',
    question_examples: 'EV charger, electric car charging, Tesla, electric vehicle',
    answer: `There isn't an EV charger at the house itself.\n\nHowever, there are charging points available locally in the nearby towns, so it's still very manageable if you're travelling with an electric car. The nearest is at 80 Avenue de la Résistance, 33220 Pineuilh (about 10 minutes' drive).`,
  },
  {
    topic_key: 'pool_towels',
    question_examples: 'pool towels, towels provided, do we need to bring towels',
    answer: `Yes — all towels are provided, including pool towels.\n\nEverything is set up so you can arrive and settle in straight away.`,
  },
  {
    topic_key: 'nearest_shops',
    question_examples: 'nearest shops, supermarket, groceries, where to shop',
    answer: `The nearest shops are just a short drive away in the local towns. You've got everything you need nearby — bakeries, supermarkets, and some really good local markets, especially in the summer months.\n\nMost guests tend to pick things up on the way in, then top up locally during the week.\n\nHere are the recommendations:\n- E.Leclerc Pineuilh — 80 Avenue de la Résistance, 33220 Pineuilh (huge hypermarket)\n- Carrefour Contact — 83 Chemin Boutères Pourraou, 47120 Duras`,
  },
  {
    topic_key: 'cot_highchair',
    question_examples: 'cot, highchair, baby equipment, travelling with a baby',
    answer: `Yes — there are two cots and two highchairs at the house.\n\nIt's very well set up for families, so you shouldn't need to bring those with you.`,
  },
  {
    topic_key: 'dogs',
    question_examples: 'dogs allowed, pet friendly, can we bring our dog',
    answer: `Yes — dogs are very welcome, no limit.\n\nThe house works really nicely for them — plenty of outdoor space and walks nearby.`,
  },
  {
    topic_key: 'check_in_out_times',
    question_examples: 'check-in time, check-out time, arrival time, when can we arrive',
    answer: `Check-in is from 4pm on Sunday, and check-out is by 10am the following Sunday.\n\nThat timing allows us to get everything perfectly prepared for your arrival. Most guests arrive mid to late afternoon and settle straight into the evening.\n\nIf you're running ahead of schedule, it's well worth stopping off at St Emilion if driving from Bordeaux — a fabulous UNESCO world heritage town where wine has been produced for centuries. Closer to Bonté, Sainte-Foy and Duras are both lovely for a coffee on the terraces.`,
  },
  {
    topic_key: 'location',
    question_examples: 'where is the property, location, nearest airport, how to get there',
    answer: `Bonté Maison is near Duras in south-west France — between Bordeaux and Bergerac, right in the middle of wine country.\n\nIt's a quiet, private spot surrounded by vineyards, with some fantastic medieval towns nearby: Eymet, Duras and Bergerac are all close. It's a great base for exploring the Dordogne.`,
  },
  {
    topic_key: 'how_to_book',
    question_examples: 'how do I book, how can I book, how to reserve, booking process, how do I confirm, how to pay',
    answer: `The quickest way to book is straight through the website at www.bontemaison.com.\n\nYou can confirm everything and secure the dates there directly, all cards accepted with secure 3D payment, and you'll receive full confirmation details by email.`,
  },
  {
    topic_key: 'deposit',
    question_examples: 'deposit, how much deposit, what is the deposit, deposit needed, deposit amount, payment terms, booking terms',
    answer: `Deposit and balance details are all set out on the website when you book at www.bontemaison.com.\n\nEverything is laid out clearly there, including the deposit and what's due when.`,
  },
];

type FieldSet = {
  topic_key: string;
  question_examples: string;
  answer: string;
  active?: boolean;
};

const { AIRTABLE_API_KEY, AIRTABLE_BASE_ID } = process.env;
if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) {
  console.error('AIRTABLE_API_KEY and AIRTABLE_BASE_ID must be set.');
  process.exit(1);
}

const base = new Airtable({ apiKey: AIRTABLE_API_KEY }).base(AIRTABLE_BASE_ID);
const table = base<FieldSet>('KnowledgeBase');

async function upsert(row: KbRow): Promise<'created' | 'updated' | 'unchanged'> {
  const existing = await table
    .select({
      filterByFormula: `{topic_key}='${row.topic_key}'`,
      maxRecords: 1,
    })
    .firstPage();

  const fields: FieldSet = {
    topic_key: row.topic_key,
    question_examples: row.question_examples,
    answer: row.answer
  };

  if (existing.length === 0) {
    await table.create(fields);
    return 'created';
  }

  const current = existing[0];
  if (
    current.fields.question_examples === fields.question_examples &&
    current.fields.answer === fields.answer &&
    current.fields.active === fields.active
  ) {
    return 'unchanged';
  }

  await table.update(current.id, fields);
  return 'updated';
}

async function main(): Promise<void> {
  let created = 0;
  let updated = 0;
  let unchanged = 0;

  for (const row of KB_ENTRIES) {
    const result = await upsert(row);
    if (result === 'created') {
      created++;
      console.log(`+ created  ${row.topic_key}`);
    } else if (result === 'updated') {
      updated++;
      console.log(`~ updated  ${row.topic_key}`);
    } else {
      unchanged++;
      console.log(`  unchanged ${row.topic_key}`);
    }
  }

  console.log(
    `\nDone. ${created} created, ${updated} updated, ${unchanged} unchanged (total ${KB_ENTRIES.length}).`,
  );
}

main().catch((err: Error) => {
  console.error('Seed failed:', err.message);
  process.exit(1);
});
