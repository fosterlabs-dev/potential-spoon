import { Global, Module } from '@nestjs/common';
import { MessageLogService } from './messagelog.service';

@Global()
@Module({
  providers: [MessageLogService],
  exports: [MessageLogService],
})
export class MessageLogModule {}
