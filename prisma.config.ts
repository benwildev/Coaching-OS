import 'dotenv/config';
import { defineConfig } from 'prisma/config';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not set. Prisma CLI tooling (generate/migrate) requires it, same as the running app (see lib/db.ts) — no local fallback.');
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    url: process.env.DATABASE_URL,
  },
});
