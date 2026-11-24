import 'dotenv/config';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

async function backup() {
  const dbUrl = process.env.PLATFORM_DATABASE_URL;
  if (!dbUrl || !dbUrl.includes('zemifix_platform_dev')) {
    console.error('STOP: PLATFORM_DATABASE_URL is missing or does not target zemifix_platform_dev unambiguously!');
    process.exit(1);
  }

  const cleanUrl = dbUrl.split('?')[0];

  const backupDir = path.join(process.cwd(), 'backups');
  fs.mkdirSync(backupDir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupFile = path.join(backupDir, `zemifix_platform_dev_backup_${timestamp}.dump`);

  console.log('Starting custom-format pg_dump for zemifix_platform_dev...');
  try {
    execSync(`pg_dump -Fc "${cleanUrl}" -f "${backupFile}"`, { stdio: 'inherit' });
    console.log('pg_dump completed successfully.');

    console.log('Verifying backup with pg_restore --list...');
    execSync(`pg_restore --list "${backupFile}"`, { stdio: 'inherit' });
    console.log('pg_restore verification passed successfully.');

    const stats = fs.statSync(backupFile);
    console.log(`Backup File Location: ${backupFile}`);
    console.log(`Backup File Size: ${(stats.size / 1024).toFixed(2)} KB`);
  } catch (err: any) {
    console.error('Backup or verification failed:', err.message);
    process.exit(1);
  }
}

backup();
