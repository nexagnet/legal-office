import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import pg from 'pg';
import { AppModule } from './app.module';
import { resolverFromEnv } from './http/actor';

async function bootstrap(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required');
  const app = await NestFactory.create(
    AppModule.register({
      pool: new pg.Pool({ connectionString: url }),
      resolver: process.env.AUTH_MODE === 'password' ? 'session' : resolverFromEnv(),
      auth: {
        sessionTtlMinutes: Number(process.env.SESSION_TTL_MINUTES ?? 720),
        secureCookie: process.env.NODE_ENV === 'production',
        allowedOrigins: (process.env.WEB_ORIGIN ?? '')
          .split(',')
          .map((o) => o.trim())
          .filter(Boolean),
      },
    }),
  );
  app.enableShutdownHooks();
  await app.listen(Number(process.env.PORT ?? 3001));
}

void bootstrap();
