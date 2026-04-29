import { ConfigService } from '@nestjs/config';
import {
  ConversationService,
  CrmSnapshot,
} from '../conversation/conversation.service';
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

const makeConversation = (
  snapshot: CrmSnapshot | null = null,
): ConversationService =>
  ({
    getCrmSnapshot: jest.fn().mockResolvedValue(snapshot),
  }) as unknown as ConversationService;

describe('NotificationsService', () => {
  it('sends to both WhatsApp and email when both are configured', async () => {
    const whatsapp = makeWhatsapp();
    const email = makeEmail();
    const svc = new NotificationsService(
      makeConfig({ OWNER_PHONE: '447000', OWNER_EMAIL: 'jim@example.com' }),
      whatsapp,
      email,
      makeConversation(),
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
      makeConversation(),
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
      makeConversation(),
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
      makeConversation(),
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
      makeConversation(),
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
      makeConversation(),
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
      makeConversation(),
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

  describe('notifyOwnerAboutConversation', () => {
    const snapshot: CrmSnapshot = {
      customerName: 'Sarah Jenkins',
      email: 'sarah@example.com',
      status: 'bot',
      lifecycleStatus: 'Responded',
      lastIntent: 'pricing_inquiry',
      datesRequested: '2027-07-11 → 2027-07-18',
      priceQuoted: 3400,
      availabilityResult: 'available',
      followUpCount: 0,
    };

    it('composes a structured block from the CRM snapshot', async () => {
      const whatsapp = makeWhatsapp();
      const email = makeEmail();
      const svc = new NotificationsService(
        makeConfig({ OWNER_PHONE: '447000', OWNER_EMAIL: 'jim@example.com' }),
        whatsapp,
        email,
        makeConversation(snapshot),
        makeLogger(),
      );

      await svc.notifyOwnerAboutConversation('447111', 'discount_request', {
        message: 'any chance of a discount?',
      });

      const waText = (whatsapp.sendMessage as jest.Mock).mock.calls[0][1];
      expect(waText).toContain('Discount request');
      expect(waText).toContain('Sarah Jenkins (447111)');
      expect(waText).toContain('Status: Responded');
      expect(waText).toContain('Last intent: pricing_inquiry');
      expect(waText).toContain('Dates: 2027-07-11 → 2027-07-18');
      expect(waText).toContain('Quote: €3,400');
      expect(waText).toContain('available');
      expect(waText).toContain('Email: sarah@example.com');
      expect(waText).toContain('Message: "any chance of a discount?"');

      const call = (email.send as jest.Mock).mock.calls[0][0];
      expect(call.subject).toContain('Sarah Jenkins');
    });

    it('falls back to phone-only when CRM has no row', async () => {
      const whatsapp = makeWhatsapp();
      const svc = new NotificationsService(
        makeConfig({ OWNER_PHONE: '447000' }),
        whatsapp,
        makeEmail(),
        makeConversation(null),
        makeLogger(),
      );

      await svc.notifyOwnerAboutConversation('447111', 'unclear_or_off_topic');

      const waText = (whatsapp.sendMessage as jest.Mock).mock.calls[0][1];
      expect(waText).toContain('Guest: 447111');
      expect(waText).toContain('Unclear / off-topic');
    });

    it('still delivers when CRM read throws', async () => {
      const whatsapp = makeWhatsapp();
      const conversation = {
        getCrmSnapshot: jest.fn().mockRejectedValue(new Error('airtable down')),
      } as unknown as ConversationService;
      const logger = makeLogger();
      const svc = new NotificationsService(
        makeConfig({ OWNER_PHONE: '447000' }),
        whatsapp,
        makeEmail(),
        conversation,
        logger,
      );

      await svc.notifyOwnerAboutConversation('447111', 'discount_request');

      expect(whatsapp.sendMessage).toHaveBeenCalled();
      expect(logger.warn).toHaveBeenCalledWith(
        'notifications',
        'CRM snapshot fetch failed',
        expect.any(Object),
      );
    });
  });
});
