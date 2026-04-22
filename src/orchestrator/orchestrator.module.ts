import { Global, Module } from '@nestjs/common';
import { MessageHandlerService } from './message-handler.service';

@Global()
@Module({
  providers: [MessageHandlerService],
  exports: [MessageHandlerService],
})
export class OrchestratorModule {}
