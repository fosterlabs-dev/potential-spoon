import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AirtableModule } from './airtable/airtable.module';
import { AvailabilityModule } from './availability/availability.module';
import { LoggerModule } from './logger/logger.module';
import { ParserModule } from './parser/parser.module';
import { PricingModule } from './pricing/pricing.module';
import { TemplatesModule } from './templates/templates.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    LoggerModule,
    AirtableModule,
    AvailabilityModule,
    PricingModule,
    TemplatesModule,
    ParserModule,
  ],
})
export class AppModule {}
