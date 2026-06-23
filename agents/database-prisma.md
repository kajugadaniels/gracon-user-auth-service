# api/auth Database and Prisma Rules

`api/auth` owns user identity, session, verification, and account data behavior.
`api/database` owns the shared Prisma schema and migrations.

## Ownership Rules

- Do not run Prisma migrations from `api/auth`.
- Shared schema changes start in `api/database/prisma/schema.prisma`.
- Consumer services may mirror schema models during the transition but must not migrate shared tables.
- Meeting table changes must be made in `api/database/prisma/schema.prisma` first, then mirrored into `api/meetings/prisma/schema.prisma`.
- Signature, institution, stamp, document, and meeting shared schema changes must preserve existing crypto and ownership contracts.

## Prisma Query Rules

- Use `select` to fetch only required fields.
- Avoid unbounded list loading.
- Add indexes for new high-frequency query patterns.
- Prefer compound indexes when a query filters and orders on the same path.
- Use transactions for multi-row writes that must be atomic.
- Keep transaction work small and predictable.

## Sensitive Data Rules

- Store password hashes only, never passwords.
- Store refresh tokens and reset tokens as hashes only.
- Store NID, FIN, PID, and other sensitive identifiers encrypted when recoverable and hashed when searchable.
- Never expose encrypted or hashed values in API responses.

## Migration Rules

- Do not run migrations automatically.
- Before adding a migration, explain the schema change and blast radius.
- Keep `.env.example` current when a schema feature depends on new config.
- Do not edit generated Prisma client output.

## Seed Rules

- Seeds that create login-ready users must be explicit and guarded by environment flags.
- Never run fake-user seeds against production user data unless the user explicitly confirms a disposable production-like environment.
