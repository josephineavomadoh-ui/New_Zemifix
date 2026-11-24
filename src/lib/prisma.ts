import { PrismaClient } from '@prisma/client';
import { generateUuidV7 } from './uuid';
import { getActiveSecurityTransaction } from './securityTransactionScope';
import { getDatabaseNameFromUrl } from './databaseUrl';

export { getDatabaseNameFromUrl } from './databaseUrl';

/**
 * Models without an 'id' primary key (junction tables using compound keys).
 */
const modelsWithoutId = new Set(['RolePermission']);

export type EffectiveAppEnv = 'development' | 'test' | 'staging' | 'production';

export interface DatabaseIdentityAttributes {
  session_user: string;
  current_user: string;
  current_database: string;
  is_superuser: boolean;
  can_bypass_rls: boolean;
  effectiveAppEnv: EffectiveAppEnv;
}

const protectedDatabases = new Set(['zemifix_acceptance', 'zemifix_platform_dev']);
const expectedDatabaseByEnvironment: Record<EffectiveAppEnv, string> = {
  development: 'zemifix_dev',
  test: 'zemifix_dev_test',
  staging: 'zemifix_staging',
  production: 'zemifix_prod',
};

function assertRuntimeDatabaseTarget(databaseUrl: string, appEnv: EffectiveAppEnv): void {
  const databaseName = getDatabaseNameFromUrl(databaseUrl);
  if (protectedDatabases.has(databaseName)) {
    throw new Error(
      `[DATABASE_ISOLATION_FATAL] Configured target database "${databaseName}" is strictly prohibited.`
    );
  }

  if (databaseName !== expectedDatabaseByEnvironment[appEnv]) {
    throw new Error(
      `[DATABASE_CONTRACT_VIOLATION] Configured URL does not target the required ${appEnv} database.`
    );
  }
}

/**
 * Resolves the explicit deployment environment from APP_ENV or falls back securely to NODE_ENV for dev/test.
 * Fails closed if APP_ENV is invalid, empty/whitespace, or missing when NODE_ENV is production.
 *
 * Rules:
 *   1. If APP_ENV is explicitly set and valid (development|test|staging|production), use it.
 *   2. If APP_ENV is explicitly set to empty or whitespace-only, reject with error.
 *   3. If APP_ENV is explicitly set to an invalid string, reject with error.
 *   4. If APP_ENV is missing and NODE_ENV=development, allow development fallback.
 *   5. If APP_ENV is missing and NODE_ENV=test, allow test fallback.
 *   6. If APP_ENV is missing and NODE_ENV=production, FAIL CLOSED (staging & production must explicitly set APP_ENV).
 */
export function getEffectiveAppEnv(): EffectiveAppEnv {
  if (process.env.APP_ENV !== undefined) {
    const rawAppEnv = process.env.APP_ENV;
    const cleanedAppEnv = rawAppEnv.trim().toLowerCase();

    if (cleanedAppEnv.length === 0) {
      throw new Error(
        '[DATABASE_CONTRACT_VIOLATION] Empty or whitespace-only APP_ENV is prohibited. ' +
        'Explicit APP_ENV=development|test|staging|production required.'
      );
    }

    if (cleanedAppEnv === 'development' || cleanedAppEnv === 'test' || cleanedAppEnv === 'staging' || cleanedAppEnv === 'production') {
      return cleanedAppEnv;
    }

    throw new Error(
      `[DATABASE_CONTRACT_VIOLATION] Invalid or unsupported APP_ENV "${rawAppEnv}". ` +
      'Must be one of: development | test | staging | production.'
    );
  }

  const nodeEnv = process.env.NODE_ENV?.trim().toLowerCase();

  if (nodeEnv === 'production') {
    throw new Error(
      '[DATABASE_CONTRACT_VIOLATION] Production and staging environments require explicit APP_ENV=production or APP_ENV=staging configuration. ' +
      'Inferring environment from NODE_ENV=production alone is prohibited to prevent accidental database misconfiguration.'
    );
  }

  if (nodeEnv === 'test') {
    return 'test';
  }

  if (nodeEnv === 'development') {
    return 'development';
  }

  throw new Error(
    `[DATABASE_CONTRACT_VIOLATION] APP_ENV is required when NODE_ENV is missing or unsupported ("${nodeEnv ?? ''}").`
  );
}

/**
 * Select the appropriate database URL based on explicit environment contract without exposing secrets.
 * Ensures the application fails closed in production and staging if APP_DATABASE_URL is omitted.
 */
