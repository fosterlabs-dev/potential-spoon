import { mkdirSync, writeFileSync } from 'fs';
import { dirname, join, resolve } from 'path';

export type TranscriptEvent =
  | { kind: 'in'; from: string; text: string }
  | { kind: 'render'; key: string; vars: Record<string, unknown> }
  | { kind: 'out'; to: string; text: string };

export class TranscriptRecorder {
  public events: TranscriptEvent[] = [];

  push(event: TranscriptEvent): void {
    this.events.push(event);
  }

  reset(): void {
    this.events = [];
  }
}

const OUTPUT_ROOT = resolve(__dirname, '..', 'output');

function sanitize(name: string): string {
  return name
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 180);
}

function specBasename(testPath: string | undefined): string {
  if (!testPath) return 'unknown-spec';
  const base = testPath.split('/').pop() ?? 'unknown-spec';
  return base.replace(/\.spec\.ts$/, '');
}

export function writeTranscript(
  recorder: TranscriptRecorder,
  testName: string | undefined,
  testPath: string | undefined,
): string | null {
  if (!testName) return null;
  const dir = join(OUTPUT_ROOT, specBasename(testPath));
  const file = join(dir, `${sanitize(testName)}.md`);
  mkdirSync(dirname(file), { recursive: true });

  const lines: string[] = [];
  lines.push(`# ${testName}`);
  lines.push('');
  if (testPath) {
    lines.push(`**Spec:** \`${testPath}\``);
    lines.push('');
  }
  lines.push(`**Events:** ${recorder.events.length}`);
  lines.push('');
  lines.push('---');
  lines.push('');

  if (recorder.events.length === 0) {
    lines.push('_(no events recorded)_');
  }

  for (const e of recorder.events) {
    if (e.kind === 'in') {
      lines.push(`### → IN  \`${e.from}\``);
      lines.push('');
      lines.push(blockquote(e.text));
      lines.push('');
    } else if (e.kind === 'render') {
      lines.push(`### · RENDER  \`${e.key}\``);
      const varsKeys = Object.keys(e.vars ?? {});
      if (varsKeys.length > 0) {
        lines.push('');
        lines.push('```json');
        lines.push(safeJson(e.vars));
        lines.push('```');
      }
      lines.push('');
    } else {
      lines.push(`### ← OUT  \`${e.to}\``);
      lines.push('');
      lines.push(blockquote(e.text));
      lines.push('');
    }
  }

  writeFileSync(file, lines.join('\n'), 'utf8');
  return file;
}

function blockquote(text: string): string {
  return text
    .split('\n')
    .map((l) => `> ${l}`)
    .join('\n');
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}
