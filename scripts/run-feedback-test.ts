/**
 * Feedback regression runner.
 *
 * Replays each customer message from `.claude/feedbacks/feedback-1.csv` through
 * the live MessageHandlerService and grades the captured outbound reply
 * against the per-row rules in `feedback-criteria.ts`.
 *
 * Usage:
 *   npm run test:feedback
 *
 * Notes:
 *   - Messages are grouped by Question Date into conversation threads. Each
 *     thread is replayed on a fresh fake phone (`9999<rand>`) so prior turns
 *     build state the same way they did in the real conversation.
 *   - WhatsappService.sendMessage is replaced with a capture function on the
 *     live instance, so the bot never actually sends WhatsApp messages — but
 *     Airtable / Claude / iCal are hit for real. Expect ~$ of API spend per run.
 */
import { NestFactory } from '@nestjs/core';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { AppModule } from '../src/app.module';
import { MessageHandlerService } from '../src/orchestrator/message-handler.service';
import { WhatsappService } from '../src/whatsapp/whatsapp.service';
import { FEEDBACK_CRITERIA, Criterion } from './feedback-criteria';

type Row = {
  questionDate: string;
  questionTime: string;
  question: string;
  reply: string;
  recommendedReply: string;
  enquiryType: string;
};

const COLOR = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m',
};

function parseCsv(raw: string): Row[] {
  // Minimal RFC-4180 parser: handles quoted fields, embedded newlines, "" escapes.
  const rows: string[][] = [];
  let cur: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (inQuotes) {
      if (ch === '"') {
        if (raw[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      cur.push(field);
      field = '';
    } else if (ch === '\n') {
      cur.push(field);
      rows.push(cur);
      cur = [];
      field = '';
    } else if (ch === '\r') {
      // skip
    } else {
      field += ch;
    }
  }
  if (field.length > 0 || cur.length > 0) {
    cur.push(field);
    rows.push(cur);
  }

  const [, ...body] = rows;
  return body
    .filter((r) => r.length >= 3 && r[2].trim().length > 0)
    .map((r) => ({
      questionDate: r[0] ?? '',
      questionTime: r[1] ?? '',
      question: (r[2] ?? '').trim(),
      reply: r[5] ?? '',
      recommendedReply: r[6] ?? '',
      enquiryType: r[7] ?? '',
    }));
}

function findCriterion(question: string): Criterion | null {
  return (
    FEEDBACK_CRITERIA.find(
      (c) => normalise(c.customerMessage) === normalise(question),
    ) ?? null
  );
}

function normalise(s: string): string {
  return s
    .toLowerCase()
    .replace(/[’`]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

type Verdict = {
  status: 'pass' | 'fail' | 'no_criteria' | 'no_reply';
  failures: string[];
};

function grade(reply: string, c: Criterion | null): Verdict {
  if (!c) {
    return { status: 'no_criteria', failures: [] };
  }
  if (!reply || reply.trim().length === 0) {
    return { status: 'no_reply', failures: ['no outbound reply captured'] };
  }
  const failures: string[] = [];
  for (const re of c.mustInclude ?? []) {
    if (!re.test(reply)) failures.push(`missing: ${re}`);
  }
  for (const re of c.mustNotInclude ?? []) {
    if (re.test(reply)) failures.push(`forbidden present: ${re}`);
  }
  return { status: failures.length ? 'fail' : 'pass', failures };
}

function truncate(s: string, max = 200): string {
  const flat = s.replace(/\n+/g, ' ');
  return flat.length > max ? `${flat.slice(0, max)}…` : flat;
}

function fakePhone(seed: string): string {
  // deterministic per-thread so multiple turns share state
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return `9999${String(h).padStart(8, '0').slice(-8)}`;
}

async function main(): Promise<void> {
  const csvPath = join(
    __dirname,
    '..',
    '.claude',
    'feedbacks',
    'feedback-1.csv',
  );
  const rows = parseCsv(readFileSync(csvPath, 'utf8'));
  console.log(
    `${COLOR.bold}Loaded ${rows.length} customer messages from ${csvPath}${COLOR.reset}`,
  );

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['warn', 'error'],
  });

  // Capture outbound WhatsApp messages instead of sending them.
  const whatsapp = app.get(WhatsappService);
  const captured = new Map<string, string[]>();
  // eslint-disable-next-line @typescript-eslint/require-await
  (whatsapp as unknown as { sendMessage: (to: string, text: string) => Promise<void> }).sendMessage =
    async (to: string, text: string): Promise<void> => {
      const list = captured.get(to) ?? [];
      list.push(text);
      captured.set(to, list);
    };

  const handler = app.get(MessageHandlerService);

  // Group by date → one conversation thread per day.
  const threads = new Map<string, Row[]>();
  for (const r of rows) {
    const list = threads.get(r.questionDate) ?? [];
    list.push(r);
    threads.set(r.questionDate, list);
  }

  let passCount = 0;
  let failCount = 0;
  let noCritCount = 0;
  let noReplyCount = 0;

  const results: {
    threadKey: string;
    row: Row;
    reply: string;
    verdict: Verdict;
  }[] = [];

  for (const [threadKey, threadRows] of threads) {
    const phone = fakePhone(`${threadKey}-${Date.now()}-${Math.random()}`);
    console.log(
      `\n${COLOR.cyan}── Thread ${threadKey} → phone ${phone} (${threadRows.length} turns)${COLOR.reset}`,
    );

    for (const row of threadRows) {
      const beforeCount = (captured.get(phone) ?? []).length;
      try {
        await handler.handle({ from: phone, text: row.question });
      } catch (err) {
        console.error(
          `  ${COLOR.red}✗ handler threw on "${truncate(row.question, 60)}":${COLOR.reset}`,
          (err as Error).message,
        );
      }
      const allReplies = captured.get(phone) ?? [];
      const newReplies = allReplies.slice(beforeCount);
      const reply = newReplies.join('\n---\n');
      const criterion = findCriterion(row.question);
      const verdict = grade(reply, criterion);

      results.push({ threadKey, row, reply, verdict });
      if (verdict.status === 'pass') passCount++;
      else if (verdict.status === 'fail') failCount++;
      else if (verdict.status === 'no_criteria') noCritCount++;
      else noReplyCount++;

      const tag =
        verdict.status === 'pass'
          ? `${COLOR.green}PASS${COLOR.reset}`
          : verdict.status === 'fail'
            ? `${COLOR.red}FAIL${COLOR.reset}`
            : verdict.status === 'no_reply'
              ? `${COLOR.yellow}NO REPLY${COLOR.reset}`
              : `${COLOR.dim}NO CRITERIA${COLOR.reset}`;
      console.log(`  ${tag}  Q: ${truncate(row.question, 70)}`);
      console.log(`        A: ${COLOR.dim}${truncate(reply, 180)}${COLOR.reset}`);
      if (verdict.failures.length) {
        for (const f of verdict.failures) {
          console.log(`        ${COLOR.red}- ${f}${COLOR.reset}`);
        }
      }
    }
  }

  console.log(
    `\n${COLOR.bold}Summary${COLOR.reset}: ${COLOR.green}${passCount} pass${COLOR.reset}, ${COLOR.red}${failCount} fail${COLOR.reset}, ${COLOR.yellow}${noReplyCount} no-reply${COLOR.reset}, ${COLOR.dim}${noCritCount} no-criteria${COLOR.reset} (total ${results.length})`,
  );

  await app.close();

  if (failCount > 0 || noReplyCount > 0) {
    process.exit(1);
  }
}

main().catch((err: Error) => {
  console.error('Feedback test failed:', err.message);
  process.exit(1);
});
