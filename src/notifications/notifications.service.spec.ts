import { ConfigService } from '@nestjs/config';
import { LoggerService } from '../logger/logger.service';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import { EmailService } from './email.service';
import { NotificationsService } from './notifications.service';

const makeLogger = (): LoggerService =>
  ({
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }) as unknown as LoggerService;

const makeWhatsapp = (impl?: jest.Mock): WhatsappService =>
  ({
    sendMessage: impl ?? jest.fn().mockResolvedValue(undefined),
  }) as unknown as WhatsappService;

const makeEmail = (impl?: jest.Mock): EmailService =>
  ({
    isConfigured: jest.fn().mockReturnValue(true),
    send: impl ?? jest.fn().mockResolvedValue(undefined),
  }) as unknown as EmailService;

const makeConfig = (
  values: Record<string, string | undefined>,
): ConfigService =>
  ({
    get: (key: string) => values[key],
  }) as unknown as ConfigService;

describe('NotificationsService', () => {
  it('sends to both WhatsApp and email when both are configured', async () => {
    const whatsapp = makeWhatsapp();
    const email = makeEmail();
    const svc = new NotificationsService(
      makeConfig({ OWNER_PHONE: '447000', OWNER_EMAIL: 'jim@example.com' }),
      whatsapp,
      email,
      makeLogger(),
    );

    await svc.notifyOwner('discount asked', {
      reason: 'discount_request',
      from: '447111',
      message: 'any chance of 10% off?',
    });

    expect(whatsapp.sendMessage).toHaveBeenCalledWith(
      '447000',
      'discount asked',
      { override: true },
    );
    expect(email.send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'jim@example.com',
        subject: expect.stringContaining('discount_request'),
        body: expect.stringContaining('any chance of 10% off?'),
      }),
    );
  });

  it('skips WhatsApp when OWNER_PHONE not set', async () => {
    const whatsapp = makeWhatsapp();
    const email = makeEmail();
    const svc = new NotificationsService(
      makeConfig({ OWNER_EMAIL: 'jim@example.com' }),
      whatsapp,
      email,
      makeLogger(),
    );

    await svc.notifyOwner('hi');

    expect(whatsapp.sendMessage).not.toHaveBeenCalled();
    expect(email.send).toHaveBeenCalled();
  });

  it('skips email when OWNER_EMAIL not set', async () => {
    const whatsapp = makeWhatsapp();
    const email = makeEmail();
    const svc = new NotificationsService(
      makeConfig({ OWNER_PHONE: '447000' }),
      whatsapp,
      email,
      makeLogger(),
    );

    await svc.notifyOwner('hi');

    expect(whatsapp.sendMessage).toHaveBeenCalled();
    expect(email.send).not.toHaveBeenCalled();
  });

  it('does nothing when neither channel is configured', async () => {
    const whatsapp = makeWhatsapp();
    const email = makeEmail();
    const svc = new NotificationsService(
      makeConfig({}),
      whatsapp,
      email,
      makeLogger(),
    );

    await svc.notifyOwner('hi');

    expect(whatsapp.sendMessage).not.toHaveBeenCalled();
    expect(email.send).not.toHaveBeenCalled();
  });

  it('does not throw if WhatsApp delivery fails — email still sent', async () => {
    const whatsapp = makeWhatsapp(
      jest.fn().mockRejectedValue(new Error('whatsapp down')),
    );
    const email = makeEmail();
    const logger = makeLogger();
    const svc = new NotificationsService(
      makeConfig({ OWNER_PHONE: '447000', OWNER_EMAIL: 'jim@example.com' }),
      whatsapp,
      email,
      logger,
    );

    await expect(svc.notifyOwner('hi')).resolves.toBeUndefined();
    expect(email.send).toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledWith(
      'notifications',
      'whatsapp delivery failed',
      expect.any(Object),
    );
  });

  it('does not throw if email delivery fails — WhatsApp still sent', async () => {
    const whatsapp = makeWhatsapp();
    const email = makeEmail(
      jest.fn().mockRejectedValue(new Error('smtp down')),
    );
    const logger = makeLogger();
    const svc = new NotificationsService(
      makeConfig({ OWNER_PHONE: '447000', OWNER_EMAIL: 'jim@example.com' }),
      whatsapp,
      email,
      logger,
    );

    await expect(svc.notifyOwner('hi')).resolves.toBeUndefined();
    expect(whatsapp.sendMessage).toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledWith(
      'notifications',
      'email delivery failed',
      expect.any(Object),
    );
  });

  it('includes context fields in the email body', async () => {
    const email = makeEmail();
    const svc = new NotificationsService(
      makeConfig({ OWNER_EMAIL: 'jim@example.com' }),
      makeWhatsapp(),
      email,
      makeLogger(),
    );

    await svc.notifyOwner('hold conflict', {
      reason: 'hold_conflict',
      from: '447111',
      intent: 'availability_inquiry',
      extra: { dates: '2027-07-11 → 2027-07-18' },
    });

    const call = (email.send as jest.Mock).mock.calls[0][0];
    expect(call.body).toContain('hold conflict');
    expect(call.body).toContain('From: 447111');
    expect(call.body).toContain('Intent: availability_inquiry');
    expect(call.body).toContain('dates: 2027-07-11 → 2027-07-18');
  });
});
