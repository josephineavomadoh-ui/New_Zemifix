import { PrismaClient } from '@prisma/platform-client';

const globalForPlatformPrisma = globalThis as unknown as { platformPrisma: PrismaClient };

const runtimePlatformDbUrl =
  process.env.APP_PLATFORM_DATABASE_URL ||
  process.env.PLATFORM_DATABASE_URL ||
  'postgresql://postgres:postgres@localhost:5432/zemifix_platform_dev';

export const platformPrisma: PrismaClient =
  globalForPlatformPrisma.platformPrisma ||
  new PrismaClient({
    datasources: {
      db: {
        url: runtimePlatformDbUrl,
      },
    },
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPlatformPrisma.platformPrisma = platformPrisma;
}
