import { ConversationService } from '../conversation/conversation.service';
import { LoggerService } from '../logger/logger.service';
import { WhatsAppProvider } from './providers/provider.interface';
import { WhatsappService } from './whatsapp.service';

const makeProvider = (): jest.Mocked<WhatsAppProvider> => ({
  sendMessage: jest.fn().mockResolvedValue(undefined),
  sendTemplate: jest.fn().mockResolvedValue(undefined),
  parseWebhook: jest.fn().mockReturnValue(null),
  validateWebhookSignature: jest.fn().mockReturnValue(true),
  verifyWebhook: jest.fn().mockReturnValue('challenge'),
  assignToHuman: jest.fn().mockResolvedValue(undefined),
});

const makeConversation = (canSend = true): ConversationService =>
  ({ canSendBot: jest.fn().mockResolvedValue(canSend) }) as unknown as ConversationService;

const makeLogger = (): LoggerService =>
  ({
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }) as unknown as LoggerService;

const makeService = (
  provider: WhatsAppProvider,
  canSend = true,
): WhatsappService =>
  new WhatsappService(provider, makeLogger(), makeConversation(canSend));

describe('WhatsappService', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('sendMessage', () => {
    it('delegates to the provider when conversation is in bot mode', async () => {
      const provider = makeProvider();
      await makeService(provider).sendMessage('628', 'hello');
      expect(provider.sendMessage).toHaveBeenCalledWith('628', 'hello');
    });

    it('skips the send when conversation is not in bot mode', async () => {
      const provider = makeProvider();
      const logger = makeLogger();
      const service = new WhatsappService(provider, logger, makeConversation(false));

      await service.sendMessage('628', 'hi');

      expect(provider.sendMessage).not.toHaveBeenCalled();
      expect(logger.warn).toHaveBeenCalledWith(
        'whatsapp',
        expect.stringContaining('skipped'),
        expect.objectContaining({ to: '628' }),
      );
    });

    it('bypasses the pause check when override=true', async () => {
      const provider = makeProvider();
      await makeService(provider, false).sendMessage('628', 'hi', { override: true });
      expect(provider.sendMessage).toHaveBeenCalled();
    });
  });

  describe('sendTemplate', () => {
    it('delegates to the provider when in bot mode', async () => {
      const provider = makeProvider();
      await makeService(provider).sendTemplate('628', 'tmpl', { a: '1' });
      expect(provider.sendTemplate).toHaveBeenCalledWith('628', 'tmpl', { a: '1' });
    });

    it('skips when not in bot mode', async () => {
      const provider = makeProvider();
      await makeService(provider, false).sendTemplate('628', 'tmpl', {});
      expect(provider.sendTemplate).not.toHaveBeenCalled();
    });

    it('bypasses pause check with override=true', async () => {
      const provider = makeProvider();
      await makeService(provider, false).sendTemplate('628', 'tmpl', {}, { override: true });
      expect(provider.sendTemplate).toHaveBeenCalled();
    });
  });

  describe('assignToHuman', () => {
    it('delegates to the provider', async () => {
      const provider = makeProvider();
      await makeService(provider).assignToHuman('conv-1');
      expect(provider.assignToHuman).toHaveBeenCalledWith('conv-1');
    });

    it('is a no-op when the provider does not support assignToHuman', async () => {
      const provider = makeProvider();
      delete (provider as Partial<typeof provider>).assignToHuman;
      await expect(makeService(provider).assignToHuman('conv-1')).resolves.not.toThrow();
    });
  });

  describe('parseWebhook', () => {
    it('delegates to the provider', () => {
      const provider = makeProvider();
      const msg = { from: '628', text: 'hi', id: '1' };
      provider.parseWebhook.mockReturnValue(msg);
      expect(makeService(provider).parseWebhook({ raw: true })).toBe(msg);
    });
  });

  describe('validateWebhookSignature', () => {
    it('delegates to the provider', () => {
      const provider = makeProvider();
      provider.validateWebhookSignature.mockReturnValue(false);
      expect(makeService(provider).validateWebhookSignature(Buffer.from('{}'), {})).toBe(false);
    });
  });

  describe('verifyWebhook', () => {
    it('delegates to the provider', () => {
      const provider = makeProvider();
      provider.verifyWebhook!.mockReturnValue('xyz');
      expect(makeService(provider).verifyWebhook('subscribe', 'tok', 'xyz')).toBe('xyz');
    });

    it('throws when the provider does not support verifyWebhook', () => {
      const provider = makeProvider();
      delete (provider as Partial<typeof provider>).verifyWebhook;
      expect(() => makeService(provider).verifyWebhook('subscribe', 'tok', 'c')).toThrow();
    });
  });
});
