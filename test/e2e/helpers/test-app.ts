import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { AirtableService } from '../../../src/airtable/airtable.service';
import { AirtableModule } from '../../../src/airtable/airtable.module';
import { AvailabilityService } from '../../../src/availability/availability.service';
import { AvailabilityModule } from '../../../src/availability/availability.module';
import { BookingRulesModule } from '../../../src/booking-rules/booking-rules.module';
import { ConversationModule } from '../../../src/conversation/conversation.module';
import { FollowUpsCronService } from '../../../src/follow-ups/follow-ups-cron.service';
import { FollowUpsModule } from '../../../src/follow-ups/follow-ups.module';
import { FollowUpsService } from '../../../src/follow-ups/follow-ups.service';
import { HoldsCronService } from '../../../src/holds/holds-cron.service';
import { HoldsModule } from '../../../src/holds/holds.module';
import { HoldsService } from '../../../src/holds/holds.service';
import { KnowledgeBaseModule } from '../../../src/knowledge-base/knowledge-base.module';
import { LoggerModule } from '../../../src/logger/logger.module';
import { MessageLogModule } from '../../../src/messagelog/messagelog.module';
import { OrchestratorModule } from '../../../src/orchestrator/orchestrator.module';
import { MessageHandlerService } from '../../../src/orchestrator/message-handler.service';
import { ParserModule } from '../../../src/parser/parser.module';
import { ParserService } from '../../../src/parser/parser.service';
import { PricingModule } from '../../../src/pricing/pricing.module';
import { ResponseModule } from '../../../src/response/response.module';
import { ResponseService } from '../../../src/response/response.service';
import { TemplatesModule } from '../../../src/templates/templates.module';
import { WHATSAPP_PROVIDER, WhatsappService } from '../../../src/whatsapp/whatsapp.service';
import { WhatsappModule } from '../../../src/whatsapp/whatsapp.module';
import { seedAll } from '../fixtures/seed';
import { FakeAirtable, FakeAvailability, FakeParser, FakeWhatsAppProvider } from './mocks';

export const OWNER = '447000000000';
export const CUSTOMER = '447111111111';

export type Harness = {
  handler: MessageHandlerService;
  whatsapp: WhatsappService;
  holdsCron: HoldsCronService;
  followUpsCron: FollowUpsCronService;
  followUps: FollowUpsService;
  response: ResponseService;
  airtable: FakeAirtable;
  parser: FakeParser;
  availability: FakeAvailability;
  provider: FakeWhatsAppProvider;
  // Spies on render so assertions can introspect template usage
  renderCalls: () => string[];
  renderArgs: () => Array<{ key: string; vars: Record<string, unknown> }>;
  shutdown: () => Promise<void>;
};

export async function buildHarness(): Promise<Harness> {
  process.env.OWNER_PHONE = OWNER;
  process.env.YEAR_2026_FULLY_BOOKED = 'true';
  process.env.RESPONSE_MODE = 'template';
  process.env.AIRTABLE_API_KEY = 'test';
  process.env.AIRTABLE_BASE_ID = 'test';
  process.env.ANTHROPIC_API_KEY = 'test';
  process.env.ICAL_URL = 'http://example.invalid/ical';
  process.env.LOG_LEVEL = 'error';
  process.env.WHATSAPP_PROVIDER = 'cloud_api';
  process.env.WHATSAPP_PHONE_NUMBER_ID = 'test';
  process.env.WHATSAPP_ACCESS_TOKEN = 'test';
  process.env.WHATSAPP_VERIFY_TOKEN = 'test';
  process.env.WHATSAPP_APP_SECRET = 'test';

  const airtable = new FakeAirtable();
  const parser = new FakeParser();
  const availability = new FakeAvailability();
  const provider = new FakeWhatsAppProvider();

  seedAll(airtable);

  const moduleRef = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({ isGlobal: true }),
      LoggerModule,
      AirtableModule,
      AvailabilityModule,
      BookingRulesModule,
      PricingModule,
      TemplatesModule,
      ResponseModule,
      KnowledgeBaseModule,
      ParserModule,
      ConversationModule,
      MessageLogModule,
      WhatsappModule,
      HoldsModule,
      FollowUpsModule,
      OrchestratorModule,
    ],
  })
    .overrideProvider(AirtableService)
    .useValue(airtable)
    .overrideProvider(ParserService)
    .useValue(parser)
    .overrideProvider(AvailabilityService)
    .useValue(availability)
    .overrideProvider(WHATSAPP_PROVIDER)
    .useValue(provider)
    .compile();

  const app = moduleRef.createNestApplication();
  await app.init();

  const handler = app.get(MessageHandlerService);
  const whatsapp = app.get(WhatsappService);
  const holdsCron = app.get(HoldsCronService);
  const followUpsCron = app.get(FollowUpsCronService);
  const followUps = app.get(FollowUpsService);
  const response = app.get(ResponseService);

  const renderSpy = jest.spyOn(response, 'render');

  return {
    handler,
    whatsapp,
    holdsCron,
    followUpsCron,
    followUps,
    response,
    airtable,
    parser,
    availability,
    provider,
    renderCalls: () => renderSpy.mock.calls.map((c) => c[0] as string),
    renderArgs: () =>
      renderSpy.mock.calls.map((c) => ({
        key: c[0] as string,
        vars: (c[1] ?? {}) as Record<string, unknown>,
      })),
    shutdown: async () => {
      await app.close();
    },
  };
}
