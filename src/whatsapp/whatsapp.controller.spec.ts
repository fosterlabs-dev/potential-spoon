import { ConfigService } from '@nestjs/config';
import { ForbiddenException } from '@nestjs/common';
import * as crypto from 'crypto';
import type { Request } from 'express';
import { LoggerService } from '../logger/logger.service';
import { MessageHandlerService } from '../orchestrator/message-handler.service';
import { WhatsappController } from './whatsapp.controller';

const makeHandler = (): MessageHandlerService =>
  ({ handle: jest.fn().mockResolvedValue(undefined) }) as unknown as MessageHandlerService;

const APP_SECRET = 'test-app-secret';
const VERIFY_TOKEN = 'test-verify-token';

const makeConfig = (
  overrides: Record<string, string | undefined> = {},
): ConfigService =>
  ({
    get: (key: string) => {
      const defaults: Record<string, string> = {
        WHATSAPP_APP_SECRET: APP_SECRET,
        WHATSAPP_VERIFY_TOKEN: VERIFY_TOKEN,
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

const sign = (raw: Buffer, secret = APP_SECRET) =>
  'sha256=' + crypto.createHmac('sha256', secret).update(raw).digest('hex');

const asReq = (raw?: Buffer): Request =>
  ({ rawBody: raw } as unknown as Request);

const samplePayload = {
  object: 'whatsapp_business_account',
  entry: [
    {
      id: 'biz-id',
      changes: [
        {
          value: {
            messaging_product: 'whatsapp',
            messages: [
              {
                from: '628123456789',
                id: 'wamid.abc',
                timestamp: '1750000000',
                text: { body: 'is 15-20 june free?' },
                type: 'text',
              },
            ],
          },
        },
      ],
    },
  ],
};

describe('WhatsappController (verification)', () => {
  it('returns the challenge when token and mode match', () => {
    const ctrl = new WhatsappController(makeConfig(), makeLogger(), makeHandler());

    const out = ctrl.verify('subscribe', VERIFY_TOKEN, 'challenge-123');

    expect(out).toBe('challenge-123');
  });

  it('throws Forbidden when the verify token is wrong', () => {
    const ctrl = new WhatsappController(makeConfig(), makeLogger(), makeHandler());

    expect(() => ctrl.verify('subscribe', 'wrong', 'c')).toThrow(
      ForbiddenException,
    );
  });

  it('throws Forbidden when the mode is not "subscribe"', () => {
    const ctrl = new WhatsappController(makeConfig(), makeLogger(), makeHandler());

    expect(() => ctrl.verify('unsubscribe', VERIFY_TOKEN, 'c')).toThrow(
      ForbiddenException,
    );
  });
});

describe('WhatsappController (incoming POST)', () => {
  it('accepts a valid signature, logs the incoming message, and returns ok', async () => {
    const raw = Buffer.from(JSON.stringify(samplePayload));
    const logger = makeLogger();
    const ctrl = new WhatsappController(makeConfig(), logger, makeHandler());

    const out = await ctrl.receive(asReq(raw), sign(raw), samplePayload);

    expect(out).toEqual({ status: 'ok' });
    expect(logger.info).toHaveBeenCalledWith(
      'whatsapp',
      expect.stringContaining('received'),
      expect.objectContaining({ from: '628123456789', text: 'is 15-20 june free?' }),
    );
  });

  it('returns ok but warns and drops when the signature is invalid', async () => {
    const raw = Buffer.from(JSON.stringify(samplePayload));
    const logger = makeLogger();
    const ctrl = new WhatsappController(makeConfig(), logger, makeHandler());

    const bogus = sign(raw, 'different-secret');
    const out = await ctrl.receive(asReq(raw), bogus, samplePayload);

    expect(out).toEqual({ status: 'ok' });
    expect(logger.warn).toHaveBeenCalledWith(
      'whatsapp',
      expect.stringContaining('signature'),
      expect.any(Object),
    );
    expect(logger.info).not.toHaveBeenCalled();
  });

  it('returns ok but warns when the signature header is missing', async () => {
    const raw = Buffer.from(JSON.stringify(samplePayload));
    const logger = makeLogger();
    const ctrl = new WhatsappController(makeConfig(), logger, makeHandler());

    const out = await ctrl.receive(asReq(raw), undefined, samplePayload);

    expect(out).toEqual({ status: 'ok' });
    expect(logger.warn).toHaveBeenCalled();
  });

  it('returns ok and warns when rawBody is missing (parser misconfigured)', async () => {
    const logger = makeLogger();
    const ctrl = new WhatsappController(makeConfig(), logger, makeHandler());

    const out = await ctrl.receive(asReq(undefined), 'sha256=deadbeef', samplePayload);

    expect(out).toEqual({ status: 'ok' });
    expect(logger.warn).toHaveBeenCalled();
  });

  it('does not crash on signatures of unexpected length', async () => {
    const raw = Buffer.from(JSON.stringify(samplePayload));
    const logger = makeLogger();
    const ctrl = new WhatsappController(makeConfig(), logger, makeHandler());

    const out = await ctrl.receive(asReq(raw), 'sha256=short', samplePayload);

    expect(out).toEqual({ status: 'ok' });
    expect(logger.warn).toHaveBeenCalled();
  });

  it('ignores events that contain no messages (status callbacks, etc.)', async () => {
    const statusOnly = {
      object: 'whatsapp_business_account',
      entry: [
        {
          id: 'biz',
          changes: [{ value: { messaging_product: 'whatsapp', statuses: [{}] } }],
        },
      ],
    };
    const raw = Buffer.from(JSON.stringify(statusOnly));
    const logger = makeLogger();
    const ctrl = new WhatsappController(makeConfig(), logger, makeHandler());

    const out = await ctrl.receive(asReq(raw), sign(raw), statusOnly);

    expect(out).toEqual({ status: 'ok' });
    expect(logger.info).not.toHaveBeenCalled();
  });
});
