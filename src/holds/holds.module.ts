import { Module } from '@nestjs/common';
import { MessageLogModule } from '../messagelog/messagelog.module';
import { TemplatesModule } from '../templates/templates.module';
import { WhatsappModule } from '../whatsapp/whatsapp.module';
import { HoldsCronService } from './holds-cron.service';
import { HoldsService } from './holds.service';

@Module({
  imports: [WhatsappModule, MessageLogModule, TemplatesModule],
  providers: [HoldsService, HoldsCronService],
  exports: [HoldsService],
})
export class HoldsModule {}
