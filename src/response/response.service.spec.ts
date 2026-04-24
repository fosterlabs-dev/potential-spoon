import { ConfigService } from '@nestjs/config';
import { LoggerService } from '../logger/logger.service';
import { TemplatesService } from '../templates/templates.service';
import { ResponseService } from './response.service';

const makeLogger = (): LoggerService =>
  ({
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }) as unknown as LoggerService;

const makeTemplates = (text = 'template text'): TemplatesService =>
  ({
    render: jest.fn().mockResolvedValue(text),
    fetchRaw: jest.fn().mockResolvedValue([text]),
  }) as unknown as TemplatesService;

const makeConfig = (overrides: Record<string, string | undefined> = {}): ConfigService =>
  ({
    get: (key: string) => overrides[key],
  }) as unknown as ConfigService;

describe('ResponseService — template mode', () => {
  it('delegates render to TemplatesService', async () => {
    const templates = makeTemplates('hello');
    const svc = new ResponseService(templates, makeLogger(), makeConfig());

    const result = await svc.render('greeting_ask_dates');

    expect(result).toBe('hello');
    expect(templates.render).toHaveBeenCalledWith('greeting_ask_dates');
  });

  it('defaults to template mode when RESPONSE_MODE is unset', async () => {
    const templates = makeTemplates('from template');
    const svc = new ResponseService(templates, makeLogger(), makeConfig());

    await svc.render('greeting_ask_dates');

    expect(templates.render).toHaveBeenCalled();
  });

  it('raises for unknown template key (propagates TemplatesService error)', async () => {
    const templates = makeTemplates();
    (templates.render as jest.Mock).mockRejectedValue(
      new Error('no template found for key "bad_key"'),
    );
    const svc = new ResponseService(templates, makeLogger(), makeConfig());

    await expect(svc.render('bad_key')).rejects.toThrow('no template found');
  });
});

describe('ResponseService — generate mode init', () => {
  it('throws at construction when ANTHROPIC_API_KEY is missing', () => {
    const templates = makeTemplates();
    expect(
      () =>
        new ResponseService(
          templates,
          makeLogger(),
          makeConfig({ RESPONSE_MODE: 'generate' }),
        ),
    ).toThrow('ANTHROPIC_API_KEY must be set');
  });

  it('constructs without error when API key is present', () => {
    const templates = makeTemplates();
    expect(
      () =>
        new ResponseService(
          templates,
          makeLogger(),
          makeConfig({
            RESPONSE_MODE: 'generate',
            ANTHROPIC_API_KEY: 'test-key',
          }),
        ),
    ).not.toThrow();
  });
});
