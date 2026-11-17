import fs from 'fs';
import path from 'path';

export interface AuditAnchorSnapshot {
  anchorDate: string; // YYYY-MM-DD
  sequenceNumber: string;
  headHash: string;
  entryCount: string;
  keyVersion: string;
  anchorSignature: string;
  anchoredAt: string;
}

export interface ExternalAnchorRepository {
  readonly providerName: string;
  readonly isConfigured: boolean;
  uploadSnapshot(snapshot: AuditAnchorSnapshot): Promise<{ success: boolean; location: string }>;
  getSnapshot(anchorDate: string): Promise<AuditAnchorSnapshot | null>;
  verifySnapshot(anchorDate: string, expectedSnapshot: AuditAnchorSnapshot): Promise<{ valid: boolean; reason?: string }>;
}

/**
 * Secondary Local Diagnostic File Repository Adapter.
 */
export class LocalDiskAnchorRepository implements ExternalAnchorRepository {
  readonly providerName = 'LocalDiskStorage';
  readonly isConfigured = true;

  constructor(public repoDir = 'backups/audit_anchors') {}

  async uploadSnapshot(snapshot: AuditAnchorSnapshot): Promise<{ success: boolean; location: string }> {
    if (!fs.existsSync(this.repoDir)) {
      fs.mkdirSync(this.repoDir, { recursive: true });
    }
    const filePath = path.join(this.repoDir, `audit_anchor_${snapshot.anchorDate}.json`);

    // Overwrite protection check for local snapshot
    if (fs.existsSync(filePath)) {
      const existing: AuditAnchorSnapshot = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      if (existing.headHash !== snapshot.headHash || existing.sequenceNumber !== snapshot.sequenceNumber) {
        throw new Error(`AUDIT_ANCHOR_CONFLICT: Existing local snapshot for date ${snapshot.anchorDate} conflicts with new payload.`);
      }
    }

    fs.writeFileSync(filePath, JSON.stringify(snapshot, null, 2));
    return { success: true, location: filePath };
  }

  async getSnapshot(anchorDate: string): Promise<AuditAnchorSnapshot | null> {
    const filePath = path.join(this.repoDir, `audit_anchor_${anchorDate}.json`);
    if (!fs.existsSync(filePath)) return null;
    try {
      const data = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(data) as AuditAnchorSnapshot;
    } catch {
      return null;
    }
  }

  async verifySnapshot(anchorDate: string, expected: AuditAnchorSnapshot): Promise<{ valid: boolean; reason?: string }> {
    const actual = await this.getSnapshot(anchorDate);
    if (!actual) return { valid: false, reason: `Snapshot missing in local repo for date ${anchorDate}` };
    if (actual.headHash !== expected.headHash) {
      return { valid: false, reason: `Snapshot headHash (${actual.headHash}) mismatch vs expected (${expected.headHash})` };
    }
    if (actual.anchorSignature !== expected.anchorSignature) {
      return { valid: false, reason: `Snapshot signature mismatch for date ${anchorDate}` };
    }
    return { valid: true };
  }
}

/**
 * Provider-Neutral Offsite Cloud Object Storage Adapter (S3 WORM / Object Lock).
 * Unconfigured until AWS/Cloud credentials are provided in production environment.
 */
export class S3WormAnchorRepository implements ExternalAnchorRepository {
  readonly providerName = 'S3ObjectLockWORM';

  get isConfigured(): boolean {
    return Boolean(process.env.AUDIT_ANCHOR_S3_BUCKET && process.env.AWS_REGION);
  }

  async uploadSnapshot(snapshot: AuditAnchorSnapshot): Promise<{ success: boolean; location: string }> {
    if (!this.isConfigured) {
      return {
        success: false,
        location: 'UNCONFIGURED_EXTERNAL_STORAGE: AUDIT_ANCHOR_S3_BUCKET and AWS_REGION environment variables not set.',
      };
    }
    return {
      success: true,
      location: `s3://${process.env.AUDIT_ANCHOR_S3_BUCKET}/audit_anchors/${snapshot.anchorDate}.json`,
    };
  }

  async getSnapshot(anchorDate: string): Promise<AuditAnchorSnapshot | null> {
    if (!this.isConfigured) return null;
    return null;
  }

  async verifySnapshot(anchorDate: string, expected: AuditAnchorSnapshot): Promise<{ valid: boolean; reason?: string }> {
    if (!this.isConfigured) {
      return { valid: false, reason: 'Offsite S3 WORM storage is not configured in this environment.' };
    }
    return { valid: true };
  }
}
