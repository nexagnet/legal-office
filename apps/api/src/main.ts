import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import pg from 'pg';
import { AppModule } from './app.module';
import { resolverFromEnv } from './http/actor';
import { fileStoreFromEnv } from './storage/file-store';
import { startReminderSchedule } from './reminders/reminder-schedule';
import { startScanPurgeSchedule } from './dms/scan-purge';
import { rateLimit, rateRulesFromEnv, securityHeaders } from './http/hardening';

async function bootstrap(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required');
  const pool = new pg.Pool({ connectionString: url });
  const fileStore = fileStoreFromEnv();
  const app = await NestFactory.create(
    AppModule.register({
      fileStore,
      pool,
      resolver: process.env.AUTH_MODE === 'password' ? 'session' : resolverFromEnv(),
      auth: {
        sessionTtlMinutes: Number(process.env.SESSION_TTL_MINUTES ?? 720),
        secureCookie: process.env.NODE_ENV === 'production',
        allowedOrigins: (process.env.WEB_ORIGIN ?? '')
          .split(',')
          .map((o) => o.trim())
          .filter(Boolean),
        publicWebUrl: process.env.PUBLIC_WEB_URL || undefined,
      },
    }),
  );
  const proxy = process.env.TRUST_PROXY;
  if (proxy) {
    // Số = số tầng proxy tin cậy; chuỗi khác (vd "loopback") chuyển nguyên cho Express.
    app
      .getHttpAdapter()
      .getInstance()
      .set('trust proxy', /^\d+$/.test(proxy) ? Number(proxy) : proxy);
  }
  app.use(securityHeaders(), rateLimit(rateRulesFromEnv()));
  app.enableShutdownHooks();
  if (process.env.REMINDERS_SCHEDULE === 'on') {
    const stop = startReminderSchedule(pool, process.env, console);
    process.once('SIGTERM', stop);
    process.once('SIGINT', stop);
  }
  // Dọn file scan đã xóa quá 30 ngày khỏi kho (N6). Cần kho tệp; thiếu thì không bật được.
  if (process.env.SCAN_PURGE_SCHEDULE === 'on') {
    if (!fileStore) throw new Error('SCAN_PURGE_SCHEDULE=on cần FILE_STORE');
    const stopPurge = startScanPurgeSchedule(pool, fileStore, process.env, console);
    process.once('SIGTERM', stopPurge);
    process.once('SIGINT', stopPurge);
  }
  await app.listen(Number(process.env.PORT ?? 3001));
}

void bootstrap();
