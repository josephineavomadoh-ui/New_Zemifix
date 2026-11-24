import { AsyncLocalStorage } from 'async_hooks';
import type { Prisma } from '@prisma/client';

export interface ActiveSecurityTransaction {
  transactionClient: Prisma.TransactionClient;
  transactionHost: object;
}

const activeSecurityTransaction = new AsyncLocalStorage<ActiveSecurityTransaction>();

export function getActiveSecurityTransaction(): ActiveSecurityTransaction | undefined {
  return activeSecurityTransaction.getStore();
}

export function runWithSecurityTransaction<T>(
  transactionClient: Prisma.TransactionClient,
  transactionHost: object,
  callback: () => Promise<T>
): Promise<T> {
  return activeSecurityTransaction.run(
    { transactionClient, transactionHost },
    callback
  );
}
