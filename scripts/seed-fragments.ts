/**
 * Seed/update Fragments table in Airtable.
 *
 * Usage:
 *   npm run seed:fragments
 *
 * Idempotent: upserts by `key`. Edit FRAGMENTS below and re-run.
 *
 * Required Airtable schema for `Fragments`:
 *   - key            (single line text, primary)
 *   - category       (single select: opener | knowledge | nudge | closer)
 *   - text           (long text)
 *   - topic_keys     (multi-select OR comma-separated text)
 *   - active         (checkbox)
 */
import Airtable from 'airtable';

type FragmentRow = {
  key: string;
  category: 'opener' | 'knowledge' | 'nudge' | 'closer';
  text: string;
  topic_keys: string[];
};

const FRAGMENTS: FragmentRow[] = [
  // ── Openers (warm acknowledgments, no facts) ─────────────────────────
  { key: 'opener_yes_of_course', category: 'opener', text: 'Yes of course,', topic_keys: [] },
  { key: 'opener_happy_to_help', category: 'opener', text: 'Happy to help,', topic_keys: [] },
  { key: 'opener_no_problem', category: 'opener', text: 'No problem at all,', topic_keys: [] },
  { key: 'opener_good_news', category: 'opener', text: 'Good news,', topic_keys: [] },
  { key: 'opener_apology', category: 'opener', text: "Sorry, I think I misread —", topic_keys: [] },

  // ── Knowledge (factual answers, no greeting/sign-off) ────────────────
  {
    key: 'pool_overview',
    category: 'knowledge',
    text: "Yes, there's a lovely outdoor pool at the house, set in a beautiful spot overlooking the countryside. It's one of the favourite features of Bonté Maison, especially over the long summer days.",
    topic_keys: ['pool_overview'],
  },
  {
    key: 'pool_unheated',
    category: 'knowledge',
    text: "The pool isn't heated, but it's warmed naturally by the sun and from around June through September it sits at a really lovely temperature. There are also two hot tubs at the house, lovely for relaxing in the evenings.",
    topic_keys: ['pool_heated'],
  },
  {
    key: 'outdoor_area',
    category: 'knowledge',
    text: "There's a wonderful outdoor area, a terrace for meals, plenty of space to relax, and lovely views over the surrounding countryside and vineyards. In the warmer months most of the day naturally spends itself outside.",
    topic_keys: ['outdoor_area'],
  },
  {
    key: 'sleeps',
    category: 'knowledge',
    text: 'The house comfortably sleeps 10 across five bedrooms. We can also accommodate an 11th guest if it is a child, using a good quality fold-out bed.',
    topic_keys: ['sleeps'],
  },
  {
    key: 'car_recommended',
    category: 'knowledge',
    text: "Yes, I'd recommend a car. The house is in a peaceful setting surrounded by countryside and vineyards — there are great local towns and markets within a short drive.",
    topic_keys: ['car_needed'],
  },
  {
    key: 'ev_charger',
    category: 'knowledge',
    text: "There isn't an EV charger at the house itself, but there are charging points in the nearby towns. The nearest is at Pineuilh, about 10 minutes' drive.",
    topic_keys: ['ev_charger'],
  },
  {
    key: 'pool_towels',
    category: 'knowledge',
    text: 'All towels are provided, including pool towels.',
    topic_keys: ['pool_towels'],
  },
  {
    key: 'nearest_shops',
    category: 'knowledge',
    text: 'The nearest shops are a short drive away — bakeries, supermarkets, and good local markets in summer. E.Leclerc in Pineuilh and Carrefour in Duras are the main options.',
    topic_keys: ['nearest_shops'],
  },
  {
    key: 'cots_highchairs',
    category: 'knowledge',
    text: 'There are two cots and two highchairs at the house — very well set up for families.',
    topic_keys: ['cot_highchair'],
  },
  {
    key: 'dogs_allowed',
    category: 'knowledge',
    text: 'Dogs are very welcome and there is no limit. The house works really nicely for them, with plenty of outdoor space and walks nearby.',
    topic_keys: ['dogs'],
  },
  {
    key: 'check_in_times',
    category: 'knowledge',
    text: 'Check-in is from 4pm on Sunday, and check-out is by 10am the following Sunday.',
    topic_keys: ['check_in_out_times'],
  },
  {
    key: 'location',
    category: 'knowledge',
    text: 'Bonté Maison is near Duras in south-west France — between Bordeaux and Bergerac, in the heart of wine country.',
    topic_keys: ['location'],
  },
  {
    key: 'how_to_book',
    category: 'knowledge',
    text: 'The easiest way is to book directly online at www.bontemaison.com, just select Booking from the menu and the system will guide you through everything, including the 25% deposit to secure the dates. The balance is due 8 weeks before arrival. All major cards accepted, in £ or €. I am also very happy to handle the booking for you, or to jump on a quick call if that would help.',
    topic_keys: ['how_to_book'],
  },
  {
    key: 'deposit',
    category: 'knowledge',
    text: 'A 25% deposit secures the dates, with the remaining balance due 8 weeks before arrival. We also take a £200 refundable security deposit, returned after the stay. Payments can be made in £ or €, all major cards accepted.',
    topic_keys: ['deposit'],
  },
  {
    key: 'property_overview',
    category: 'knowledge',
    text: 'Bonté is a private luxury villa in the Dordogne, set in peaceful countryside close to Duras, Eymet and Bergerac and well placed for the Bordeaux wine region. It sleeps 10 across five bedrooms (two king-size and three twin), with an additional fold-out bed for an 11th child. The house is reserved exclusively for your group and includes a private pool, two hot tubs, large outdoor dining space, BBQ, pétanque court, fast WiFi, bedding, towels, pool towels, cleaning and a welcome pack on arrival.',
    topic_keys: ['property_overview'],
  },
  {
    key: 'bike_hire',
    category: 'knowledge',
    text: 'Yes, the area around Bonté is excellent for cycling, with quiet country roads and vineyard routes around Duras and Eymet. Local companies can arrange bike hire and in many cases deliver to the house or meet guests nearby. Happy to point you towards suitable local options before you arrive.',
    topic_keys: ['bike_hire'],
  },
  {
    key: 'air_conditioning',
    category: 'knowledge',
    text: "There isn't air conditioning at Bonté. The house is a traditional French property with thick stone walls and shutters that keep it comfortably cool, particularly when the shutters are used during the warmer parts of the day. There are also fans in the bedrooms, and most of the summer is naturally spent outside by the pool, on the terrace or in the evening shade.",
    topic_keys: ['air_conditioning'],
  },

  // ── Nudges (gentle prompts toward booking) ───────────────────────────
  {
    key: 'nudge_hold',
    category: 'nudge',
    text: 'Happy to hold those dates for you for a few days while you have a think.',
    topic_keys: [],
  },
  {
    key: 'nudge_pencil_in',
    category: 'nudge',
    text: 'I can pencil those dates in for you while you decide — just say the word.',
    topic_keys: [],
  },
  {
    key: 'nudge_popular_time',
    category: 'nudge',
    text: 'It tends to be a popular week, so worth holding if you are leaning that way.',
    topic_keys: [],
  },

  // ── Closers removed: "Many thanks" handles the sign-off; a separate
  //     closer line would feel redundant in chat.
];

