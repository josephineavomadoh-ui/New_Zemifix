import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { getCurrentUser, type AuthenticatedUser, hasPermission } from './auth';
import {
  withSecurityContext,
  type SecurityContextInput,
  type SecurityRealm,
  type SecurityAccessScope,
} from './services/securityContextService';
import {
  AuthenticationError,
  ForbiddenError,
  DatabaseUnavailableError,
} from './db-errors';

export interface ApiSecurityOptions {
  /** Security Realm (defaults to 'STAFF') */
  realm?: SecurityRealm;
  /** Required resource permission e.g. 'inventory' */
  resource?: string;
  /** Required action permission e.g. 'read' */
  action?: string;
  /** Roles authorized to bypass permission check (e.g. ['Admin']) */
  roles?: string[];
  /** Allow unauthenticated execution under 'AUTH', 'PUBLIC_QR', or 'STAFF' */
  allowAnonymous?: boolean;
  /** Optional transaction host client (defaults to global prisma) */
  client?: any;
}

export interface ApiHandlerContext {
  user: AuthenticatedUser | null;
  securityContext: SecurityContextInput;
  tx: Prisma.TransactionClient;
  params?: Record<string, any>;
}

export type ApiHandler<T = any> = (
  req: NextRequest,
  ctx: ApiHandlerContext
) => Promise<NextResponse | T>;

/**
 * Higher-order function wrapping API handlers with authentication,
 * RBAC permission verification, and transaction-bound signed security context setup.
 */
export function withApiSecurity<T = any>(
  options: ApiSecurityOptions,
  handler: ApiHandler<T>
) {
  return async (req: NextRequest, routeParams?: { params: Promise<any> }) => {
    try {
      const realm: SecurityRealm = options.realm ?? 'STAFF';
      let user: AuthenticatedUser | null = null;
      let secContext: SecurityContextInput;

      // 1. Evaluate Security Realm Context
      if (realm === 'AUTH') {
        secContext = {
          userId: '',
          realm: 'AUTH',
          accessScope: 'Own',
        };
      } else if (realm === 'PUBLIC_QR') {
        secContext = {
          userId: '',
          realm: 'PUBLIC_QR',
          accessScope: 'Own',
        };
      } else if (realm === 'WORKER') {
        const workerAuth = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
        if (!workerAuth) {
          return NextResponse.json(
            { error: 'FORBIDDEN: Worker HMAC token required.' },
            { status: 403 }
          );
        }
        secContext = {
          userId: '',
          realm: 'WORKER',
          accessScope: 'Company',
        };
      } else if (realm === 'CUSTOMER') {
        secContext = {
          userId: '',
          realm: 'CUSTOMER',
          accessScope: 'Own',
        };
      } else {
        // STAFF Realm (Default)
        if (!options.allowAnonymous) {
          user = await getCurrentUser(req);
          if (!user || !user.isActive) {
            return NextResponse.json(
              { error: 'UNAUTHORIZED: Active staff session required.' },
              { status: 401 }
            );
          }

          if (options.roles && options.roles.length > 0) {
            if (!options.roles.includes(user.role.name) && user.role.name !== 'Admin') {
              return NextResponse.json(
                { error: `FORBIDDEN: Required role: ${options.roles.join(', ')}.` },
                { status: 403 }
              );
            }
          }

          if (options.resource && options.action) {
            if (!hasPermission(user, options.resource, options.action)) {
              return NextResponse.json(
                { error: `FORBIDDEN: Missing permission "${options.resource}:${options.action}".` },
                { status: 403 }
              );
            }
          }
        }

        secContext = {
          userId: user?.id ?? '',
          branchId: user?.branchId ?? '',
          branchPath: user?.branch?.path ?? null,
          departmentId: user?.departmentId ?? null,
          accessScope: (user?.accessScope as SecurityAccessScope) ?? 'Own',
          realm: 'STAFF',
        };
      }

      const resolvedParams = routeParams?.params ? await routeParams.params : undefined;

      const executeCallback = async (tx: Prisma.TransactionClient) => {
        return await handler(req, {
          user,
          securityContext: secContext,
          tx,
          params: resolvedParams,
        });
      };

      // 2. Execute Handler inside Signed Security Context Transaction
      if (options.client) {
        return await withSecurityContext(options.client, secContext, executeCallback);
      }
      return await withSecurityContext(secContext, executeCallback);
    } catch (err: unknown) {
      if (err instanceof AuthenticationError) {
        return NextResponse.json({ error: err.message }, { status: 401 });
      }
      if (err instanceof ForbiddenError) {
        return NextResponse.json({ error: err.message }, { status: 403 });
      }
      if (err instanceof DatabaseUnavailableError) {
        return NextResponse.json({ error: err.message }, { status: 503 });
      }

      const errorMsg = err instanceof Error ? err.message : 'Internal Server Error';
      console.error('[API Security Wrapper Error]:', err);
      return NextResponse.json({ error: errorMsg }, { status: 500 });
    }
  };
}
