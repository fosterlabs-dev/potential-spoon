# CLAUDE.md

Context and conventions for building the Rental WhatsApp Automation project.

## Project overview

WhatsApp automation that handles rental inquiries for a single property owner. Customer sends a WhatsApp message → bot parses intent/dates with Claude → checks iCal availability → looks up pricing in Airtable → replies using pre-approved templates.

Single property, single client for now. No multi-tenant concerns.

## Stack

- **Runtime:** Node.js + Nest.js (monorepo, single app for now)
- **Language:** TypeScript (strict mode)
- **Hosting:** Railway
- **Data:**
  - Airtable — pricing config, reply templates, conversation state (pause flags), logs
  - iCal feed — availability (fetched fresh per inquiry)
- **External APIs:**
  - WhatsApp Business API (direct, not Twilio)
  - Anthropic Claude API (Haiku 4.5 for parsing)
- **Testing:** Jest + TDD

## Architecture principles

- **Templates, not LLM-generated replies.** Claude parses incoming messages only. All outbound messages come from Airtable templates with variable substitution. Never let Claude freestyle a customer-facing reply.
- **Backend orchestrates, Airtable stores.** No chained Airtable automations. All logic lives in Nest.js.
- **Fail safe toward the human.** When in doubt, send holding reply + notify client + pause bot. Never send a bad reply.
- **Stateless per request where possible.** Conversation state in Airtable, not in memory. Railway restarts shouldn't break anything.

## Module structure

Each concern is its own Nest.js module with a clear boundary. Never reach across modules — use services.

```
src/
├── whatsapp/       # WhatsApp Business API client, webhook handler, message sending
├── parser/         # Claude integration, intent classification, date extraction
├── availability/   # iCal fetching + parsing, date range checks
├── pricing/        # Airtable pricing rules, quote calculation
├── templates/      # Airtable template fetching, variable substitution, variant rotation
├── conversation/   # Pause state, handoff logic, command parsing (/release, /pause, etc.)
├── airtable/       # Shared Airtable client (all Airtable access goes through here)
├── logger/         # Categorized colored logging
└── app.module.ts
```

## Conventions

### Airtable access
All Airtable operations go through the `AirtableService`. Never import `airtable` SDK directly in feature modules. This makes mocking trivial in tests and centralizes rate limiting.

### WhatsApp sending
All outbound messages go through `WhatsappService.sendMessage()`. This service logs every send, checks conversation pause state before sending, and handles retries. No module sends WhatsApp messages directly.

### Logging
Use the custom `LoggerService`, not `console.log` or Nest's default logger. Every log call specifies a module tag and level:

```ts
logger.info('whatsapp', 'Received message from +62...');
logger.warn('parser', 'Claude returned unexpected format', { raw });
logger.error('pricing', 'Missing pricing row for date', { date });
```

Colors per module (set up once in LoggerService):
- `whatsapp` → cyan
- `parser` → magenta
- `availability` → blue
- `pricing` → yellow
- `templates` → green
- `conversation` → white
- `airtable` → gray
- `error` → red (overrides module color)

Levels: `debug | info | warn | error`. Debug off in production.

### Error handling
- Never let an unhandled error crash a webhook response. Webhook always returns 200 to WhatsApp (they retry aggressively on non-200).
- Errors inside message processing → log + send holding reply to customer + notify client.
- No silent failures. Every catch block logs.

## Development approach

### TDD workflow
For every new feature:

1. Write the failing test first (unit test in `*.spec.ts` next to the file)
2. Write minimal code to make it pass
3. Refactor
4. Move on

Don't write implementation before tests.

### Incremental build order
Build in this order — each step should be fully working and tested before moving on. Don't skip ahead.

1. **Logger service** — needed everywhere else
2. **Airtable service** — base client, read-only first
3. **iCal parser** — fetch feed, parse events, "is date X available?" function
4. **Pricing calculator** — given dates + Airtable rules, return quote
5. **Template service** — fetch template by key, substitute variables, variant rotation
6. **Claude parser** — extract structured data from WhatsApp messages (dates, intent, guest count)
7. **WhatsApp webhook** — receive message, validate signature, acknowledge
8. **WhatsApp sender** — send templated message back
9. **Conversation state** — pause/resume, command handling (/release, /pause, /resume)
10. **Orchestration** — wire it all together in a MessageHandler service
11. **End-to-end tests** — simulate incoming message, verify outgoing reply

Each step = at least one unit test passing. Commit after each.

### Testing rules
- Unit tests mock all external services (Airtable, WhatsApp, Claude, iCal HTTP fetch)
- Use `*.spec.ts` colocated with source files
- One test file per service/module
- Test the edge cases explicitly: empty iCal, missing pricing row, Claude returns malformed JSON, WhatsApp API 429, etc.
- No integration tests against real Airtable/WhatsApp in CI. Those are for manual verification locally.

## Airtable schema (reference)

Tables to set up:

- **Pricing** — base rates, seasonal rules, minimum nights, discounts
- **Templates** — key (e.g. `availability_confirmed`), variant number, text with `{placeholders}`
- **Conversations** — phone number, status (`bot | human | paused`), pause_until timestamp, last_message_at
- **MessageLog** — phone, direction (in/out), text, intent, timestamp (audit trail)

Schema details TBD when Airtable is set up.

## Environment variables

```
# WhatsApp Business API
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_ACCESS_TOKEN=
WHATSAPP_VERIFY_TOKEN=
WHATSAPP_APP_SECRET=

# Airtable
AIRTABLE_API_KEY=
AIRTABLE_BASE_ID=

# Anthropic
ANTHROPIC_API_KEY=
CLAUDE_MODEL=claude-haiku-4-5-20251001

# iCal
ICAL_URL=

# App
PORT=3000
NODE_ENV=development
LOG_LEVEL=debug
```

## What NOT to do

- **Don't use Claude to write customer-facing replies.** Parsing only.
- **Don't chain Airtable automations.** Orchestration stays in the backend.
- **Don't store state in memory.** Railway restarts will wipe it. Use Airtable.
- **Don't skip tests.** TDD is not optional for this project.
- **Don't use console.log.** Always go through LoggerService.
- **Don't bypass the AirtableService or WhatsappService.** All access goes through them.
- **Don't overengineer.** Bare minimum first. Expand when there's a real reason.

## Out of scope (for v1)

- Multiple properties
- Taking bookings or payments
- Languages other than English
- Post-booking support (complaints, cancellations)
- Dashboard/admin UI
- Compound responses (multi-intent stitched replies)