type FieldSet = {
  key: string;
  category: string;
  text: string;
  topic_keys: string[] | string;
  active?: boolean;
};

const { AIRTABLE_API_KEY, AIRTABLE_BASE_ID } = process.env;
if (!AIRTABLE_API_KEY || !AIRTABLE_BASE_ID) {
  console.error('AIRTABLE_API_KEY and AIRTABLE_BASE_ID must be set.');
  process.exit(1);
}

const base = new Airtable({ apiKey: AIRTABLE_API_KEY }).base(AIRTABLE_BASE_ID);
const table = base<FieldSet>('Fragments');

async function upsert(row: FragmentRow): Promise<'created' | 'updated' | 'unchanged'> {
  const existing = await table
    .select({
      filterByFormula: `{key}='${row.key}'`,
      maxRecords: 1,
    })
    .firstPage();

  const fields = {
    key: row.key,
    category: row.category,
    text: row.text,
    topic_keys: row.topic_keys,
    active: true,
  };

  if (existing.length === 0) {
    await table.create(fields, { typecast: true });
    return 'created';
  }

  const current = existing[0];
  if (
    current.fields.text === row.text &&
    current.fields.category === row.category
  ) {
    return 'unchanged';
  }

  await table.update(current.id, fields, { typecast: true });
  return 'updated';
}

async function main(): Promise<void> {
  let created = 0;
  let updated = 0;
  let unchanged = 0;

  for (const row of FRAGMENTS) {
    const result = await upsert(row);
    if (result === 'created') {
      created++;
      console.log(`+ created  ${row.key}`);
    } else if (result === 'updated') {
      updated++;
      console.log(`~ updated  ${row.key}`);
    } else {
      unchanged++;
      console.log(`  unchanged ${row.key}`);
    }
  }

  console.log(
    `\nDone. ${created} created, ${updated} updated, ${unchanged} unchanged (total ${FRAGMENTS.length}).`,
  );
}

main().catch((err: Error) => {
  console.error('Seed failed:', err.message);
  process.exit(1);
});
