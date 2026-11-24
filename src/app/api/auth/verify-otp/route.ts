import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  verifyPreAuthToken,
  createSessionToken,
  SESSION_COOKIE_NAME,
  PREAUTH_COOKIE_NAME,
} from '@/src/lib/auth';
import { verifyOtpChallenge, updateLastLoginAt } from '@/src/lib/services/otpService';
import { withSecurityContext } from '@/src/lib/services/securityContextService';
import { handleApiError, DatabaseUnavailableError } from '@/src/lib/db-errors';
import { isDevLike } from '@/src/lib/env';

const verifySchema = z.object({
  code: z.string().min(1, 'Authentication code is required').max(10),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { code } = verifySchema.parse(body);

    // 1. Read pre-authentication cookie
    const preAuthCookie = req.cookies.get(PREAUTH_COOKIE_NAME)?.value;
    if (!preAuthCookie) {
      return NextResponse.json(
        {
          error: 'Invalid Session',
          message:
            'Pre-authentication session expired or invalid. Please log in again.',
        },
        { status: 401 }
      );
    }

    const preAuthPayload = await verifyPreAuthToken(preAuthCookie);
    if (!preAuthPayload) {
      return NextResponse.json(
        {
          error: 'Invalid Session',
          message:
            'Pre-authentication session expired or invalid. Please log in again.',
        },
        { status: 401 }
      );
    }

    // 2. Atomically verify OTP code
    const { outcome, user } = await withSecurityContext(
      {
        userId: preAuthPayload.userId,
        accessScope: 'Own',
        realm: 'STAFF',
      },
      async (tx) => {
        const outcome = await verifyOtpChallenge(
          preAuthPayload.otpRecordId,
          code.trim(),
          tx
        );

        if (outcome.status !== 'valid') {
          return { outcome, user: null };
        }

        await updateLastLoginAt(preAuthPayload.userId, tx);
        const user = await tx.user.findUnique({
          where: { id: preAuthPayload.userId },
          include: {
            role: true,
            branch: true,
            department: true,
          },
        });

        return { outcome, user };
      }
    );

    if (outcome.status === 'valid') {
      if (!user || user.deletedAt !== null || !user.isActive) {
        return NextResponse.json(
          {
            error: 'Account Inaccessible',
            message: 'User account is inactive or no longer exists.',
          },
          { status: 403 }
        );
      }

      // 5. Create full authenticated session token
      const sessionToken = await createSessionToken({
        userId: user.id,
        email: user.email,
        role: user.role.name,
        branchId: user.branchId,
        departmentId: user.departmentId ?? null,
        accessScope: user.accessScope,
      });

      // Safe user object (omits passwordHash and OTP hashes)
      const safeUser = {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: {
          id: user.role.id,
          name: user.role.name,
        },
        branch: {
          id: user.branch.id,
          name: user.branch.name,
          code: user.branch.code,
          type: user.branch.type,
        },
        department: user.department
          ? {
              id: user.department.id,
              name: user.department.name,
              code: user.department.code,
            }
          : null,
        accessScope: user.accessScope,
        approvalLimit: user.approvalLimit ? Number(user.approvalLimit) : null,
      };

      const response = NextResponse.json({
        success: true,
        authenticated: true,
        user: safeUser,
        message: 'Authentication successful.',
      });

      // Set session cookie
      response.cookies.set({
        name: SESSION_COOKIE_NAME,
        value: sessionToken,
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 8 * 3600, // 8 hours
      });

      // Clear pre-authentication cookie
      response.cookies.delete(PREAUTH_COOKIE_NAME);

      // ---- Development cache cleanup (challenge‑id keyed) ----
      if (isDevLike()) {
        const { clearOtp } = await import('@/src/lib/services/devOtpStore');
        clearOtp(preAuthPayload.otpRecordId);
      }

      return response;
    }

    if (outcome.status === 'wrong_code') {
      return NextResponse.json(
        {
          error: 'Invalid Code',
          message: `Invalid authentication code. ${outcome.attemptsRemaining} attempt(s) remaining.`,
          attemptsRemaining: outcome.attemptsRemaining,
        },
        { status: 400 }
      );
    }

    if (outcome.status === 'expired') {
      if (isDevLike()) {
        const { clearOtp } = await import('@/src/lib/services/devOtpStore');
        clearOtp(preAuthPayload.otpRecordId);
      }

      return NextResponse.json(
        {
          error: 'Code Expired',
          message:
            'Authentication code has expired. Please request a new code.',
        },
        { status: 400 }
      );
    }

    if (outcome.status === 'exhausted') {
      return NextResponse.json(
        {
          error: 'Maximum Attempts Exceeded',
          message:
            'Maximum verification attempts exceeded. Please request a new code.',
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        error: 'Invalid Code',
        message:
          'Authentication code is no longer valid. Please request a new code.',
      },
      { status: 400 }
    );
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation Error', message: error.issues[0]?.message },
        { status: 400 }
      );
    }
    if (error instanceof DatabaseUnavailableError) {
      const { status, body } = handleApiError(error);
      return NextResponse.json(body, { status });
    }
    const { status, body } = handleApiError(error);
    return NextResponse.json(body, { status });
  }
}
