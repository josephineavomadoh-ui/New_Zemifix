import { PrismaClient } from '@prisma/client';
import { getDatabaseNameFromUrl } from '../src/lib/databaseUrl';

const expectedDatabaseByEnvironment: Record<string, string> = {
  development: 'zemifix_dev',
  test: 'zemifix_dev_test',
  staging: 'zemifix_staging',
  production: 'zemifix_prod',
};
const protectedDatabases = new Set(['zemifix_acceptance', 'zemifix_platform_dev']);

function getRequiredEnvironmentValue(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`[SECURITY_CONTEXT_PROVISIONING_CONFIG] ${name} is required.`);
  }
  return value;
}

function getSigningKey(): string {
  const encoded = process.env.APP_CONTEXT_HMAC_SECRET;
  if (!encoded) {
    throw new Error(
      '[SECURITY_CONTEXT_PROVISIONING_CONFIG] APP_CONTEXT_HMAC_SECRET is required.'
    );
  }
  const bytes = Buffer.from(encoded, 'base64');
  if (bytes.length !== 32 || bytes.toString('base64') !== encoded) {
    throw new Error(
      '[SECURITY_CONTEXT_PROVISIONING_CONFIG] APP_CONTEXT_HMAC_SECRET must be canonical base64 for 32 random bytes.'
    );
  }
  return encoded;
}

async function provisionSecurityContextKey(): Promise<void> {
  const appEnv = getRequiredEnvironmentValue('APP_ENV').toLowerCase();
  const expectedDatabase = expectedDatabaseByEnvironment[appEnv];
  if (!expectedDatabase) {
    throw new Error('[SECURITY_CONTEXT_PROVISIONING_CONFIG] APP_ENV is unsupported.');
  }

  const migrationUrl = getRequiredEnvironmentValue('SECURITY_CONTEXT_MIGRATION_URL');
  const migrationRole = getRequiredEnvironmentValue('SECURITY_CONTEXT_MIGRATION_ROLE');
  const databaseName = getDatabaseNameFromUrl(migrationUrl);
  const parsedUrl = new URL(migrationUrl);
  const urlRole = decodeURIComponent(parsedUrl.username);

  if (protectedDatabases.has(databaseName) || databaseName !== expectedDatabase) {
    throw new Error(
      '[SECURITY_CONTEXT_PROVISIONING_TARGET] Migration URL does not target the database required by APP_ENV.'
    );
  }
  if (
    !migrationRole ||
    migrationRole === 'zemifix_app_user' ||
    urlRole !== migrationRole
  ) {
    throw new Error(
      '[SECURITY_CONTEXT_PROVISIONING_ROLE] URL role must match the dedicated migration role and cannot be zemifix_app_user.'
    );
  }

  const encodedKey = getSigningKey();
  const client = new PrismaClient({
    datasources: { db: { url: migrationUrl } },
    log: [],
  });

  try {
    const [identity] = await client.$queryRaw<Array<{
      sessionUser: string;
      currentDatabase: string;
    }>>`
      SELECT session_user::text AS "sessionUser",
             current_database()::text AS "currentDatabase";
    `;

    if (
      !identity ||
      identity.sessionUser !== migrationRole ||
      identity.currentDatabase !== expectedDatabase
    ) {
      throw new Error(
        '[SECURITY_CONTEXT_PROVISIONING_IDENTITY] Connected database role or name differs from the preflight target.'
      );
    }

    const [privileges] = await client.$queryRaw<Array<{
      migrationCanSelect: boolean;
      migrationCanInsert: boolean;
      migrationCanUpdate: boolean;
      appCanSelect: boolean;
      appCanInsert: boolean;
      appCanUpdate: boolean;
      appCanDelete: boolean;
      appCanTruncate: boolean;
      appCanOwnKeyTable: boolean;
      appCanAssumeVerifier: boolean;
    }>>`
      SELECT
        pg_catalog.has_table_privilege(session_user, 'public.security_context_hmac_keys', 'SELECT') AS "migrationCanSelect",
        pg_catalog.has_table_privilege(session_user, 'public.security_context_hmac_keys', 'INSERT') AS "migrationCanInsert",
        pg_catalog.has_table_privilege(session_user, 'public.security_context_hmac_keys', 'UPDATE') AS "migrationCanUpdate",
        pg_catalog.has_table_privilege('zemifix_app_user', 'public.security_context_hmac_keys', 'SELECT') AS "appCanSelect",
        pg_catalog.has_table_privilege('zemifix_app_user', 'public.security_context_hmac_keys', 'INSERT') AS "appCanInsert",
        pg_catalog.has_table_privilege('zemifix_app_user', 'public.security_context_hmac_keys', 'UPDATE') AS "appCanUpdate",
        pg_catalog.has_table_privilege('zemifix_app_user', 'public.security_context_hmac_keys', 'DELETE') AS "appCanDelete",
        pg_catalog.has_table_privilege('zemifix_app_user', 'public.security_context_hmac_keys', 'TRUNCATE') AS "appCanTruncate",
        EXISTS (
          SELECT 1
            FROM pg_catalog.pg_class AS key_table
            JOIN pg_catalog.pg_namespace AS key_schema
              ON key_schema.oid = key_table.relnamespace
           WHERE key_schema.nspname = 'public'
             AND key_table.relname = 'security_context_hmac_keys'
             AND pg_catalog.pg_has_role(
               'zemifix_app_user',
               key_table.relowner,
               'MEMBER'
             )
        ) AS "appCanOwnKeyTable",
        pg_catalog.pg_has_role('zemifix_app_user', 'zemifix_context_verifier', 'MEMBER') AS "appCanAssumeVerifier";
    `;

    if (
      !privileges ||
      !privileges.migrationCanSelect ||
      !privileges.migrationCanInsert ||
      !privileges.migrationCanUpdate
    ) {
      throw new Error(
        '[SECURITY_CONTEXT_PROVISIONING_PRIVILEGE] Migration role lacks key-table SELECT, INSERT, or UPDATE privileges.'
      );
    }
    if (
      privileges.appCanSelect ||
      privileges.appCanInsert ||
      privileges.appCanUpdate ||
      privileges.appCanDelete ||
      privileges.appCanTruncate ||
      privileges.appCanOwnKeyTable ||
      privileges.appCanAssumeVerifier
    ) {
      throw new Error(
        '[SECURITY_CONTEXT_PROVISIONING_PRIVILEGE] Application role can access the key table or assume the verifier role.'
      );
    }

    const affectedRows = await client.$executeRaw`
      INSERT INTO public.security_context_hmac_keys (id, key_bytes)
      VALUES (1, pg_catalog.decode(${encodedKey}, 'base64'))
      ON CONFLICT (id) DO UPDATE
        SET key_bytes = EXCLUDED.key_bytes;
    `;

    if (affectedRows !== 1) {
      throw new Error(
        '[SECURITY_CONTEXT_PROVISIONING_FAILED] Expected exactly one key row to be inserted or updated.'
      );
    }
  } finally {
    await client.$disconnect();
  }
}

provisionSecurityContextKey().catch((error: unknown) => {
  const message =
    error instanceof Error
      ? error.message.match(/^\[([A-Z0-9_]+)\]/)?.[1]
      : undefined;
  const databaseCode =
    typeof error === 'object' && error !== null && 'code' in error &&
    typeof error.code === 'string'
      ? error.code
      : undefined;
  const code = message ?? databaseCode ?? 'PROVISIONING_ABORTED';
  console.error(
    `[SECURITY_CONTEXT_PROVISIONING_FAILED] ${code}. Credentials and secret values were not logged.`
  );
  process.exitCode = 1;
});
