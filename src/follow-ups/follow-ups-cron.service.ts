import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import * as cron from 'node-cron';
import { ConversationService } from '../conversation/conversation.service';
import { LoggerService } from '../logger/logger.service';
import { MessageLogService } from '../messagelog/messagelog.service';
import { ResponseService } from '../response/response.service';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import { FollowUp, FollowUpsService } from './follow-ups.service';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

@Injectable()
export class FollowUpsCronService implements OnModuleInit, OnModuleDestroy {
  private task: cron.ScheduledTask | null = null;

  constructor(
    private readonly followUps: FollowUpsService,
    private readonly whatsapp: WhatsappService,
    private readonly messageLog: MessageLogService,
    private readonly response: ResponseService,
    private readonly conversation: ConversationService,
    private readonly logger: LoggerService,
  ) {}

  onModuleInit(): void {
    // daily at 09:00 UTC — one hour after the holds cron
    this.task = cron.schedule('0 9 * * *', () => {
      this.runDailyCheck().catch((err: Error) => {
        this.logger.error('follow-ups', 'cron runDailyCheck failed', { error: err.message });
      });
    });
  }

  onModuleDestroy(): void {
    this.task?.stop();
  }

  async runDailyCheck(): Promise<void> {
    const due = await this.followUps.listDue();
    this.logger.info('follow-ups', 'daily check', { count: due.length });

    for (const row of due) {
      try {
        await this.processRow(row);
      } catch (err) {
        this.logger.error('follow-ups', 'failed to process row', {
          id: row.id,
          phone: row.fields.phone,
          error: (err as Error).message,
        });
      }
    }
  }

  private async processRow(row: FollowUp): Promise<void> {
    const now = Date.now();
    const quoteSentAt = new Date(row.fields.quote_sent_at).getTime();
    const elapsed = now - quoteSentAt;
    const { phone, status } = row.fields;

    if (status === 'pending' && elapsed >= 24 * HOUR_MS && elapsed < 7 * DAY_MS) {
      await this.send(phone, 'followup_24h');
      await this.followUps.markSent24h(row.id);
      await this.mirrorCrm(phone, '24h');
      return;
    }

    if (
      (status === 'sent_24h' || status === 'pending') &&
      elapsed >= 7 * DAY_MS
    ) {
      await this.send(phone, 'followup_7d');
      await this.followUps.markCompleted(row.id);
      await this.mirrorCrm(phone, '7d');
    }
  }

  private async mirrorCrm(phone: string, stage: '24h' | '7d'): Promise<void> {
    try {
      await this.conversation.markFollowUpSent(phone, stage);
      await this.conversation.setLifecycleStatus(
        phone,
        stage === '7d' ? 'Lost' : 'Follow-up',
      );
    } catch (err) {
      this.logger.warn('follow-ups', 'CRM mirror failed', {
        phone,
        stage,
        error: (err as Error).message,
      });
    }
  }

  private async send(phone: string, key: string): Promise<void> {
    const text = await this.response.render(key, { phone });
    await this.whatsapp.sendMessage(phone, text);
    await this.messageLog.log(phone, 'out', text);
    this.logger.info('follow-ups', 'sent', { phone, key });
  }
}
