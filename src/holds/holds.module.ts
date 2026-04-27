import { Module } from '@nestjs/common';
import { MessageLogModule } from '../messagelog/messagelog.module';
import { ResponseModule } from '../response/response.module';
import { WhatsappModule } from '../whatsapp/whatsapp.module';
import { HoldsCronService } from './holds-cron.service';
import { HoldsService } from './holds.service';

@Module({
  imports: [WhatsappModule, MessageLogModule, ResponseModule],
  providers: [HoldsService, HoldsCronService],
  exports: [HoldsService],
})
export class HoldsModule {}
