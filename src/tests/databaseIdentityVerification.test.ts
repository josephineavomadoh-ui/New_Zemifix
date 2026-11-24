import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getDatabaseNameFromUrl,
  selectRuntimeDatabaseUrl,
  verifyRuntimeDatabaseAttributes,
  getEffectiveAppEnv,
} from '@/src/lib/prisma';

vi.hoisted(() => {
  process.env.APP_ENV = 'test';
  process.env.TEST_DATABASE_URL =
    'postgresql://zemifix_app_user_test:placeholder@localhost:5432/zemifix_dev_test';
});

describe('Stage 1 Final Correction: Environment Identification & Safeguards (F1.2.1)', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('1. Explicit Environment Resolution (getEffectiveAppEnv)', () => {
    it('1.1 Resolves APP_ENV explicitly when valid (development|test|staging|production)', () => {
      process.env.APP_ENV = 'staging';
      process.env = { ...process.env, NODE_ENV: 'production' }; // Common in Next.js builds

      expect(getEffectiveAppEnv()).toBe('staging');

      process.env.APP_ENV = 'production';
      expect(getEffectiveAppEnv()).toBe('production');
    });

    it('1.2 FAILS CLOSED if APP_ENV is missing when NODE_ENV is production', () => {
      delete process.env.APP_ENV;
      process.env = { ...process.env, NODE_ENV: 'production' };

      expect(() => getEffectiveAppEnv()).toThrowError(
        /DATABASE_CONTRACT_VIOLATION.*Production and staging environments require explicit APP_ENV/i
      );
    });

    it('1.3 Allows development fallback if APP_ENV is missing and NODE_ENV=development', () => {
      delete process.env.APP_ENV;
      process.env = { ...process.env, NODE_ENV: 'development' };

      expect(getEffectiveAppEnv()).toBe('development');
    });

    it('1.4 Allows test fallback if APP_ENV is missing and NODE_ENV=test', () => {
      delete process.env.APP_ENV;
      process.env = { ...process.env, NODE_ENV: 'test' };

      expect(getEffectiveAppEnv()).toBe('test');
    });

    it('1.5 FAILS CLOSED if APP_ENV and NODE_ENV are missing', () => {
      delete process.env.APP_ENV;
      Reflect.deleteProperty(process.env, 'NODE_ENV');

      expect(() => getEffectiveAppEnv()).toThrowError(
        /DATABASE_CONTRACT_VIOLATION.*APP_ENV is required when NODE_ENV is missing or unsupported/
      );
    });

    it('1.6 FAILS CLOSED if APP_ENV is missing and NODE_ENV is unsupported', () => {
      delete process.env.APP_ENV;
      process.env = { ...process.env };
      Reflect.set(process.env, 'NODE_ENV', 'staging');

      expect(() => getEffectiveAppEnv()).toThrowError(
        /DATABASE_CONTRACT_VIOLATION.*APP_ENV is required when NODE_ENV is missing or unsupported/
      );
    });

    it('1.7 REJECTS empty string APP_ENV=""', () => {
      process.env.APP_ENV = '';
      process.env = { ...process.env, NODE_ENV: 'development' };

      expect(() => getEffectiveAppEnv()).toThrowError(
        /DATABASE_CONTRACT_VIOLATION.*Empty or whitespace-only APP_ENV is prohibited/i
      );
    });

    it('1.8 REJECTS whitespace-only APP_ENV="   "', () => {
      process.env.APP_ENV = '   ';
      process.env = { ...process.env, NODE_ENV: 'development' };

      expect(() => getEffectiveAppEnv()).toThrowError(
        /DATABASE_CONTRACT_VIOLATION.*Empty or whitespace-only APP_ENV is prohibited/i
      );
    });

    it('1.9 REJECTS invalid APP_ENV string (e.g. "staging_invalid")', () => {
      process.env.APP_ENV = 'staging_invalid';

      expect(() => getEffectiveAppEnv()).toThrowError(
        /DATABASE_CONTRACT_VIOLATION.*Invalid or unsupported APP_ENV "staging_invalid"/i
      );
    });
  });

  describe('2. Runtime Database URL Selection & Prevention of Unsafe Fallback', () => {
    it('2.1 Prefers APP_DATABASE_URL when set in environment', () => {
      process.env.APP_ENV = 'development';
      process.env.APP_DATABASE_URL = 'postgresql://zemifix_app_user:pass@localhost:5432/zemifix_dev';
      process.env.DATABASE_URL = 'postgresql://postgres:pass@localhost:5432/zemifix_dev';

      const url = selectRuntimeDatabaseUrl();
      expect(url).toBe('postgresql://zemifix_app_user:pass@localhost:5432/zemifix_dev');
    });

    it('2.2 Fails closed in production if APP_DATABASE_URL is missing', () => {
      delete process.env.APP_DATABASE_URL;
      process.env.DATABASE_URL = 'postgresql://postgres:pass@localhost:5432/zemifix_prod';
      process.env.APP_ENV = 'production';

      expect(() => selectRuntimeDatabaseUrl()).toThrowError(/DATABASE_SECURITY_FATAL.*APP_DATABASE_URL/i);
    });

    it('2.3 Fails closed in staging if APP_DATABASE_URL is missing', () => {
      delete process.env.APP_DATABASE_URL;
      process.env.DATABASE_URL = 'postgresql://postgres:pass@localhost:5432/zemifix_staging';
      process.env.APP_ENV = 'staging';

      expect(() => selectRuntimeDatabaseUrl()).toThrowError(/DATABASE_SECURITY_FATAL.*APP_DATABASE_URL/i);
    });

    it('2.4 Allows fallback to DATABASE_URL in development mode if APP_DATABASE_URL is missing', () => {
      delete process.env.APP_DATABASE_URL;
      process.env.DATABASE_URL = 'postgresql://zemifix_app_user:pass@localhost:5432/zemifix_dev';
      process.env.APP_ENV = 'development';

      const url = selectRuntimeDatabaseUrl();
      expect(url).toBe('postgresql://zemifix_app_user:pass@localhost:5432/zemifix_dev');
    });

    it('2.5 Uses TEST_DATABASE_URL in test mode when provided', () => {
      process.env.TEST_DATABASE_URL = 'postgresql://zemifix_app_user_test:pass@localhost:5432/zemifix_dev_test';
      process.env.APP_DATABASE_URL = 'postgresql://zemifix_app_user:pass@localhost:5432/zemifix_dev';
      process.env.APP_ENV = 'test';

      const url = selectRuntimeDatabaseUrl();
      expect(url).toBe('postgresql://zemifix_app_user_test:pass@localhost:5432/zemifix_dev_test');
    });

    it('2.6 Rejects a protected database target before Prisma can be constructed', () => {
      process.env.APP_ENV = 'development';
      process.env.APP_DATABASE_URL =
        'postgresql://zemifix_app_user:pass@localhost:5432/zemifix_acceptance';

      expect(() => selectRuntimeDatabaseUrl()).toThrowError(
        /DATABASE_ISOLATION_FATAL.*zemifix_acceptance/
      );
    });

    it('2.7 Rejects malformed database URLs without exposing the URL', () => {
      process.env.APP_ENV = 'development';
      delete process.env.APP_DATABASE_URL;
      process.env.DATABASE_URL = 'postgresql://not a valid URL';

      try {
        selectRuntimeDatabaseUrl();
        throw new Error('Expected malformed URL to be rejected.');
      } catch (error) {
        expect((error as Error).message).toMatch(/DATABASE_URL_INVALID/);
        expect((error as Error).message).not.toContain('not a valid URL');
      }
    });

    it('2.8 Rejects ambiguous database URL targets and encoded path separators', () => {
      expect(() =>
        getDatabaseNameFromUrl(
          'postgresql://user:pass@localhost:5432/zemifix_dev?host=other-host'
        )
      ).toThrowError(/DATABASE_URL_INVALID/);
      expect(() =>
        getDatabaseNameFromUrl(
          'postgresql://user:pass@localhost:5432/zemifix_dev%2Fzemifix_acceptance'
        )
      ).toThrowError(/DATABASE_URL_INVALID/);
      expect(() =>
        getDatabaseNameFromUrl(
          'postgresql://user:pass@localhost:5432/zemifix_dev?service=alternate'
        )
      ).toThrowError(/DATABASE_URL_INVALID/);
    });
  });

  describe('3. Exact Runtime Database Identity & Attribute Assertions', () => {
    it('3.1 Verifies valid development session_user and database contract', async () => {
      process.env.APP_ENV = 'development';

      const mockClient = {
        $queryRaw: vi.fn().mockResolvedValue([
          {
            session_user: 'zemifix_app_user',
            current_user: 'zemifix_app_user',
            current_database: 'zemifix_dev',
            is_superuser: false,
            can_bypass_rls: false,
          },
        ]),
      };

      const result = await verifyRuntimeDatabaseAttributes(mockClient);
      expect(result.session_user).toBe('zemifix_app_user');
      expect(result.current_database).toBe('zemifix_dev');
      expect(result.effectiveAppEnv).toBe('development');
      expect(result.is_superuser).toBe(false);
      expect(result.can_bypass_rls).toBe(false);
    });

    it('3.2 Verifies valid test session_user and database contract', async () => {
      process.env.APP_ENV = 'test';

      const mockClient = {
        $queryRaw: vi.fn().mockResolvedValue([
          {
            session_user: 'zemifix_app_user_test',
            current_user: 'zemifix_app_user_test',
            current_database: 'zemifix_dev_test',
            is_superuser: false,
            can_bypass_rls: false,
          },
        ]),
      };

      const result = await verifyRuntimeDatabaseAttributes(mockClient);
      expect(result.session_user).toBe('zemifix_app_user_test');
      expect(result.current_database).toBe('zemifix_dev_test');
      expect(result.effectiveAppEnv).toBe('test');
    });

    it('3.3 Verifies valid staging session_user and database contract', async () => {
      process.env.APP_ENV = 'staging';

      const mockClient = {
        $queryRaw: vi.fn().mockResolvedValue([
          {
            session_user: 'zemifix_app_user',
            current_user: 'zemifix_app_user',
            current_database: 'zemifix_staging',
            is_superuser: false,
            can_bypass_rls: false,
          },
        ]),
      };

      const result = await verifyRuntimeDatabaseAttributes(mockClient);
      expect(result.session_user).toBe('zemifix_app_user');
      expect(result.current_database).toBe('zemifix_staging');
      expect(result.effectiveAppEnv).toBe('staging');
    });

    it('3.4 Verifies valid production session_user and database contract', async () => {
      process.env.APP_ENV = 'production';

      const mockClient = {
        $queryRaw: vi.fn().mockResolvedValue([
          {
            session_user: 'zemifix_app_user',
            current_user: 'zemifix_app_user',
            current_database: 'zemifix_prod',
            is_superuser: false,
            can_bypass_rls: false,
          },
        ]),
      };

      const result = await verifyRuntimeDatabaseAttributes(mockClient);
      expect(result.session_user).toBe('zemifix_app_user');
      expect(result.current_database).toBe('zemifix_prod');
      expect(result.effectiveAppEnv).toBe('production');
    });

    it('3.5 Rejects staging connecting to production database (zemifix_prod)', async () => {
      process.env.APP_ENV = 'staging';

      const mockClient = {
        $queryRaw: vi.fn().mockResolvedValue([
          {
            session_user: 'zemifix_app_user',
            current_user: 'zemifix_app_user',
            current_database: 'zemifix_prod', // Mismatch for staging
            is_superuser: false,
            can_bypass_rls: false,
          },
        ]),
      };

      await expect(verifyRuntimeDatabaseAttributes(mockClient)).rejects.toThrowError(
        /DATABASE_CONTRACT_VIOLATION.*Staging environment contract mismatch/i
      );
    });

    it('3.6 Rejects production connecting to staging database (zemifix_staging)', async () => {
      process.env.APP_ENV = 'production';

      const mockClient = {
        $queryRaw: vi.fn().mockResolvedValue([
          {
            session_user: 'zemifix_app_user',
            current_user: 'zemifix_app_user',
            current_database: 'zemifix_staging', // Mismatch for production
            is_superuser: false,
            can_bypass_rls: false,
          },
        ]),
      };

      await expect(verifyRuntimeDatabaseAttributes(mockClient)).rejects.toThrowError(
        /DATABASE_CONTRACT_VIOLATION.*Production environment contract mismatch/i
      );
    });

    it('3.7 Rejects development connecting to test database (zemifix_dev_test)', async () => {
      process.env.APP_ENV = 'development';

      const mockClient = {
        $queryRaw: vi.fn().mockResolvedValue([
          {
            session_user: 'zemifix_app_user',
            current_user: 'zemifix_app_user',
            current_database: 'zemifix_dev_test',
            is_superuser: false,
            can_bypass_rls: false,
          },
        ]),
      };

      await expect(verifyRuntimeDatabaseAttributes(mockClient)).rejects.toThrowError(
        /DATABASE_CONTRACT_VIOLATION.*Development environment contract mismatch/i
      );
    });

    it('3.8 Rejects test connecting to development database (zemifix_dev)', async () => {
      process.env.APP_ENV = 'test';

      const mockClient = {
        $queryRaw: vi.fn().mockResolvedValue([
          {
            session_user: 'zemifix_app_user_test',
            current_user: 'zemifix_app_user_test',
            current_database: 'zemifix_dev',
            is_superuser: false,
            can_bypass_rls: false,
          },
        ]),
      };

      await expect(verifyRuntimeDatabaseAttributes(mockClient)).rejects.toThrowError(
        /DATABASE_CONTRACT_VIOLATION.*Test environment contract mismatch/i
      );
    });

    it('3.9 Rejects superuser connection (is_superuser = true)', async () => {
      process.env.APP_ENV = 'development';

      const mockClient = {
        $queryRaw: vi.fn().mockResolvedValue([
          {
            session_user: 'postgres',
            current_user: 'postgres',
            current_database: 'zemifix_dev',
            is_superuser: true,
            can_bypass_rls: true,
          },
        ]),
      };

      await expect(verifyRuntimeDatabaseAttributes(mockClient)).rejects.toThrowError(
        /DATABASE_SECURITY_FATAL.*SUPERUSER/i
      );
    });

    it('3.10 Rejects role possessing BYPASSRLS privileges (can_bypass_rls = true)', async () => {
      process.env.APP_ENV = 'development';

      const mockClient = {
        $queryRaw: vi.fn().mockResolvedValue([
          {
            session_user: 'custom_admin_role',
            current_user: 'custom_admin_role',
            current_database: 'zemifix_dev',
            is_superuser: false,
            can_bypass_rls: true,
          },
        ]),
      };

      await expect(verifyRuntimeDatabaseAttributes(mockClient)).rejects.toThrowError(
        /DATABASE_SECURITY_FATAL.*BYPASSRLS/i
      );
    });

    it('Rejects an active current_user different from session_user', async () => {
      process.env.APP_ENV = 'development';

      const mockClient = {
        $queryRaw: vi.fn().mockResolvedValue([
          {
            session_user: 'zemifix_app_user',
            current_user: 'elevated_role',
            current_database: 'zemifix_dev',
            is_superuser: false,
            can_bypass_rls: false,
          },
        ]),
      };

      await expect(verifyRuntimeDatabaseAttributes(mockClient)).rejects.toThrowError(
        /DATABASE_SECURITY_FATAL.*role switching is prohibited/i
      );
    });

    it('3.11 HARD ISOLATION GUARD: Rejects connections to protected database zemifix_acceptance', async () => {
      process.env.APP_ENV = 'development';

      const mockClient = {
        $queryRaw: vi.fn().mockResolvedValue([
          {
            session_user: 'zemifix_app_user',
            current_user: 'zemifix_app_user',
            current_database: 'zemifix_acceptance',
            is_superuser: false,
            can_bypass_rls: false,
          },
        ]),
      };

      await expect(verifyRuntimeDatabaseAttributes(mockClient)).rejects.toThrowError(
        /DATABASE_ISOLATION_FATAL.*zemifix_acceptance/i
      );
    });

    it('3.12 HARD ISOLATION GUARD: Rejects connections to protected database zemifix_platform_dev', async () => {
      process.env.APP_ENV = 'development';

      const mockClient = {
        $queryRaw: vi.fn().mockResolvedValue([
          {
            session_user: 'zemifix_app_user',
            current_user: 'zemifix_app_user',
            current_database: 'zemifix_platform_dev',
            is_superuser: false,
            can_bypass_rls: false,
          },
        ]),
      };

      await expect(verifyRuntimeDatabaseAttributes(mockClient)).rejects.toThrowError(
        /DATABASE_ISOLATION_FATAL.*zemifix_platform_dev/i
      );
    });
  });
});
