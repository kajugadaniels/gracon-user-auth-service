# CLAUDE.md — api/auth

> NestJS user auth service. Port **3000**.
> Read the root `gracon/CLAUDE.md` first — all universal rules apply.
> This file covers only what is unique to this service.

---

## Purpose

The identity and authentication gateway for the entire platform.
Owns user registration, login, email verification, password reset,
ID verification (via the AI engine), and JWT issuance. Every other
service validates tokens that **this service issues**.

---

## Port & Environment

| Variable   | Value                  |
|------------|------------------------|
| `APP_PORT` | `3000`                 |
| `APP_ENV`  | `development` / `production` |

---

## Tech Stack

- **NestJS** with TypeScript
- **Prisma** ORM → Neon Postgres (shared DB — only this service runs migrations)
- **Passport.js** with `passport-jwt` strategy
- **bcrypt** (12 rounds) for password hashing
- **AES-256-CBC** via `EncryptionService` for NID/PID storage
- **SHA-256** for refresh token hashing
- **AWS S3** via `S3Service` for verification image uploads
- **Nodemailer** via `AppMailerService` for transactional email
- **Throttler** for rate limiting on sensitive endpoints
- **Axios** for internal HTTP calls to the AI engine

---

## Module Map

```
src/
  modules/
    auth/           ← login, register, refresh, logout, email verify, token types
    users/          ← profile read/update, profile image, change password
    citizen/        ← NID lookup against external Citizen API (5-min cache)
    verification/   ← ID verification flow (upload → engine → result)
  common/
    aws/s3/         ← S3Service, multer config, presigned URLs
    crypto/         ← EncryptionService (AES-256-CBC encrypt/decrypt)
    decorators/     ← @CurrentUser, @RequireTokenType, @ThrottleStrict
    filters/        ← ThrottlerExceptionFilter
    guards/         ← JwtAuthGuard, ThrottlerGuard
    mailer/         ← AppMailerService, Handlebars templates
    pid/            ← PidService (external PID validation)
    prisma/         ← PrismaService
    security/       ← CORS config, Helmet config, Swagger docs auth middleware
    tasks/          ← TokenCleanupTask (cron — removes expired refresh tokens)
```

---

## Key Security Rules

- `JwtAuthGuard` is required on **every** protected endpoint — no exceptions
- `@RequireTokenType('any')` is required on routes that limited tokens can
  reach (e.g. verification submit while still unverified)
- `@ThrottleStrict()` is required on: login, register, forgot-password,
  reset-password, verify-email, verification/submit
- Passwords: `bcrypt` with **minimum 12 rounds** — never fewer
- NID and PID fields: always pass through `EncryptionService.encrypt()`
  before any Prisma write — never stored plain
- Refresh tokens: always `sha256(token)` before storing in DB —
  plain token goes to the client, hash stays in the DB
- Verification images: uploaded to S3 with a unique key, sent to the engine
  as S3 keys (not binary data), then **deleted from S3 immediately** after
  the engine responds — regardless of success or failure
- Never return `passwordHash`, `nidEncrypted`, or `pidEncrypted` from
  any Prisma query used in a response — always use `select` to exclude them
- Citizen API responses are cached in-memory for 5 minutes to prevent
  enumeration via timing and to reduce external API load

---

## Token Types

This service issues two types of JWT:

| Type      | Purpose                                        | Expiry |
|-----------|------------------------------------------------|--------|
| `full`    | Standard authenticated user                    | 15 min |
| `limited` | User passed login but has not yet verified ID  | 30 min |

The `@RequireTokenType('any')` decorator allows both types.
The default `JwtAuthGuard` rejects `limited` tokens on sensitive routes.
The `tokenType` claim is embedded in the JWT payload.

---

## Folder Structure

```
src/
  app.module.ts
  main.ts
  config/
    database.config.ts
    env.validation.ts
  common/
    aws/
      s3/
        s3.service.ts
        s3.module.ts
        multer.config.ts
    crypto/
      encryption.service.ts
      encryption.module.ts
    decorators/
      current-user.decorator.ts
      token-type.decorator.ts
      throttle.decorator.ts
      index.ts
    filters/
      throttler-exception.filter.ts
    guards/
      jwt-auth.guard.ts
      throttler.guard.ts
      index.ts
    mailer/
      mailer.module.ts
      mailer.service.ts
      templates/
        *.hbs
    pid/
      pid.service.ts
      pid.module.ts
    prisma/
      prisma.service.ts
      prisma.module.ts
    security/
      cors.config.ts
      docs-auth.middleware.ts
      helmet.config.ts
      index.ts
      security-event.service.ts
      security-event.module.ts
    tasks/
      token-cleanup.task.ts
      tasks.module.ts
  modules/
    auth/
      dto/
      interfaces/
      entities/
      strategies/
      auth.service.ts
      auth.controller.ts
      auth.module.ts
      password-reset.service.ts
      password-reset.controller.ts
    citizen/
      dto/
      exceptions/
      interfaces/
      citizen.service.ts
      citizen.controller.ts
      citizen.module.ts
    users/
      dto/
      interfaces/
      users.service.ts
      users.controller.ts
      users.module.ts
    verification/
      dto/
      exceptions/
      interfaces/
      verification.service.ts
      verification.controller.ts
      verification.module.ts
```

---

## Adding a New Feature — Checklist

- [ ] Create module directory under `src/modules/`
- [ ] Add DTOs with both `class-validator` AND `@ApiProperty` decorators
- [ ] Add `@ApiOperation` and `@ApiResponse` to every endpoint
- [ ] Add `@UseGuards(JwtAuthGuard)` if auth is required
- [ ] Add `@RequireTokenType('any')` if limited tokens should be accepted
- [ ] Add `@ThrottleStrict()` if the endpoint is sensitive
- [ ] Register the module in `app.module.ts`
- [ ] Run `npm run build` — zero TypeScript errors before committing
- [ ] Update `.env.example` if new environment variables are needed

---

## Environment Variables (key ones)

```env
APP_PORT=3000
DATABASE_URL=                      # Neon Postgres — this service owns migrations
JWT_SECRET=                        # Shared with api/signature, api/stamp, api/institution, api/documents
ENCRYPTION_SECRET=                 # Shared with api/admin and api/documents (32 chars exactly)
CITIZEN_API_URL=
CITIZEN_API_USERNAME=
CITIZEN_API_PASSWORD=
ENGINE_URL=http://localhost:8000   # Internal FastAPI engine
ENGINE_API_KEY=                    # HMAC key for X-Engine-API-Key header
AWS_REGION=
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_S3_BUCKET_NAME=
MAIL_HOST=
MAIL_PORT=
MAIL_USER=
MAIL_PASS=
MAIL_FROM=
FRONTEND_URL=http://localhost:4000
DOCS_BASIC_AUTH_USER=              # Swagger basic auth (production only)
DOCS_BASIC_AUTH_PASS=
```
