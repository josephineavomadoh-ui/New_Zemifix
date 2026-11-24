import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockState = vi.hoisted(() => ({
  extension: undefined as unknown,
  events: [] as string[],
  constructorCalls: 0,
  identity: {
    session_user: 'zemifix_app_user',
    current_user: 'zemifix_app_user',
    current_database: 'zemifix_dev',
    is_superuser: false,
    can_bypass_rls: false,
  },
}));

vi.mock('@prisma/client', () => ({
  PrismaClient: class {
    constructor() {
      mockState.constructorCalls += 1;
    }

    async $queryRaw() {
      mockState.events.push('identity');
      return [mockState.identity];
    }

    $extends(extension: unknown) {
      mockState.extension = extension;
      return this;
    }
  },
}));

interface RuntimeQueryExtension {
  query: {
    $allOperations: (input: {
      args: unknown;
      query: (args: unknown) => Promise<unknown>;
    }) => Promise<unknown>;
  };
}

describe('Runtime database identity guard', () => {
  beforeEach(() => {
    vi.resetModules();
    Reflect.deleteProperty(globalThis, 'prisma');
    mockState.extension = undefined;
    mockState.events.length = 0;
    mockState.constructorCalls = 0;
    mockState.identity = {
      session_user: 'zemifix_app_user',
      current_user: 'zemifix_app_user',
      current_database: 'zemifix_dev',
      is_superuser: false,
      can_bypass_rls: false,
    };
    vi.stubEnv('APP_ENV', 'development');
    vi.stubEnv(
      'APP_DATABASE_URL',
      'postgresql://zemifix_app_user:placeholder@localhost:5432/zemifix_dev'
    );
  });

  afterEach(() => {
    Reflect.deleteProperty(globalThis, 'prisma');
    vi.unstubAllEnvs();
  });

  it('verifies runtime database identity before allowing the first Prisma operation', async () => {
    await import('../lib/prisma');
    const extension = mockState.extension as RuntimeQueryExtension | undefined;
    expect(extension).toBeDefined();

    const query = vi.fn(async () => {
      mockState.events.push('operation');
      return 'allowed';
    });

    await expect(
      extension!.query.$allOperations({ args: {}, query })
    ).resolves.toBe('allowed');

    expect(mockState.events).toEqual(['identity', 'operation']);
    expect(query).toHaveBeenCalledOnce();
  });

  it('fails closed without executing the operation when runtime identity is invalid', async () => {
    mockState.identity.current_database = 'zemifix_acceptance';
    await import('../lib/prisma');
    const extension = mockState.extension as RuntimeQueryExtension | undefined;
    expect(extension).toBeDefined();

    const query = vi.fn(async () => 'must not run');
    await expect(
      extension!.query.$allOperations({ args: {}, query })
    ).rejects.toThrow(/DATABASE_ISOLATION_FATAL/);

    expect(query).not.toHaveBeenCalled();
    expect(mockState.events).toEqual(['identity']);
  });

  it('rejects a protected target before constructing PrismaClient', async () => {
    vi.stubEnv(
      'APP_DATABASE_URL',
      'postgresql://zemifix_app_user:placeholder@localhost:5432/zemifix_acceptance'
    );

    await expect(import('../lib/prisma')).rejects.toThrow(/DATABASE_ISOLATION_FATAL/);
    expect(mockState.constructorCalls).toBe(0);
    expect(mockState.events).toEqual([]);
  });

  it('rejects a malformed target before constructing PrismaClient', async () => {
    vi.stubEnv('APP_DATABASE_URL', 'postgresql://malformed');

    await expect(import('../lib/prisma')).rejects.toThrow(/DATABASE_URL_INVALID/);
    expect(mockState.constructorCalls).toBe(0);
    expect(mockState.events).toEqual([]);
  });
});
