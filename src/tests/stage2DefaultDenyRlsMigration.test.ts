import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';

const migrationPath = resolve(
  process.cwd(),
  'prisma',
  'migrations',
  '20261119000002_stage2_1_default_deny_rls',
  'migration.sql'
);
const migration = readFileSync(migrationPath, 'utf8');
const signedContextMigration = readFileSync(
  resolve(
    process.cwd(),
    'prisma',
    'migrations',
    '20261119000001_stage2_1_signed_security_context',
    'migration.sql'
  ),
  'utf8'
);
const schema = readFileSync(resolve(process.cwd(), 'prisma', 'schema.prisma'), 'utf8');

describe('Stage 2.1 default-deny RLS migration contract', () => {
  it('enables forced RLS and signed-context gating for every Prisma model table', () => {
    const schemaTables = Array.from(schema.matchAll(/@@map\("([^"]+)"\)/g), (match) => match[1])
      .sort();
    const tableList = migration.match(/v_tables TEXT\[\] := ARRAY\[([\s\S]*?)\];/)?.[1] ?? '';
    const configuredTables = Array.from(
      tableList.matchAll(/^\s*'([a-z0-9_]+)',?\s*$/gm),
      (match) => match[1]
    ).sort();

    expect(configuredTables).toEqual(schemaTables);
    expect(migration).toContain('ENABLE ROW LEVEL SECURITY');
    expect(migration).toContain('FORCE ROW LEVEL SECURITY');
    expect(migration).toContain('AS RESTRICTIVE FOR ALL TO zemifix_app_user');
    expect(migration).toContain('USING (public.app_security_context_valid())');
    expect(migration).toContain('WITH CHECK (public.app_security_context_valid())');
  });

  it('does not reintroduce broad STAFF policies for customer or financial records', () => {
    expect(migration).toMatch(
      /CREATE POLICY customers_rls_policy ON public\.customers\s+FOR ALL[\s\S]*?app_realm\(\) = 'STAFF'[\s\S]*?app_access_scope\(\) = 'Company'/
    );
    expect(migration).toMatch(
      /CREATE POLICY invoices_rls_policy ON public\.invoices\s+FOR ALL[\s\S]*?app_realm\(\) = 'STAFF'[\s\S]*?app_access_scope\(\) = 'Company'/
    );
    expect(migration).toMatch(
      /CREATE POLICY quotes_rls_policy ON public\.quotes\s+FOR ALL[\s\S]*?app_realm\(\) = 'STAFF'[\s\S]*?app_access_scope\(\) = 'Company'/
    );
    expect(migration).not.toMatch(/app_realm\(\) = 'STAFF'\s+OR/);
  });

  it('limits customer access on financial and operational tables to SELECT policies', () => {
    expect(migration).toMatch(
      /CREATE POLICY work_orders_customer_read ON public\.work_orders\s+FOR SELECT/
    );
    expect(migration).toMatch(
      /CREATE POLICY assets_customer_read ON public\.assets\s+FOR SELECT/
    );
    expect(migration).toMatch(
      /CREATE POLICY invoices_customer_read ON public\.invoices\s+FOR SELECT/
    );
    expect(migration).toMatch(
      /CREATE POLICY quotes_customer_read ON public\.quotes\s+FOR SELECT/
    );
    expect(migration).toMatch(
      /CREATE POLICY customers_customer_read ON public\.customers\s+FOR SELECT/
    );
    expect(migration).toMatch(
      /CREATE POLICY customer_sites_customer_read ON public\.customer_sites\s+FOR SELECT/
    );
  });

  it('keeps the signing key private and the verifier role unprivileged', () => {
    expect(signedContextMigration).toContain(
      'REVOKE ALL ON TABLE public.security_context_hmac_keys FROM zemifix_app_user'
    );
    expect(signedContextMigration).toContain(
      'GRANT SELECT ON TABLE public.security_context_hmac_keys TO zemifix_context_verifier'
    );
    expect(signedContextMigration).toContain('NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS NOINHERIT');
    expect(signedContextMigration).toContain(
      'must not be able to assume a superuser or BYPASSRLS role.'
    );
    expect(signedContextMigration).toMatch(
      /SECURITY DEFINER\s+SET search_path = pg_catalog, public/
    );
  });
});
