import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AirtableModule } from './airtable/airtable.module';
import { AvailabilityModule } from './availability/availability.module';
import { LoggerModule } from './logger/logger.module';
import { PricingModule } from './pricing/pricing.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    LoggerModule,
    AirtableModule,
    AvailabilityModule,
    PricingModule,
  ],
})
export class AppModule {}
