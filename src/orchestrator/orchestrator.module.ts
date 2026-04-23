import { Global, Module } from '@nestjs/common';
import { BookingRulesModule } from '../booking-rules/booking-rules.module';
import { ResponseModule } from '../response/response.module';
import { MessageHandlerService } from './message-handler.service';

@Global()
@Module({
  imports: [BookingRulesModule, ResponseModule],
  providers: [MessageHandlerService],
  exports: [MessageHandlerService],
})
export class OrchestratorModule {}
