import axios from 'axios';
import { ConfigService } from '@nestjs/config';
import { LoggerService } from '../logger/logger.service';
import { WhatsappService } from './whatsapp.service';

jest.mock('axios');

const mockedAxios = axios as jest.Mocked<typeof axios>;

const makeConfig = (
  overrides: Record<string, string | undefined> = {},
): ConfigService =>
  ({
    get: (key: string) => {
      const defaults: Record<string, string> = {
        WHATSAPP_PHONE_NUMBER_ID: 'phone-id-123',
        WHATSAPP_ACCESS_TOKEN: 'access-token',
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

describe('WhatsappService.sendMessage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('throws at construction when required config is missing', () => {
    expect(
      () =>
        new WhatsappService(
          makeConfig({ WHATSAPP_PHONE_NUMBER_ID: undefined }),
          makeLogger(),
        ),
    ).toThrow();
    expect(
      () =>
        new WhatsappService(
          makeConfig({ WHATSAPP_ACCESS_TOKEN: undefined }),
          makeLogger(),
        ),
    ).toThrow();
  });

  it('POSTs to the WhatsApp Graph API with the right payload and auth', async () => {
    mockedAxios.post.mockResolvedValue({ data: { messages: [{ id: 'wamid.1' }] } });
    const service = new WhatsappService(makeConfig(), makeLogger());

    await service.sendMessage('628123456789', 'hello');

    expect(mockedAxios.post).toHaveBeenCalledWith(
      expect.stringContaining('phone-id-123/messages'),
      expect.objectContaining({
        messaging_product: 'whatsapp',
        to: '628123456789',
        type: 'text',
        text: { body: 'hello' },
      }),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer access-token',
        }),
      }),
    );
  });

  it('logs every send at info with to + id', async () => {
    mockedAxios.post.mockResolvedValue({ data: { messages: [{ id: 'wamid.abc' }] } });
    const logger = makeLogger();
    const service = new WhatsappService(makeConfig(), logger);

    await service.sendMessage('628', 'hi');

    expect(logger.info).toHaveBeenCalledWith(
      'whatsapp',
      expect.stringContaining('sent'),
      expect.objectContaining({ to: '628', id: 'wamid.abc' }),
    );
  });

  it('retries once on a 429 and returns the retried result', async () => {
    const err = Object.assign(new Error('rate limited'), {
      response: { status: 429 },
      isAxiosError: true,
    });
    mockedAxios.post
      .mockRejectedValueOnce(err)
      .mockResolvedValueOnce({ data: { messages: [{ id: 'wamid.retry' }] } });
    jest.spyOn(global, 'setTimeout').mockImplementation(((cb: () => void) => {
      cb();
      return 0 as unknown as NodeJS.Timeout;
    }) as unknown as typeof setTimeout);
    const logger = makeLogger();
    const service = new WhatsappService(makeConfig(), logger);

    await service.sendMessage('628', 'hi');

    expect(mockedAxios.post).toHaveBeenCalledTimes(2);
    expect(logger.warn).toHaveBeenCalledWith(
      'whatsapp',
      expect.stringContaining('retry'),
      expect.any(Object),
    );
  });

  it('logs and rethrows when the API returns a non-retryable error', async () => {
    const err = Object.assign(new Error('bad token'), {
      response: { status: 401, data: { error: { message: 'unauthorized' } } },
      isAxiosError: true,
    });
    mockedAxios.post.mockRejectedValue(err);
    const logger = makeLogger();
    const service = new WhatsappService(makeConfig(), logger);

    await expect(service.sendMessage('628', 'hi')).rejects.toThrow('bad token');
    expect(logger.error).toHaveBeenCalledWith(
      'whatsapp',
      expect.stringContaining('send failed'),
      expect.objectContaining({ to: '628', status: 401 }),
    );
  });
});
