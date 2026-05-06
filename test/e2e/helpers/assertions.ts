import { ConversationStatus } from '../../../src/conversation/conversation.service';
import { HoldStatus } from '../../../src/holds/holds.service';
import { CUSTOMER, Harness, OWNER } from './test-app';

export function expectTemplateUsed(h: Harness, key: string): void {
  const calls = h.renderCalls();
  if (!calls.includes(key)) {
    throw new Error(
      `expected template "${key}" to be rendered. Got: [${calls.join(', ')}]`,
    );
  }
}

export function expectComposed(h: Harness, scenario: string): void {
  const composeCalls = h.composeCalls();
  if (!composeCalls.some((c) => c.scenarioHint === scenario)) {
    throw new Error(
      `expected composer to be called with scenario "${scenario}". Got: [${composeCalls.map((c) => c.scenarioHint).join(', ')}]`,
    );
  }
}

export function expectTemplateNotUsed(h: Harness, key: string): void {
  const calls = h.renderCalls();
  if (calls.includes(key)) {
    throw new Error(
      `expected template "${key}" NOT to be rendered. Got: [${calls.join(', ')}]`,
    );
  }
}

export function expectTemplateAppended(h: Harness, key: string): void {
  expectTemplateUsed(h, key);
}

export function expectJimNotified(h: Harness): void {
  const sentToOwner = h.provider.sent.filter((m) => m.to === OWNER);
  if (sentToOwner.length === 0) {
    throw new Error(
      `expected owner to be notified. Sent messages: ${JSON.stringify(h.provider.sent)}`,
    );
  }
}

export function expectJimEmailed(h: Harness, subjectContains?: string): void {
  if (h.email.sent.length === 0) {
    throw new Error('expected owner to be emailed, no emails recorded');
  }
  if (
    subjectContains &&
    !h.email.sent.some((e) => e.subject.includes(subjectContains))
  ) {
    throw new Error(
      `expected an email with subject containing "${subjectContains}". Got: ${h.email.sent
        .map((e) => e.subject)
        .join(' | ')}`,
    );
  }
}

export function expectNoMessageSent(
  h: Harness,
  to: string = CUSTOMER,
): void {
  const sent = h.provider.sent.filter((m) => m.to === to);
  if (sent.length > 0) {
    throw new Error(
      `expected no message to ${to}, got: ${sent.map((s) => s.text).join(' | ')}`,
    );
  }
}

export function expectMessageSentTo(
  h: Harness,
  to: string,
  containing?: string,
): void {
  const sent = h.provider.sent.filter((m) => m.to === to);
  if (sent.length === 0) throw new Error(`no message sent to ${to}`);
  if (containing && !sent.some((m) => m.text.includes(containing))) {
    throw new Error(
      `no message to ${to} contains "${containing}". Got: ${sent.map((s) => s.text).join(' | ')}`,
    );
  }
}

export async function expectConversationStatus(
  h: Harness,
  status: ConversationStatus,
  phone: string = CUSTOMER,
): Promise<void> {
  const rows = h.airtable.rows('Conversations');
  const row = rows.find((r) => r.fields.phone === phone);
  if (!row) {
    if (status === 'bot') return; // no row = default 'bot'
    throw new Error(`no Conversations row for ${phone}`);
  }
  const effective = row.fields.pause_status ?? 'bot';
  if (effective !== status) {
    throw new Error(
      `expected conversation status "${status}", got "${String(effective)}"`,
    );
  }
}

export async function expectLifecycleStatus(
  h: Harness,
  status: 'New' | 'Responded' | 'Follow-up' | 'Booked' | 'Lost',
  phone: string = CUSTOMER,
): Promise<void> {
  const rows = h.airtable.rows('Conversations');
  const row = rows.find((r) => r.fields.phone === phone);
  if (!row) throw new Error(`no Conversations row for ${phone}`);
  const effective = row.fields.status ?? 'New';
  if (effective !== status) {
    throw new Error(
      `expected lifecycle status "${status}", got "${String(effective)}"`,
    );
  }
}

export async function expectHoldStatus(
  h: Harness,
  status: HoldStatus,
  phone: string = CUSTOMER,
): Promise<void> {
  const rows = h.airtable.rows('Holds');
  const row = rows.find((r) => r.fields.phone === phone);
  if (!row) throw new Error(`no Holds row for ${phone}`);
  if (row.fields.status !== status) {
    throw new Error(
      `expected hold status "${status}", got "${String(row.fields.status)}"`,
    );
  }
}

export function expectRenderVar(
  h: Harness,
  key: string,
  varName: string,
  expected: string | RegExp,
): void {
  const calls = h.renderArgs().filter((c) => c.key === key);
  if (calls.length === 0) throw new Error(`template "${key}" was never rendered`);
  const matched = calls.some((c) => {
    const v = String(c.vars[varName] ?? '');
    return typeof expected === 'string' ? v.includes(expected) : expected.test(v);
  });
  if (!matched) {
    throw new Error(
      `no render of "${key}" had ${varName} matching ${String(expected)}. Got: ${JSON.stringify(calls.map((c) => c.vars))}`,
    );
  }
}

export function expectQuoteIncludes(h: Harness, fragment: string): void {
  const sent = h.provider.sent.map((m) => m.text).join('\n');
  if (!sent.includes(fragment)) {
    throw new Error(
      `expected outbound text to include "${fragment}". Got:\n${sent}`,
    );
  }
}

export function lastOutboundText(h: Harness, to: string = CUSTOMER): string {
  const sent = h.provider.sent.filter((m) => m.to === to);
  if (sent.length === 0) throw new Error(`no outbound message to ${to}`);
  return sent[sent.length - 1].text;
}
