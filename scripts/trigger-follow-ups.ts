/**
 * Manually trigger the follow-ups daily check.
 *
 * Usage:
 *   npm run trigger:follow-ups
 *
 * Bootstraps the Nest app context (no HTTP server), runs
 * FollowUpsCronService.runDailyCheck(), and exits. Honours all the same
 * env vars as the running app.
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { FollowUpsCronService } from '../src/follow-ups/follow-ups-cron.service';

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['log', 'warn', 'error'],
  });
  try {
    const cron = app.get(FollowUpsCronService);
    await cron.runDailyCheck();
  } finally {
    await app.close();
  }
}

main().catch((err: Error) => {
  console.error('Trigger failed:', err.message);
  process.exit(1);
});
