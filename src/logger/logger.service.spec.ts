import { ConfigService } from '@nestjs/config';
import { LoggerService } from './logger.service';

const makeConfig = (level?: string): ConfigService =>
  ({ get: () => level }) as unknown as ConfigService;

describe('LoggerService', () => {
  let stdout: jest.SpyInstance;
  let stderr: jest.SpyInstance;

  beforeEach(() => {
    stdout = jest
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true);
    stderr = jest
      .spyOn(process.stderr, 'write')
      .mockImplementation(() => true);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('writes info logs to stdout with level and module tag', () => {
    const logger = new LoggerService(makeConfig('info'));

    logger.info('whatsapp', 'received message');

    expect(stdout).toHaveBeenCalledTimes(1);
    const line = stdout.mock.calls[0][0] as string;
    expect(line).toContain('INFO');
    expect(line).toContain('[whatsapp]');
    expect(line).toContain('received message');
  });

  it('uses the module color for non-error levels', () => {
    const logger = new LoggerService(makeConfig('info'));

    logger.info('whatsapp', 'x');

    const line = stdout.mock.calls[0][0] as string;
    expect(line).toContain('\x1b[36m'); // cyan
    expect(line).toContain('\x1b[0m');
  });

  it('uses red for error regardless of module color', () => {
    const logger = new LoggerService(makeConfig('info'));

    logger.error('pricing', 'boom');

    const line = stderr.mock.calls[0][0] as string;
    expect(line).toContain('\x1b[31m'); // red
    expect(line).not.toContain('\x1b[33m'); // not pricing yellow
  });

  it('sends warn and error to stderr, info and debug to stdout', () => {
    const logger = new LoggerService(makeConfig('debug'));

    logger.debug('parser', 'd');
    logger.info('parser', 'i');
    logger.warn('parser', 'w');
    logger.error('parser', 'e');

    expect(stdout).toHaveBeenCalledTimes(2);
    expect(stderr).toHaveBeenCalledTimes(2);
  });

  it('suppresses debug when LOG_LEVEL is info', () => {
    const logger = new LoggerService(makeConfig('info'));

    logger.debug('parser', 'noisy');

    expect(stdout).not.toHaveBeenCalled();
    expect(stderr).not.toHaveBeenCalled();
  });

  it('emits debug when LOG_LEVEL is debug', () => {
    const logger = new LoggerService(makeConfig('debug'));

    logger.debug('parser', 'noisy');

    expect(stdout).toHaveBeenCalledTimes(1);
  });

  it('appends meta as JSON when provided', () => {
    const logger = new LoggerService(makeConfig('info'));

    logger.info('airtable', 'fetched', { count: 3 });

    const line = stdout.mock.calls[0][0] as string;
    expect(line).toContain('{"count":3}');
  });

  it('defaults minimum level to info when LOG_LEVEL is unset', () => {
    const logger = new LoggerService(makeConfig(undefined));

    logger.debug('parser', 'nope');
    logger.info('parser', 'yep');

    expect(stdout).toHaveBeenCalledTimes(1);
  });
});