export function selectRuntimeDatabaseUrl(): string {
  const effectiveEnv = getEffectiveAppEnv();
  const appDbUrl = process.env.APP_DATABASE_URL;
  const dbUrl = process.env.DATABASE_URL;
  const testDbUrl = process.env.TEST_DATABASE_URL;
  let selectedUrl: string | undefined;

  if (effectiveEnv === 'test') {
    selectedUrl = [testDbUrl, appDbUrl, dbUrl].find((url) => url && url.trim().length > 0)?.trim();
    if (!selectedUrl) {
      throw new Error('[DATABASE_SECURITY_FATAL] No test database URL configured.');
    }
  } else if (appDbUrl && appDbUrl.trim().length > 0) {
    selectedUrl = appDbUrl.trim();
  } else if (effectiveEnv === 'production' || effectiveEnv === 'staging') {
    throw new Error(
      `[DATABASE_SECURITY_FATAL] APP_DATABASE_URL environment variable is required in ${effectiveEnv}. ` +
      'Application runtime must connect using restricted non-superuser role "zemifix_app_user".'
    );
  } else if (dbUrl && dbUrl.trim().length > 0) {
    selectedUrl = dbUrl.trim();
  }

  if (!selectedUrl) {
    throw new Error('[DATABASE_SECURITY_FATAL] Neither APP_DATABASE_URL nor DATABASE_URL is configured in environment.');
  }

  assertRuntimeDatabaseTarget(selectedUrl, effectiveEnv);
  return selectedUrl;
}

/**
 * Verifies runtime database identity, role attributes, and exact database allowlist contract.
 * Fails closed on superuser logins, BYPASSRLS roles, protected database access, or environment mismatches.
 *
 * Exact Environment Identity Contracts:
 *   - Development: session_user = 'zemifix_app_user', current_database = 'zemifix_dev'
 *   - Test:        session_user = 'zemifix_app_user_test', current_database = 'zemifix_dev_test'
 *   - Staging:     session_user = 'zemifix_app_user', current_database = 'zemifix_staging'
 *   - Production:  session_user = 'zemifix_app_user', current_database = 'zemifix_prod'
 */
export async function verifyRuntimeDatabaseAttributes(
  client: any = prisma
): Promise<DatabaseIdentityAttributes> {
  const [roleRes] = await client.$queryRaw<Array<{
    session_user: string;
    current_user: string;
    current_database: string;
    is_superuser: boolean;
    can_bypass_rls: boolean;
  }>>`
    SELECT
      session_user::text as "session_user",
      current_user::text as "current_user",
      current_database()::text as "current_database",
      rolsuper as "is_superuser",
      rolbypassrls as "can_bypass_rls"
    FROM pg_roles
    WHERE rolname = session_user;
  `;

  if (!roleRes) {
    throw new Error('[DATABASE_IDENTITY_FATAL] Failed to query PostgreSQL runtime session_user role attributes.');
  }

  const { session_user, current_user, current_database, is_superuser, can_bypass_rls } = roleRes;

  if (current_user !== session_user) {
    throw new Error(
      '[DATABASE_SECURITY_FATAL] Runtime role switching is prohibited; current_user must match session_user.'
    );
  }

  // 1. HARD ISOLATION GUARD: Absolute prohibition on protected databases
  const protectedDatabases = new Set(['zemifix_acceptance', 'zemifix_platform_dev']);
  if (protectedDatabases.has(current_database)) {
    throw new Error(
      `[DATABASE_ISOLATION_FATAL] Access to protected database "${current_database}" is strictly prohibited for Facility Mode web application runtime.`
    );
  }

  // 2. ROLE ATTRIBUTE ASSERTS
  if (is_superuser) {
    throw new Error(
      `[DATABASE_SECURITY_FATAL] Runtime database login "${session_user}" possesses SUPERUSER privileges. Restricted non-superuser role required.`
    );
  }

  if (can_bypass_rls) {
    throw new Error(
      `[DATABASE_SECURITY_FATAL] Runtime database login "${session_user}" possesses BYPASSRLS privileges. Restricted non-BYPASSRLS role required.`
    );
  }

  const effectiveEnv = getEffectiveAppEnv();

  if ((effectiveEnv === 'production' || effectiveEnv === 'staging') && session_user === 'postgres') {
    throw new Error(
      `[DATABASE_SECURITY_FATAL] ${effectiveEnv} database login cannot be "postgres". Restricted "zemifix_app_user" required.`
    );
  }

  // 3. EXACT ENVIRONMENT IDENTITY CONTRACT VERIFICATION
  if (effectiveEnv === 'test') {
    if (session_user !== 'zemifix_app_user_test' || current_database !== 'zemifix_dev_test') {
      throw new Error(
        `[DATABASE_CONTRACT_VIOLATION] Test environment contract mismatch. Expected "zemifix_app_user_test" on "zemifix_dev_test", found "${session_user}" on "${current_database}".`
      );
    }
  } else if (effectiveEnv === 'production') {
    if (session_user !== 'zemifix_app_user' || current_database !== 'zemifix_prod') {
      throw new Error(
        `[DATABASE_CONTRACT_VIOLATION] Production environment contract mismatch. Expected "zemifix_app_user" on "zemifix_prod", found "${session_user}" on "${current_database}".`
      );
    }
  } else if (effectiveEnv === 'staging') {
    if (session_user !== 'zemifix_app_user' || current_database !== 'zemifix_staging') {
      throw new Error(
        `[DATABASE_CONTRACT_VIOLATION] Staging environment contract mismatch. Expected "zemifix_app_user" on "zemifix_staging", found "${session_user}" on "${current_database}".`
      );
    }
  } else if (effectiveEnv === 'development') {
    if (session_user !== 'zemifix_app_user' || current_database !== 'zemifix_dev') {
      throw new Error(
        `[DATABASE_CONTRACT_VIOLATION] Development environment contract mismatch. Expected "zemifix_app_user" on "zemifix_dev", found "${session_user}" on "${current_database}".`
      );
    }
  }

  return {
    session_user,
    current_user,
    current_database,
    is_superuser,
    can_bypass_rls,
    effectiveAppEnv: effectiveEnv,
  };
}

