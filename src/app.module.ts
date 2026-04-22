import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AirtableModule } from './airtable/airtable.module';
import { AvailabilityModule } from './availability/availability.module';
import { ConversationModule } from './conversation/conversation.module';
import { LoggerModule } from './logger/logger.module';
import { OrchestratorModule } from './orchestrator/orchestrator.module';
import { ParserModule } from './parser/parser.module';
import { PricingModule } from './pricing/pricing.module';
import { TemplatesModule } from './templates/templates.module';
import { WhatsappModule } from './whatsapp/whatsapp.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    LoggerModule,
    AirtableModule,
    AvailabilityModule,
    PricingModule,
    TemplatesModule,
    ParserModule,
    ConversationModule,
    WhatsappModule,
    OrchestratorModule,
  ],
})
export class AppModule {}
