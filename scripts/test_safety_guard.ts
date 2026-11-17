import { prisma } from '../src/lib/prisma';

/**
 * Database Safety Assertor Helper
 * Throws an explicit error if the database connected is zemifix_dev or any protected DB.
 */
export async function assertAcceptanceDatabaseTarget(
  client: any = prisma,
  expectedDbName = 'zemifix_acceptance'
): Promise<string> {
  const result: any = await client.$queryRaw`SELECT current_database();`;
  const currentDb = result?.[0]?.current_database;

  if (currentDb === 'zemifix_dev') {
    throw new Error(
      `SAFETY_GUARD_FAILURE: Execution blocked! Current DB is protected baseline 'zemifix_dev'. Expected '${expectedDbName}'.`
    );
  }

  if (
    currentDb !== expectedDbName &&
    !currentDb?.includes('test') &&
    !currentDb?.includes('pglite')
  ) {
    throw new Error(
      `SAFETY_GUARD_FAILURE: Execution blocked! Current DB '${currentDb}' is not an authorized acceptance database.`
    );
  }

  return currentDb;
}
