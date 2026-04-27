import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import * as cron from 'node-cron';
import { HoldsService, Hold } from './holds.service';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import { MessageLogService } from '../messagelog/messagelog.service';
import { ResponseService } from '../response/response.service';
import { LoggerService } from '../logger/logger.service';

@Injectable()
export class HoldsCronService implements OnModuleInit, OnModuleDestroy {
  private task: cron.ScheduledTask | null = null;

  constructor(
    private readonly holds: HoldsService,
    private readonly whatsapp: WhatsappService,
    private readonly messageLog: MessageLogService,
    private readonly response: ResponseService,
    private readonly logger: LoggerService,
  ) {}

  onModuleInit(): void {
    // daily at 08:00 UTC
    this.task = cron.schedule('0 8 * * *', () => {
      this.runDailyCheck().catch((err: Error) => {
        this.logger.error('holds', 'cron runDailyCheck failed', { error: err.message });
      });
    });
  }

  onModuleDestroy(): void {
    this.task?.stop();
  }

  async runDailyCheck(): Promise<void> {
    const active = await this.holds.listActive();
    this.logger.info('holds', 'daily check', { count: active.length });

    for (const hold of active) {
      try {
        await this.processHold(hold);
      } catch (err) {
        this.logger.error('holds', 'failed to process hold', {
          id: hold.id,
          phone: hold.fields.phone,
          error: (err as Error).message,
        });
      }
    }
  }

  private async processHold(hold: Hold): Promise<void> {
    const now = new Date();
    const expiresAt = new Date(hold.fields.hold_expires_at);
    const { phone, check_in, check_out } = hold.fields;

    if (expiresAt <= now) {
      const text = await this.response.render('hold_expired', {
        phone,
        check_in,
        check_out,
      });
      await this.whatsapp.sendMessage(phone, text);
      await this.messageLog.log(phone, 'out', text);
      await this.holds.setStatus(hold.id, 'expired');
      this.logger.info('holds', 'hold expired', { id: hold.id, phone });
      return;
    }

    const msUntilExpiry = expiresAt.getTime() - now.getTime();
    const daysUntilExpiry = msUntilExpiry / (24 * 60 * 60 * 1000);

    if (daysUntilExpiry <= 1 && !hold.fields.reminder_sent) {
      const text = await this.response.render('hold_reminder', {
        phone,
        check_in,
        check_out,
      });
      await this.whatsapp.sendMessage(phone, text);
      await this.messageLog.log(phone, 'out', text);
      await this.holds.setReminderSent(hold.id);
      this.logger.info('holds', 'hold reminder sent', { id: hold.id, phone });
    }
  }
}
