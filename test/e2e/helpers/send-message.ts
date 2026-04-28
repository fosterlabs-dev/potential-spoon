import { ParseResult } from '../../../src/parser/parser.service';
import { CUSTOMER, Harness } from './test-app';

export type SendOptions = {
  from?: string;
  parse?: Partial<ParseResult>;
};

/**
 * Stage a parser response then push the message into the handler.
 * Most tests stage the parser inline — this is the convenience wrapper
 * for the common case.
 */
export async function sendIncoming(
  h: Harness,
  text: string,
  options: SendOptions = {},
): Promise<void> {
  if (options.parse) h.parser.setResponse(text, options.parse);
  await h.handler.handle({ from: options.from ?? CUSTOMER, text });
}

export function daysFromNow(n: number): Date {
  return new Date(Date.now() + n * 24 * 60 * 60 * 1000);
}
