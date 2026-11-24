import 'dotenv/config';
import readline from 'readline';
import { platformBootstrapAdmin } from '../src/lib/platformBootstrap';
import { platformPrisma } from '../src/lib/platformPrisma';

async function main() {
  const platformUrl = process.env.PLATFORM_DATABASE_URL;
  if (!platformUrl || !platformUrl.includes('zemifix_platform_dev')) {
    console.error('CRITICAL ERROR: PLATFORM_DATABASE_URL must be configured and target zemifix_platform_dev.');
    process.exit(1);
  }

  if (process.env.DATABASE_URL && process.env.DATABASE_URL === platformUrl) {
    console.error('CRITICAL ERROR: PLATFORM_DATABASE_URL must not equal DATABASE_URL.');
    process.exit(1);
  }

  try {
    await platformPrisma.$connect();
  } catch (err: any) {
    console.error('CRITICAL ERROR: Unable to connect to platform database:', err.message);
    process.exit(1);
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const question = (query: string): Promise<string> => {
    return new Promise((resolve) => rl.question(query, resolve));
  };

  console.log('=== ZemiFix SaaS Platform Super Administrator CLI Bootstrap ===');
  const name = await question('Enter Administrator Full Name: ');
  const email = await question('Enter Administrator Email: ');

  const password = await new Promise<string>((resolve) => {
    process.stdout.write('Enter Administrator Password (min 8 chars): ');
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
    }
    let pwd = '';
    const listener = (chunk: Buffer) => {
      const code = chunk[0];
      if (code === 13 || code === 10) {
        if (process.stdin.isTTY) {
          process.stdin.setRawMode(false);
        }
        process.stdin.removeListener('data', listener);
        process.stdout.write('\n');
        resolve(pwd);
      } else if (code === 127 || code === 8) {
        if (pwd.length > 0) {
          pwd = pwd.slice(0, -1);
          process.stdout.write('\b \b');
        }
      } else if (code === 3) {
        process.exit();
      } else {
        pwd += String.fromCharCode(code);
        process.stdout.write('*');
      }
    };
    process.stdin.on('data', listener);
  });

  rl.close();

  console.log('\nProcessing secure bootstrap...');
  const result = await platformBootstrapAdmin({
    name,
    email,
    password,
    clientIp: '127.0.0.1-cli',
  });

  console.log(`\nResult: ${result.success ? 'SUCCESS' : 'REFUSED/FAILED'}`);
  console.log(`Message: ${result.message}`);

  await platformPrisma.$disconnect();
  process.exit(result.success ? 0 : 1);
}

main().catch((err) => {
  console.error('Bootstrap execution error:', err);
  process.exit(1);
});
