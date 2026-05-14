/**
 * Send fake SuperControl-style emails to the watcher mailbox so we can
 * verify end-to-end:
 *   1. Watcher polls Gmail IMAP
 *   2. Sender is allowlisted (canonical bookings@bontemaison.com or extras
 *      via SUPERCONTROL_EXTRA_SENDERS)
 *   3. Subject matches one of SUPERCONTROL_CONFIG.subjects exactly
 *   4. NudgeDispatcher resolves the guest by To: email in Airtable
 *   5. whatsapp.sendTemplate(phone, key, {{1}}: name) fires
 *
 * Usage:
 *   npm run test:email                  # sends ALL eight SuperControl subjects
 *   npm run test:email -- pre_arrival   # sends one specific subject by short key
 *   npm run test:email -- "Custom"      # sends an arbitrary subject (won't match)
 *   npm run test:email -- pre_arrival guest@x.com   # also override To
 *
 * Defaults:
 *   to -> SUPERCONTROL_IMAP_USER (so we always land in the watched inbox)
 *
 * NOTE: nudge_* templates are sent via Meta-approved WhatsApp Business
 * Templates (sendTemplate), so they bypass the 24h customer-service window.
 */
import * as nodemailer from 'nodemailer';
import { SUPERCONTROL_CONFIG } from '../src/email-integration/subject-matcher';

// Short-key aliases so the CLI can say "pre_arrival" instead of the full subject.
const SHORT_KEYS: Record<string, keyof typeof SUPERCONTROL_CONFIG.subjects> = {
  booking_confirmation: 'nudge_booking_confirmation',
  weeks_4:              'nudge_4_weeks_anticipation',
  weeks_1:              'nudge_1_week_practical',
  pre_arrival:          'nudge_pre_arrival',
  mid_stay:             'nudge_mid_stay',
  before_departure:     'nudge_before_departure',
  thank_you:            'nudge_thank_you',
  re_engagement:        'nudge_re_engagement',
};

const DELAY_BETWEEN_MS = 6000;

async function main(): Promise<void> {
  const arg = process.argv[2];
  const toArg = process.argv[3];
  const to = toArg ?? process.env.SUPERCONTROL_IMAP_USER;
  if (!to) {
    throw new Error(
      'Set SUPERCONTROL_IMAP_USER in .env or pass a To address as the third arg.',
    );
  }

  const host = required('SMTP_HOST');
  const port = parseInt(process.env.SMTP_PORT ?? '587', 10);
  const user = required('SMTP_USER');
  const pass = required('SMTP_PASS');
  const from = process.env.SMTP_FROM ?? user;

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });

  const queue = resolveQueue(arg);
  console.log(`sending ${queue.length} test email(s) to ${to} from ${from}\n`);

  for (let i = 0; i < queue.length; i++) {
    const { subject, expects } = queue[i];
    const info = await transporter.sendMail({
      from,
      to,
      subject,
      text:
        `Test SuperControl-style email.\n` +
        `Subject is matched by the watcher; guest is resolved via the To: address.\n` +
        `Expected nudge key: ${expects ?? '(no match expected)'}\n`,
    });
    console.log(`[${i + 1}/${queue.length}] sent`, {
      subject,
      expects: expects ?? '(no match expected)',
      messageId: info.messageId,
    });
    if (i < queue.length - 1) await sleep(DELAY_BETWEEN_MS);
  }

  console.log(
    `\ndone. Watcher polls every ${process.env.SUPERCONTROL_IMAP_POLL_MS ?? 30000}ms — give it a minute, then check the app logs.`,
  );
}

type QueueItem = { subject: string; expects?: string };

function resolveQueue(arg: string | undefined): QueueItem[] {
  if (!arg) {
    return (Object.entries(SUPERCONTROL_CONFIG.subjects) as [
      keyof typeof SUPERCONTROL_CONFIG.subjects,
      string,
    ][]).map(([expects, subject]) => ({ subject, expects }));
  }

  // Short-key alias?
  const aliased = SHORT_KEYS[arg];
  if (aliased) {
    return [{ subject: SUPERCONTROL_CONFIG.subjects[aliased], expects: aliased }];
  }

  // Full template key?
  if (arg in SUPERCONTROL_CONFIG.subjects) {
    const key = arg as keyof typeof SUPERCONTROL_CONFIG.subjects;
    return [{ subject: SUPERCONTROL_CONFIG.subjects[key], expects: key }];
  }

  // Arbitrary literal subject — won't match the gate, but useful for negative tests.
  return [{ subject: arg }];
}

function required(key: string): string {
  const v = process.env[key];
  if (!v) throw new Error(`Missing env var ${key}`);
  return v;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((err) => {
  console.error('test email failed:', err);
  process.exit(1);
});
