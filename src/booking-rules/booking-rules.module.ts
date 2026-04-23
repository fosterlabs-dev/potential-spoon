import { Module } from '@nestjs/common';
import { BookingRulesService } from './booking-rules.service';

@Module({
  providers: [BookingRulesService],
  exports: [BookingRulesService],
})
export class BookingRulesModule {}
