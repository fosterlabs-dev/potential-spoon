/**
 * Manually trigger the holds daily check.
 *
 * Usage:
 *   npm run trigger:holds
 *
 * Bootstraps the Nest app context (no HTTP server), runs
 * HoldsCronService.runDailyCheck(), and exits. Sends hold reminders for
 * holds expiring within 24h and expiry messages for holds past their
 * expiry, exactly as the daily 08:00 UTC cron would.
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { HoldsCronService } from '../src/holds/holds-cron.service';

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['log', 'warn', 'error'],
  });
  try {
    const cron = app.get(HoldsCronService);
    await cron.runDailyCheck();
  } finally {
    await app.close();
  }
}

main().catch((err: Error) => {
  console.error('Trigger failed:', err.message);
  process.exit(1);
});
