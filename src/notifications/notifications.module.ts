import { Global, Module } from '@nestjs/common';
import { WhatsappModule } from '../whatsapp/whatsapp.module';
import { EmailService } from './email.service';
import { NotificationsService } from './notifications.service';

@Global()
@Module({
  imports: [WhatsappModule],
  providers: [EmailService, NotificationsService],
  exports: [NotificationsService, EmailService],
})
export class NotificationsModule {}
