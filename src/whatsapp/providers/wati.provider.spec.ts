import axios from 'axios';
import { ConfigService } from '@nestjs/config';
import { LoggerService } from '../../logger/logger.service';
import { WatiProvider } from './wati.provider';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

const makeConfig = (overrides: Record<string, string | undefined> = {}): ConfigService =>
  ({
    get: (key: string) => {
      const defaults: Record<string, string> = {
        WATI_API_URL: 'https://tenant.wati.io/api/v1',
        WATI_ACCESS_TOKEN: 'wati-token',
      };
      return key in overrides ? overrides[key] : defaults[key];
    },
  }) as unknown as ConfigService;

const makeLogger = (): LoggerService =>
  ({
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }) as unknown as LoggerService;

describe('WatiProvider', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('construction', () => {
    it('throws when WATI_API_URL is missing', () => {
      expect(() => new WatiProvider(makeConfig({ WATI_API_URL: undefined }), makeLogger())).toThrow();
    });

    it('throws when WATI_ACCESS_TOKEN is missing', () => {
      expect(
        () => new WatiProvider(makeConfig({ WATI_ACCESS_TOKEN: undefined }), makeLogger()),
      ).toThrow();
    });
  });

  describe('sendMessage', () => {
    it('POSTs to the Wati sendSessionMessage endpoint', async () => {
      mockedAxios.post.mockResolvedValue({ data: { id: 'wati-msg-1' } });
      const provider = new WatiProvider(makeConfig(), makeLogger());

      await provider.sendMessage('628123456789', 'hello');

      expect(mockedAxios.post).toHaveBeenCalledWith(
        'https://tenant.wati.io/api/v1/sendSessionMessage/628123456789',
        {},
        expect.objectContaining({
          params: { messageText: 'hello' },
          headers: expect.objectContaining({ Authorization: 'Bearer wati-token' }),
        }),
      );
    });

    it('logs and rethrows on send failure', async () => {
      const err = Object.assign(new Error('server error'), {
        response: { status: 500, data: { message: 'internal error' } },
        isAxiosError: true,
      });
      mockedAxios.post.mockRejectedValue(err);
      const logger = makeLogger();
      const provider = new WatiProvider(makeConfig(), logger);

      await expect(provider.sendMessage('628', 'hi')).rejects.toThrow('server error');
      expect(logger.error).toHaveBeenCalledWith(
        'whatsapp',
        expect.stringContaining('wati send failed'),
        expect.objectContaining({ to: '628', status: 500 }),
      );
    });
  });

  describe('sendTemplate', () => {
    it('POSTs to the Wati sendTemplateMessage endpoint with name/value parameters', async () => {
      mockedAxios.post.mockResolvedValue({ data: {} });
      const provider = new WatiProvider(makeConfig(), makeLogger());

      await provider.sendTemplate('628', 'availability_yes', { dates: '15-20 June', price: '£1400' });

      expect(mockedAxios.post).toHaveBeenCalledWith(
        'https://tenant.wati.io/api/v1/sendTemplateMessage',
        expect.objectContaining({
          whatsappNumber: '628',
          template_name: 'availability_yes',
          parameters: [
            { name: 'dates', value: '15-20 June' },
            { name: 'price', value: '£1400' },
          ],
        }),
        expect.any(Object),
      );
    });
  });

  describe('parseWebhook', () => {
    it('extracts a text message from a Wati webhook payload', () => {
      const provider = new WatiProvider(makeConfig(), makeLogger());
      const payload = { waId: '628123456789', text: 'is 15-20 june free?', id: 'msg-1', type: 'text' };

      expect(provider.parseWebhook(payload)).toEqual({
        from: '628123456789',
        text: 'is 15-20 june free?',
        id: 'msg-1',
      });
    });

    it('returns null for non-text events', () => {
      const provider = new WatiProvider(makeConfig(), makeLogger());
      expect(provider.parseWebhook({ waId: '628', type: 'image' })).toBeNull();
    });

    it('returns null for owner-sent (echo) events', () => {
      const provider = new WatiProvider(makeConfig(), makeLogger());
      expect(
        provider.parseWebhook({
          waId: '628',
          type: 'text',
          text: 'hi',
          owner: true,
        }),
      ).toBeNull();
    });

    it('returns null for unrecognised payload shape', () => {
      const provider = new WatiProvider(makeConfig(), makeLogger());
      expect(provider.parseWebhook({})).toBeNull();
    });
  });

  describe('parseOutboundEcho', () => {
    it('returns an echo for an owner-sent text event', () => {
      const provider = new WatiProvider(makeConfig(), makeLogger());
      const payload = {
        waId: '628123456789',
        text: 'hi, calling you in 5',
        id: 'echo-1',
        type: 'text',
        owner: true,
      };

      expect(provider.parseOutboundEcho(payload)).toEqual({
        to: '628123456789',
        text: 'hi, calling you in 5',
        id: 'echo-1',
      });
    });

    it('returns null when the event is from the customer (owner=false)', () => {
      const provider = new WatiProvider(makeConfig(), makeLogger());
      expect(
        provider.parseOutboundEcho({
          waId: '628',
          type: 'text',
          text: 'hi',
        }),
      ).toBeNull();
    });

    it('returns null for non-text echo events', () => {
      const provider = new WatiProvider(makeConfig(), makeLogger());
      expect(
        provider.parseOutboundEcho({ waId: '628', type: 'image', owner: true }),
      ).toBeNull();
    });
  });

  describe('validateWebhookSignature', () => {
    it('always returns true (Wati provides no HMAC signatures)', () => {
      const provider = new WatiProvider(makeConfig(), makeLogger());
      expect(provider.validateWebhookSignature(Buffer.from('{}'), {})).toBe(true);
    });
  });

  describe('assignToHuman', () => {
    it('calls the Wati assignConversation endpoint', async () => {
      mockedAxios.post.mockResolvedValue({ data: {} });
      const provider = new WatiProvider(makeConfig(), makeLogger());

      await provider.assignToHuman('conv-123');

      expect(mockedAxios.post).toHaveBeenCalledWith(
        'https://tenant.wati.io/api/v1/assignConversation/conv-123',
        {},
        expect.objectContaining({
          headers: expect.objectContaining({ Authorization: 'Bearer wati-token' }),
        }),
      );
    });

    it('logs and rethrows on assign failure', async () => {
      const err = Object.assign(new Error('not found'), {
        response: { status: 404 },
        isAxiosError: true,
      });
      mockedAxios.post.mockRejectedValue(err);
      const logger = makeLogger();
      const provider = new WatiProvider(makeConfig(), logger);

      await expect(provider.assignToHuman('conv-456')).rejects.toThrow('not found');
      expect(logger.error).toHaveBeenCalledWith(
        'whatsapp',
        expect.stringContaining('wati assign failed'),
        expect.objectContaining({ conversationId: 'conv-456', status: 404 }),
      );
    });
  });
});
