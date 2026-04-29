import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { LoggerService } from '../logger/logger.service';

export type EmailMessage = {
  to: string;
  subject: string;
  body: string;
};

@Injectable()
export class EmailService {
  private readonly transporter: nodemailer.Transporter | null;
  private readonly from: string | undefined;

  constructor(
    config: ConfigService,
    private readonly logger: LoggerService,
  ) {
    const host = config.get<string>('SMTP_HOST');
    const portRaw = config.get<string>('SMTP_PORT');
    const user = config.get<string>('SMTP_USER');
    const pass = config.get<string>('SMTP_PASS');
    this.from = config.get<string>('SMTP_FROM') ?? user;

    if (host && user && pass) {
      const port = portRaw ? parseInt(portRaw, 10) : 587;
      this.transporter = nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        auth: { user, pass },
      });
    } else {
      this.transporter = null;
    }
  }

  isConfigured(): boolean {
    return this.transporter !== null && !!this.from;
  }

  async send(msg: EmailMessage): Promise<void> {
    if (!this.transporter) {
      this.logger.warn('notifications', 'email send skipped — SMTP not configured');
      return;
    }
    if (!this.from) {
      throw new Error('SMTP_FROM or SMTP_USER must be set to send email');
    }
    await this.transporter.sendMail({
      from: this.from,
      to: msg.to,
      subject: msg.subject,
      text: msg.body,
    });
  }
}