/**
 * Creates an extended PrismaClient that automatically injects RFC 9562 UUIDv7
 * into the `id` field of any record created via application code if not already provided.
 * This guarantees time-ordered primary keys on high-throughput tables.
 */
function createExtendedPrismaClient() {
  const runtimeDbUrl = selectRuntimeDatabaseUrl();
  const basePrisma = new PrismaClient({
    datasources: {
      db: {
        url: runtimeDbUrl,
      },
    },
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

  let identityVerification: Promise<DatabaseIdentityAttributes> | undefined;
  const ensureRuntimeDatabaseIdentity = () => {
    if (!identityVerification) {
      identityVerification = verifyRuntimeDatabaseAttributes(basePrisma);
    }
    return identityVerification;
  };

  const extendedPrisma = basePrisma.$extends({
    name: 'uuidv7-injector',
    query: {
      async $allOperations({ args, query }) {
        await ensureRuntimeDatabaseIdentity();
        return query(args);
      },
      $allModels: {
        async create({ model, operation, args, query }) {
          if (!modelsWithoutId.has(model) && args.data && typeof args.data === 'object') {
            const dataObj = args.data as Record<string, unknown>;
            if (!dataObj.id) {
              dataObj.id = generateUuidV7();
            }
          }
          return query(args);
        },
        async createMany({ model, operation, args, query }) {
          if (!modelsWithoutId.has(model) && Array.isArray(args.data)) {
            args.data = args.data.map((item) => {
              if (item && typeof item === 'object') {
                const itemObj = { ...item } as Record<string, unknown>;
                if (!itemObj.id) {
                  itemObj.id = generateUuidV7();
                }
                return itemObj;
              }
              return item;
            });
          }
          return query(args);
        },
        async upsert({ model, operation, args, query }) {
          if (!modelsWithoutId.has(model) && args.create && typeof args.create === 'object') {
            const createObj = args.create as Record<string, unknown>;
            if (!createObj.id) {
              createObj.id = generateUuidV7();
            }
          }
          return query(args);
        },
      },
    },
  });

  const delegateProxies = new WeakMap<object, object>();
  const assertRootClientUseAllowed = () => {
    if (getActiveSecurityTransaction()) {
      throw new Error(
        'ROOT_PRISMA_ESCAPE: Use the active transaction client inside a security-context callback.'
      );
    }
  };
  const guardDelegate = <T extends object>(delegate: T): T => {
    const cached = delegateProxies.get(delegate);
    if (cached) return cached as T;

    const guardedDelegate = new Proxy(delegate, {
      get(target, property) {
        const member = Reflect.get(target, property, target);
        if (typeof member !== 'function') return member;
        return (...args: unknown[]) => {
          assertRootClientUseAllowed();
          return Reflect.apply(member, target, args);
        };
      },
    });
    delegateProxies.set(delegate, guardedDelegate);
    return guardedDelegate;
  };

  return new Proxy(extendedPrisma, {
    get(target, property) {
      const member = Reflect.get(target, property, target);
      if (typeof member === 'function') {
        return (...args: unknown[]) => {
          assertRootClientUseAllowed();
          return Reflect.apply(member, target, args);
        };
      }

      if (
        typeof property === 'string' &&
        !property.startsWith('$') &&
        !property.startsWith('_') &&
        typeof member === 'object' &&
        member !== null
      ) {
        return guardDelegate(member);
      }

      return member;
    },
  });
}

type ExtendedPrismaClient = ReturnType<typeof createExtendedPrismaClient>;

const globalForPrisma = globalThis as unknown as { prisma: ExtendedPrismaClient };

export const prisma: ExtendedPrismaClient =
  globalForPrisma.prisma || createExtendedPrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
