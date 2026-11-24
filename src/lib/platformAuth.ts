import { NextRequest } from 'next/server';
import { SignJWT, jwtVerify } from 'jose';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { platformPrisma } from './platformPrisma';

const PLATFORM_SESSION_SECRET = process.env.PLATFORM_SESSION_SECRET;
if (!PLATFORM_SESSION_SECRET || PLATFORM_SESSION_SECRET.length < 32) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('CRITICAL SECURITY ERROR: PLATFORM_SESSION_SECRET must be defined and at least 32 characters long.');
  }
}

const SECRET_KEY = new TextEncoder().encode(
  PLATFORM_SESSION_SECRET || 'dev-platform-session-secret-at-least-32-chars-long'
);

export interface AuthenticatedPlatformAdmin {
  id: string;
  name: string;
  email: string;
  roleId: string;
  roleCode: string;
  roleName: string;
  mfaEnabled: boolean;
  permissions: { resource: string; action: string }[];
}

// In-memory rate limiter for platform login (Max 5 attempts per 15 mins per key)
const loginAttempts = new Map<string, { count: number; resetAt: number }>();

export function checkPlatformLoginRateLimit(key: string): boolean {
  const now = Date.now();
  const record = loginAttempts.get(key);
  if (!record || now > record.resetAt) {
    loginAttempts.set(key, { count: 1, resetAt: now + 15 * 60 * 1000 });
    return true;
  }
  if (record.count >= 5) {
    return false;
  }
  record.count += 1;
  return true;
}

export async function verifyPlatformPassword(plainPassword: string, hashedPassword: string): Promise<boolean> {
  return await bcrypt.compare(plainPassword, hashedPassword);
}

export async function hashPlatformPassword(plainPassword: string): Promise<string> {
  const salt = await bcrypt.genSalt(10);
  return await bcrypt.hash(plainPassword, salt);
}

export function generateBase32Secret(length = 20): string {
  const buffer = crypto.randomBytes(length);
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let output = '';
  let bits = 0;
  let value = 0;
  for (let i = 0; i < buffer.length; i++) {
    value = (value << 8) | buffer[i];
    bits += 8;
    while (bits >= 5) {
      output += alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  return output;
}

/**
 * Simple secure TOTP verifier (RFC 6238 compatible HMAC-SHA1)
 */
export function verifyTotpCode(secretBase32: string, token: string, window = 1): boolean {
  if (!secretBase32 || !token || token.length !== 6) return false;

  try {
    const decodedKey = base32Decode(secretBase32);
    const epoch = Math.floor(Date.now() / 1000);
    const step = 30;
    const timeCounter = Math.floor(epoch / step);

    for (let i = -window; i <= window; i++) {
      const generatedToken = generateTotp(decodedKey, timeCounter + i);
      if (crypto.timingSafeEqual(Buffer.from(generatedToken), Buffer.from(token))) {
        return true;
      }
    }
  } catch {
    return false;
  }
  return false;
}

function base32Decode(base32: string): Buffer {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0;
  let value = 0;
  let index = 0;
  const output = [];

  for (let i = 0; i < base32.length; i++) {
    const char = base32.charAt(i).toUpperCase();
    if (char === '=') break;
    const val = alphabet.indexOf(char);
    if (val === -1) continue;
    value = (value << 5) | val;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      output.push((value >> bits) & 0xff);
    }
  }
  return Buffer.from(output);
}

function generateTotp(key: Buffer, counter: number): string {
  const buffer = Buffer.alloc(8);
  for (let i = 7; i >= 0; i--) {
    buffer[i] = counter & 0xff;
    counter = Math.floor(counter / 256);
  }

  const hmac = crypto.createHmac('sha1', key);
  hmac.update(buffer);
  const digest = hmac.digest();

  const offset = digest[digest.length - 1] & 0xf;
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);

  const otp = binary % 1000000;
  return otp.toString().padStart(6, '0');
}

export async function signPlatformToken(admin: { id: string; email: string }, jti: string): Promise<string> {
  return await new SignJWT({
    adminId: admin.id,
    email: admin.email,
    jti,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer('zemifix-platform')
    .setAudience('zemifix:platform_admin')
    .setJti(jti)
    .setIssuedAt()
    .setExpirationTime('4h')
    .sign(SECRET_KEY);
}

export async function createPlatformSession(platformUserId: string): Promise<{ token: string; jti: string }> {
  const jti = crypto.randomUUID();
  const token = await signPlatformToken({ id: platformUserId, email: '' }, jti);
  const expiresAt = new Date(Date.now() + 4 * 60 * 60 * 1000);

  await platformPrisma.platformSession.create({
    data: {
      platformUserId,
      jti,
      expiresAt,
    },
  });

  return { token, jti };
}

export async function revokePlatformSession(jti: string): Promise<void> {
  await platformPrisma.platformSession.update({
    where: { jti },
    data: { revokedAt: new Date() },
  }).catch(() => {});
}

export async function getCurrentPlatformAdmin(req: NextRequest): Promise<AuthenticatedPlatformAdmin | null> {
  const token = req.cookies.get('zemifix_platform_session')?.value;
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, SECRET_KEY, {
      issuer: 'zemifix-platform',
      audience: 'zemifix:platform_admin',
    });

    const adminId = payload.adminId as string;
    const jti = payload.jti as string;
    if (!adminId || !jti) return null;

    // Check session validity in database
    const session = await platformPrisma.platformSession.findUnique({
      where: { jti },
    });

    if (!session || session.revokedAt !== null || session.expiresAt < new Date()) {
      return null;
    }

    const admin = await platformPrisma.platformUser.findUnique({
      where: { id: adminId },
      include: {
        role: {
          include: {
            permissions: {
              include: { permission: true },
            },
          },
        },
      },
    });

    if (!admin || !admin.isActive) {
      return null;
    }

    const permissions = admin.role.permissions.map((rp) => ({
      resource: rp.permission.resource,
      action: rp.permission.action,
    }));

    return {
      id: admin.id,
      name: admin.name,
      email: admin.email,
      roleId: admin.roleId,
      roleCode: admin.role.code,
      roleName: admin.role.name,
      mfaEnabled: admin.mfaEnabled,
      permissions,
    };
  } catch {
    return null;
  }
}
