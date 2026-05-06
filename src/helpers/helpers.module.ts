import { Global, Module } from '@nestjs/common';
import { AvailabilityModule } from '../availability/availability.module';
import { HoldsModule } from '../holds/holds.module';
import { PricingModule } from '../pricing/pricing.module';
import { HelpersService } from './helpers.service';

@Global()
@Module({
  imports: [AvailabilityModule, PricingModule, HoldsModule],
  providers: [HelpersService],
  exports: [HelpersService],
})
export class HelpersModule {}
