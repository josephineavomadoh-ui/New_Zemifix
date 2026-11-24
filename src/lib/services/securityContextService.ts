import { createHmac } from 'crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import { prisma } from '../prisma';
import {
  getActiveSecurityTransaction,
  runWithSecurityTransaction,
} from '../securityTransactionScope';

export type SecurityAccessScope = 'Company' | 'BranchAndBelow' | 'Branch' | 'Department' | 'Own';
export type SecurityRealm = 'STAFF' | 'CUSTOMER' | 'WORKER' | 'PUBLIC_QR' | 'AUTH';

export interface SecurityContextInput {
  userId?: string | null;
  branchId?: string | null;
  branchPath?: string | null;
  departmentId?: string | null;
  accessScope?: SecurityAccessScope | null;
  realm?: SecurityRealm | null;
  customerId?: string | null;
  taskId?: string | null;
  taskType?: string | null;
  companyId?: string | null;
}

export interface SecurityContext {
  readonly userId: string;
  readonly branchId: string;
  readonly branchPath: string;
  readonly departmentId: string;
  readonly accessScope: SecurityAccessScope;
  readonly realm: SecurityRealm;
  readonly customerId: string;
  readonly taskId: string;
  readonly taskType: string;
  readonly companyId: string;
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const accessScopes = new Set<SecurityAccessScope>([
  'Company',
  'BranchAndBelow',
  'Branch',
  'Department',
  'Own',
]);
const realms = new Set<SecurityRealm>([
  'STAFF',
  'CUSTOMER',
  'WORKER',
  'PUBLIC_QR',
  'AUTH',
]);

const contextFields = [
  'userId',
  'branchId',
  'branchPath',
  'departmentId',
  'accessScope',
  'realm',
  'customerId',
  'taskId',
  'taskType',
  'companyId',
] as const;

const transactionContextStore = Object.freeze(
  new WeakMap<Prisma.TransactionClient, SecurityContext>()
);

type TransactionHost = PrismaClient;
type SecurityContextCallback<T> = (tx: Prisma.TransactionClient) => Promise<T>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeText(value: unknown, field: string, maximumLength: number): string {
  if (value === undefined || value === null || value === '') return '';
  if (
    typeof value !== 'string' ||
    value.length > maximumLength ||
    value.includes('\0')
  ) {
    throw new Error(`[SECURITY_CONTEXT_INVALID] Invalid ${field}.`);
  }
  return value;
}

function normalizeUuid(value: unknown, field: string): string {
  const normalized = normalizeText(value, field, 36);
  if (normalized !== '' && !uuidPattern.test(normalized)) {
    throw new Error(`[SECURITY_CONTEXT_INVALID] ${field} must be a UUID or empty.`);
  }
  return normalized.toLowerCase();
}

function createSecurityContext(input: SecurityContextInput): SecurityContext {
  if (!isRecord(input)) {
    throw new Error('[SECURITY_CONTEXT_INVALID] A context object is required.');
  }

  const accessScope = input.accessScope ?? 'Own';
  if (typeof accessScope !== 'string' || !accessScopes.has(accessScope as SecurityAccessScope)) {
    throw new Error('[SECURITY_CONTEXT_INVALID] Invalid accessScope.');
  }

  const realm = input.realm ?? 'STAFF';
  if (typeof realm !== 'string' || !realms.has(realm as SecurityRealm)) {
    throw new Error('[SECURITY_CONTEXT_INVALID] Invalid realm.');
  }

  const context = Object.freeze({
    userId: normalizeUuid(input.userId, 'userId'),
    branchId: normalizeUuid(input.branchId, 'branchId'),
    branchPath: normalizeText(input.branchPath, 'branchPath', 2048),
    departmentId: normalizeUuid(input.departmentId, 'departmentId'),
    accessScope: accessScope as SecurityAccessScope,
    realm: realm as SecurityRealm,
    customerId: normalizeUuid(input.customerId, 'customerId'),
    taskId: normalizeUuid(input.taskId, 'taskId'),
    taskType: normalizeText(input.taskType, 'taskType', 128),
    companyId: normalizeUuid(input.companyId, 'companyId'),
  });

  if (
    !context.userId &&
    context.realm !== 'WORKER' &&
    context.realm !== 'PUBLIC_QR' &&
    context.realm !== 'AUTH'
  ) {
    throw new Error(
      'SECURITY_CONTEXT_MISSING: Authenticated user context is required for this realm.'
    );
  }

  return context;
}

function contextsEqual(left: SecurityContext, right: SecurityContext): boolean {
  return contextFields.every((field) => left[field] === right[field]);
}

interface TransactionIdentity {
  backendPid: string;
  transactionId: string;
  sessionUser: string;
  currentDatabase: string;
}

function getContextSigningKey(): Buffer {
  const encodedKey = process.env.APP_CONTEXT_HMAC_SECRET;
  if (!encodedKey) {
    throw new Error(
      '[SECURITY_CONTEXT_KEY_MISSING] APP_CONTEXT_HMAC_SECRET must be configured.'
    );
  }

  const key = Buffer.from(encodedKey, 'base64');
  if (key.length !== 32 || key.toString('base64') !== encodedKey) {
    throw new Error(
      '[SECURITY_CONTEXT_KEY_INVALID] APP_CONTEXT_HMAC_SECRET must be canonical base64 for 32 random bytes.'
    );
  }
  return key;
}

function createContextSignature(
  context: SecurityContext,
  identity: TransactionIdentity,
  key: Buffer
): string {
  const values = [
    identity.sessionUser,
    identity.currentDatabase,
    identity.backendPid,
    identity.transactionId,
    context.userId,
    context.branchId,
    context.branchPath,
    context.departmentId,
    context.accessScope,
    context.realm,
    context.customerId,
    context.taskId,
    context.taskType,
    context.companyId,
  ];
  const payload = `ZEMIFIX_CONTEXT_V1${values
    .map((value) => `${Buffer.byteLength(value, 'utf8')}:${value}`)
    .join('')}`;
  return createHmac('sha256', key).update(payload, 'utf8').digest('hex');
}

function isTransactionHost(value: unknown): value is TransactionHost {
  return isRecord(value) && typeof value.$transaction === 'function';
}

function isTransactionClient(value: unknown): value is Prisma.TransactionClient {
  return isRecord(value) && typeof value.$queryRaw === 'function';
}

async function setTransactionSecurityContextInternal(
  tx: Prisma.TransactionClient,
  context: SecurityContext,
  key: Buffer
): Promise<void> {
  if (transactionContextStore.has(tx)) {
    const activeContext = transactionContextStore.get(tx);
    if (activeContext && !contextsEqual(activeContext, context)) {
      throw new Error(
        'SECURITY_CONTEXT_CONFLICT: Attempted to replace an established transaction context.'
      );
    }
    throw new Error(
      'SECURITY_CONTEXT_ALREADY_INITIALIZED: Transaction context can only be established once.'
    );
  }

  const [identity] = await tx.$queryRaw<TransactionIdentity[]>`
    SELECT
      pg_backend_pid()::text as "backendPid",
      pg_current_xact_id()::text as "transactionId",
      session_user::text as "sessionUser",
      current_database()::text as "currentDatabase";
  `;
  if (
    !identity ||
    !/^[1-9][0-9]*$/.test(identity.backendPid) ||
    !/^[0-9]+$/.test(identity.transactionId) ||
    !identity.sessionUser ||
    !identity.currentDatabase
  ) {
    throw new Error(
      '[SECURITY_CONTEXT_IDENTITY_UNAVAILABLE] Could not bind the context to the active database transaction.'
    );
  }

  const signature = createContextSignature(context, identity, key);

  await tx.$queryRaw`
    SELECT
      set_config('app.current_user_id', ${context.userId}, true),
      set_config('app.current_branch_id', ${context.branchId}, true),
      set_config('app.current_branch_path', ${context.branchPath}, true),
      set_config('app.current_department_id', ${context.departmentId}, true),
      set_config('app.current_access_scope', ${context.accessScope}, true),
      set_config('app.current_realm', ${context.realm}, true),
      set_config('app.current_customer_id', ${context.customerId}, true),
      set_config('app.current_task_id', ${context.taskId}, true),
      set_config('app.current_task_type', ${context.taskType}, true),
      set_config('app.current_company_id', ${context.companyId}, true),
      set_config('app.context_signature', ${signature}, true);
  `;

  transactionContextStore.set(tx, context);
}

export function withSecurityContext<T>(
  context: SecurityContextInput,
  callback: SecurityContextCallback<T>,
  existingTx?: Prisma.TransactionClient
): Promise<T>;
export function withSecurityContext<T>(
  client: TransactionHost,
  context: SecurityContextInput,
  callback: SecurityContextCallback<T>,
  existingTx?: Prisma.TransactionClient
): Promise<T>;
export async function withSecurityContext<T>(
  clientOrContext: TransactionHost | SecurityContextInput,
  contextOrCallback: SecurityContextInput | SecurityContextCallback<T>,
  callbackOrTransaction?: SecurityContextCallback<T> | Prisma.TransactionClient,
  maybeExistingTx?: Prisma.TransactionClient
): Promise<T> {
  let client: TransactionHost = prisma as unknown as PrismaClient;
  let input: SecurityContextInput;
  let callback: SecurityContextCallback<T>;
  let existingTx: Prisma.TransactionClient | undefined;
  let explicitClient = false;

  if (isTransactionHost(clientOrContext)) {
    if (!isRecord(contextOrCallback) || typeof callbackOrTransaction !== 'function') {
      throw new Error('[SECURITY_CONTEXT_INVALID] Invalid withSecurityContext arguments.');
    }
    client = clientOrContext;
    explicitClient = true;
    input = contextOrCallback as SecurityContextInput;
    callback = callbackOrTransaction;
    existingTx = maybeExistingTx;
  } else {
    if (typeof contextOrCallback !== 'function') {
      throw new Error('[SECURITY_CONTEXT_INVALID] A transaction callback is required.');
    }
    input = clientOrContext;
    callback = contextOrCallback;
    if (callbackOrTransaction !== undefined) {
      if (!isTransactionClient(callbackOrTransaction)) {
        throw new Error('[SECURITY_CONTEXT_INVALID] Invalid existing transaction client.');
      }
      existingTx = callbackOrTransaction;
    }
  }

  const context = createSecurityContext(input);
  const activeTransaction = getActiveSecurityTransaction();

  if (activeTransaction) {
    if (
      (existingTx && existingTx !== activeTransaction.transactionClient) ||
      (explicitClient && client !== activeTransaction.transactionHost)
    ) {
      throw new Error(
        'SECURITY_TRANSACTION_SWITCH: Nested call attempted to use a different transaction.'
      );
    }

    const establishedContext = transactionContextStore.get(
      activeTransaction.transactionClient
    );
    if (!establishedContext) {
      throw new Error(
        'UNINITIALIZED_TRANSACTION_CONTEXT: Active transaction has no security context.'
      );
    }
    if (!contextsEqual(establishedContext, context)) {
      throw new Error(
        'SECURITY_CONTEXT_CONFLICT: Nested call attempted to change the established transaction context.'
      );
    }
    return callback(activeTransaction.transactionClient);
  }

  if (existingTx) {
    throw new Error(
      'UNINITIALIZED_TRANSACTION_CONTEXT: Existing transaction is not the active security transaction.'
    );
  }

  const key = getContextSigningKey();
  return client.$transaction(
    async (tx) => {
      try {
        await setTransactionSecurityContextInternal(tx, context, key);
        return await runWithSecurityTransaction(tx, client, () => callback(tx));
      } finally {
        transactionContextStore.delete(tx);
      }
    },
    {
      timeout: 15000,
      isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
    }
  );
}

export async function getTransactionSecurityContext(
  tx: Prisma.TransactionClient
): Promise<SecurityContext> {
  const establishedContext = transactionContextStore.get(tx);
  if (!establishedContext) {
    throw new Error(
      'UNINITIALIZED_TRANSACTION_CONTEXT: Transaction context has not been established.'
    );
  }

  const [result] = await tx.$queryRaw<Array<{
    userId: string;
    branchId: string;
    branchPath: string;
    departmentId: string;
    accessScope: SecurityAccessScope;
    realm: SecurityRealm;
    customerId: string;
    taskId: string;
    taskType: string;
    companyId: string;
    signatureValid: boolean;
  }>>`
    SELECT
      current_setting('app.current_user_id', true) as "userId",
      current_setting('app.current_branch_id', true) as "branchId",
      current_setting('app.current_branch_path', true) as "branchPath",
      current_setting('app.current_department_id', true) as "departmentId",
      current_setting('app.current_access_scope', true) as "accessScope",
      current_setting('app.current_realm', true) as "realm",
      current_setting('app.current_customer_id', true) as "customerId",
      current_setting('app.current_task_id', true) as "taskId",
      current_setting('app.current_task_type', true) as "taskType",
      current_setting('app.current_company_id', true) as "companyId",
      public.app_security_context_valid() as "signatureValid";
  `;

  if (!result) {
    throw new Error('[SECURITY_CONTEXT_UNAVAILABLE] Failed to read transaction context.');
  }
  if (!result.signatureValid) {
    throw new Error(
      '[SECURITY_CONTEXT_SIGNATURE_INVALID] Database transaction context signature is invalid.'
    );
  }

  const observedContext = createSecurityContext(result);
  if (!contextsEqual(establishedContext, observedContext)) {
    throw new Error(
      'SECURITY_CONTEXT_CONFLICT: Transaction GUC values differ from the established context.'
    );
  }

  return Object.freeze({ ...observedContext });
}
