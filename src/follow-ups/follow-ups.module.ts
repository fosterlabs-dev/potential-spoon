import { Module } from '@nestjs/common';
import { ConversationModule } from '../conversation/conversation.module';
import { MessageLogModule } from '../messagelog/messagelog.module';
import { ResponseModule } from '../response/response.module';
import { WhatsappModule } from '../whatsapp/whatsapp.module';
import { FollowUpsCronService } from './follow-ups-cron.service';
import { FollowUpsService } from './follow-ups.service';

@Module({
  imports: [WhatsappModule, MessageLogModule, ResponseModule, ConversationModule],
  providers: [FollowUpsService, FollowUpsCronService],
  exports: [FollowUpsService],
})
export class FollowUpsModule {}
