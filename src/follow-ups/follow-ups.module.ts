import { Module } from '@nestjs/common';
import { ConversationModule } from '../conversation/conversation.module';
import { MessageLogModule } from '../messagelog/messagelog.module';
import { TemplatesModule } from '../templates/templates.module';
import { WhatsappModule } from '../whatsapp/whatsapp.module';
import { FollowUpsCronService } from './follow-ups-cron.service';
import { FollowUpsService } from './follow-ups.service';

@Module({
  imports: [WhatsappModule, MessageLogModule, TemplatesModule, ConversationModule],
  providers: [FollowUpsService, FollowUpsCronService],
  exports: [FollowUpsService],
})
export class FollowUpsModule {}
