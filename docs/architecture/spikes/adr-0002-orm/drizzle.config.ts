import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: './drizzle/schema.ts',
  out: './drizzle-out',
  dbCredentials: { url: process.env.DRIZZLE_URL! },
});
