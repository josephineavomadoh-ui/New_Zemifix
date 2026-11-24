# Security Context HMAC Key Provisioning

The Stage 2.1 migration deliberately creates an empty key table. Never place the
HMAC key in a migration, source file, command-line argument, or committed
environment file.

## Initial provisioning

1. Use a controlled deployment runner and generate an independent 32-byte
   cryptographically random key. Encode it as canonical base64.
2. Store the base64 value in the environment-specific secret manager as
   `APP_CONTEXT_HMAC_SECRET`. Make the same value available to every application
   instance for that environment. Do not reuse the value across environments.
3. Configure `APP_ENV`, `SECURITY_CONTEXT_MIGRATION_ROLE`, and
   `SECURITY_CONTEXT_MIGRATION_URL` from protected deployment secrets. The URL
   must target the exact database named by `APP_ENV`; its username must match the
   dedicated migration role.
4. Put the environment into a maintenance window and stop/drain all application
   and worker instances. The migrations replace RLS context getters and force
   RLS on every Prisma model table, so old instances without signed context
   must not remain in service.
5. Apply the reviewed Stage 2.1 signed-context migration and the subsequent
   default-deny RLS migration using the migration-only identity.
   The runtime `zemifix_app_user` must never be used for migrations. The
   migration identity must be pre-approved for extension installation, role
   creation/alteration and membership changes, function ownership changes, and
   key-table DDL/grants. Use a separate deployment-only credential with the
   minimum privileges the database administrator has verified are sufficient;
   never expose it to application processes.
6. Before enabling application traffic, run
   `npm run provision:security-context-key` in the controlled runner. The script
   checks the environment/database contract, connected identity, required
   provisioning privileges, and that `zemifix_app_user` cannot read/write the
   key table or assume `zemifix_context_verifier`. It uses parameterized SQL
   and does not print the URL or key. Confirm database statement logging and
   observability capture do not retain bind parameter values during
   provisioning; parameterization prevents SQL injection but is not a guarantee
   that a database server will never log parameters.
7. Deploy/restart the context-aware application with the same
   `APP_CONTEXT_HMAC_SECRET`, then
   run the opt-in PostgreSQL integration test only against the approved safe
   development database before considering broader rollout.

Until both the migration and key-row provisioning are complete, the signed
context validator fails closed and RLS-protected operations will be denied.
Do not open traffic during that interval.

## Default-deny migration rollout gate

The default-deny migration enables and forces RLS on every Prisma model table.
Only the tables with explicit policies in that migration are available to the
application role; all unmapped tables and operations are intentionally denied.
The current application still has unauthenticated login/bootstrap lookups and
service paths that do not consistently execute under `withSecurityContext`.
Consequently, applying this migration can block login and other existing
features. The migration is not production-ready until those paths have been
mapped, tested against the safe development database, and independently
reviewed. Do not apply it to staging or production based only on passing unit
tests.

The application-side AsyncLocalStorage guard rejects use of the shared root
Prisma client while a signed transaction context is active. It cannot prevent
code from using a separately constructed Prisma client or a direct database
connection; database RLS remains the enforcement boundary for protected tables.

## Rotation

The current verifier stores one active key (`id = 1`); it does not support
overlapping key versions. Rotation therefore requires a coordinated maintenance
window: stop/drain application and worker traffic, update the secret-manager
value for every instance, provision that exact value, restart all instances,
verify the matching context, and only then resume traffic. Existing transactions
using the old key will fail validation after the database key changes.

Do not run key provisioning or migration commands against protected,
staging, or production databases without a separately approved deployment
change and independent review.
