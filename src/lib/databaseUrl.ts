export function getDatabaseNameFromUrl(databaseUrl: string): string {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(databaseUrl);
  } catch {
    throw new Error('[DATABASE_URL_INVALID] Database URL is malformed.');
  }

  if (
    (parsedUrl.protocol !== 'postgres:' && parsedUrl.protocol !== 'postgresql:') ||
    !parsedUrl.hostname ||
    parsedUrl.hash
  ) {
    throw new Error('[DATABASE_URL_INVALID] Database URL target cannot be established.');
  }

  const encodedDatabaseName = parsedUrl.pathname.slice(1);
  let databaseName: string;
  try {
    databaseName = decodeURIComponent(encodedDatabaseName);
  } catch {
    throw new Error('[DATABASE_URL_INVALID] Database URL path is malformed.');
  }

  if (
    !encodedDatabaseName ||
    encodedDatabaseName.includes('/') ||
    !/^[A-Za-z0-9_]+$/.test(databaseName)
  ) {
    throw new Error('[DATABASE_URL_INVALID] Database URL must identify one unambiguous database.');
  }

  const seenParameters = new Set<string>();
  const targetOverrides = new Set([
    'database',
    'dbname',
    'host',
    'hostaddr',
    'service',
    'user',
  ]);
  for (const [parameter] of parsedUrl.searchParams) {
    const normalizedParameter = parameter.toLowerCase();
    if (seenParameters.has(normalizedParameter)) {
      throw new Error('[DATABASE_URL_INVALID] Duplicate database URL parameters are prohibited.');
    }
    seenParameters.add(normalizedParameter);
    if (targetOverrides.has(normalizedParameter)) {
      throw new Error('[DATABASE_URL_INVALID] Database URL contains an ambiguous target override.');
    }
  }

  return databaseName;
}
