import { Global, Module } from '@nestjs/common';
import { BookingRulesModule } from '../booking-rules/booking-rules.module';
import { MessageHandlerService } from './message-handler.service';

@Global()
@Module({
  imports: [BookingRulesModule],
  providers: [MessageHandlerService],
  exports: [MessageHandlerService],
})
export class OrchestratorModule {}
