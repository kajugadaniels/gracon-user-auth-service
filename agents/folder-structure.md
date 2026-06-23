# api/auth Folder Structure Rules

This file explains where new code belongs inside `api/auth`.

## Source Layout

```text
src/
  common/           reusable infrastructure shared across modules
  config/           environment and application configuration
  modules/          business domains exposed by the API
prisma/             guarded auth-only development seeds
docs/               human architecture and integration contracts
agents/             AI execution rules for this service
test/               e2e and integration tests
```

## Module Layout

Business code belongs under `src/modules/<domain>/`.

Use this pattern:

```text
src/modules/users/
  dto/
  interfaces/
  users.controller.ts
  users.service.ts
  users.module.ts
  *.helper.ts
  *.spec.ts
```

## Placement Rules

- Put HTTP entry points in controllers.
- Put business rules and Prisma calls in services.
- Put request/response contracts in `dto/`.
- Put small pure functions in `*.helper.ts` near the module that owns them.
- Put shared guards, decorators, filters, crypto, mailer, S3, security, and Prisma infrastructure under `src/common/`.
- Put integration contracts and architecture notes under `docs/`.
- Put AI-only working rules under `agents/`.

## Do Not Create

- Do not create vague folders like `utils/`, `helpers/`, or `shared/` unless there is a clear cross-module owner.
- Do not put service-specific logic in `src/common/`.
- Do not create a new module when an existing module owns the business concept.
- Do not move auth issuance outside `src/modules/auth/`.
- Do not move identity verification outside `src/modules/verification/` unless the architecture is explicitly redesigned.

## Cross-Service Schema Rule

`api/database` owns shared Prisma migrations and generated-client ownership. If a schema table is used by another service, change it in `api/database` first, then regenerate the shared client.
