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
      resolver: resolverFromEnv(),
    }),
  );
  app.enableShutdownHooks();
  await app.listen(Number(process.env.PORT ?? 3001));
}

void bootstrap();
