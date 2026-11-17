import { prisma } from '../prisma';

export interface SecurityContextInput {
  userId?: string | null;
  branchId?: string | null;
  branchPath?: string | null;
  departmentId?: string | null;
  accessScope?: 'Company' | 'BranchAndBelow' | 'Branch' | 'Department' | 'Own' | string;
  realm?: 'STAFF' | 'CUSTOMER' | 'WORKER';
  customerId?: string | null;
}

/**
 * Sets transaction-scoped PostgreSQL custom configuration variables (`set_config(..., true)`).
 * The third parameter `is_local = true` guarantees the variables reset automatically upon transaction commit/rollback,
 * preventing security context bleeding across pooled connections.
 */
export async function setTransactionSecurityContext(
  tx: any,
  context: SecurityContextInput
): Promise<void> {
  if (!context || (!context.userId && context.realm !== 'WORKER')) {
    throw new Error('SECURITY_CONTEXT_MISSING: Cannot execute protected operation without authenticated user context.');
  }

  const userId = context.userId ?? '00000000-0000-0000-0000-000000000000';
  const branchId = context.branchId ?? '';
  const branchPath = context.branchPath ?? '';
  const departmentId = context.departmentId ?? '';
  const accessScope = context.accessScope ?? 'Own';
  const realm = context.realm ?? 'STAFF';
  const customerId = context.customerId ?? '';

  // Execute set_config with is_local = true (transaction scoped)
  await tx.$executeRaw`
    SELECT
      set_config('app.current_user_id', ${userId}, true),
      set_config('app.current_branch_id', ${branchId}, true),
      set_config('app.current_branch_path', ${branchPath}, true),
      set_config('app.current_department_id', ${departmentId}, true),
      set_config('app.current_access_scope', ${accessScope}, true),
      set_config('app.current_realm', ${realm}, true),
      set_config('app.current_customer_id', ${customerId}, true);
  `;
}

/**
 * Executes a transactional database callback with transaction-scoped security context established.
 */
export async function withSecurityContext<T>(
  client: any = prisma,
  context: SecurityContextInput,
  callback: (tx: any) => Promise<T>
): Promise<T> {
  const runTransaction = async (tx: any) => {
    await setTransactionSecurityContext(tx, context);
    return callback(tx);
  };

  if (typeof client.$transaction === 'function') {
    return client.$transaction(async (innerTx: any) => runTransaction(innerTx));
  } else {
    return runTransaction(client);
  }
}

/**
 * Retrieves the currently active transaction-scoped security context from PostgreSQL settings.
 */
export async function getTransactionSecurityContext(tx: any): Promise<SecurityContextInput> {
  const [res] = await tx.$queryRaw<Array<{
    userId: string;
    branchId: string;
    branchPath: string;
    departmentId: string;
    accessScope: string;
    realm: string;
    customerId: string;
  }>>`
    SELECT
      current_setting('app.current_user_id', true) as "userId",
      current_setting('app.current_branch_id', true) as "branchId",
      current_setting('app.current_branch_path', true) as "branchPath",
      current_setting('app.current_department_id', true) as "departmentId",
      current_setting('app.current_access_scope', true) as "accessScope",
      current_setting('app.current_realm', true) as "realm",
      current_setting('app.current_customer_id', true) as "customerId";
  `;

  return res;
}
