# API Auth

Primary identity and authentication backend for the Gracon platform.

This service owns user registration, login, email verification, password reset, refresh-token rotation, citizen lookup, profile management, and AI-backed identity verification. Every other protected backend trusts tokens issued here.

## Overview

- Runtime: NestJS + TypeScript
- Default port: `3000`
- Database owner: shared Neon/Postgres via Prisma
- Primary consumers: `app/app`, selective validation from other APIs
- Special role: source of truth for user JWT issuance and shared auth schema migrations

## What This Service Owns

- User registration and login
- Registration via Rwanda NID or Foreign Identity Number (FIN)
- Full and limited JWT issuance
- Refresh-token rotation and revocation
- Email verification and password reset
- Profile read/update
- Citizen lookup integration
- Foreign identity lookup integration for FIN-backed registration
- ID + selfie verification workflow via the internal engine
- Security-event capture and token cleanup background work
- Shared persistence for personal certificate requests that must be approved before `api/signature` issues a real certificate
- Shared admin-audit enum values for certificate-request approval and rejection actions emitted by `api/admin`
- Shared persistence for per-user certificate access policy, so revocation history and hard certificate bans stay separate

## Core Skills Needed

- NestJS authentication and authorization patterns
- Prisma schema ownership and migration discipline
- Secure token lifecycle design
- Encryption-at-rest for sensitive identifiers
- File upload validation and private S3 object handling
- Internal-service integration with FastAPI/AWS Rekognition pipeline

## Techniques Used

- Access/refresh JWT split with hashed refresh-token persistence
- Full-token vs limited-token access model
- Email verification can issue a temporary limited session for personal-account identity verification; full login still requires both email and identity verification to be complete
- Single-flight refresh rotation plus verified limited-session upgrade to prevent parallel app calls from forcing re-login
- AES encryption for national/citizen identifiers
- Strict throttling on brute-force and recovery endpoints
- Private S3 upload pipeline with immediate post-processing deletion
- Engine-to-auth internal trust using `X-Engine-API-Key`
- Cached citizen lookups to reduce external load and timing variance

## Main Modules

```text
src/
  common/
    aws/s3/         private upload + presigned URL handling
    crypto/         encryption helpers
    decorators/     current user, token type, throttling
    guards/         JWT and throttler guards
    mailer/         transactional email templates and sender
    pid/            external PID validation support
    prisma/         Prisma service/module
    security/       helmet, CORS, docs auth, security events
    tasks/          cleanup jobs
  modules/
    auth/           registration, login, refresh, logout, password reset
    citizen/        citizen lookup and cache
    foreign-identity/ FIN lookup client for foreign-user registration
    users/          profile and account operations
    verification/   ID verification submission and result handling
```

## Folder Structure

```text
api/auth/
  docs/
  prisma/
  src/
    common/
    config/
    modules/
  test/
  package.json
  nest-cli.json
```

## Local Commands

```bash
npm install
npm run start:dev
npm run build
npm run test
npm run lint
npx prisma generate
```

## Environment Notes

Key variables:

```env
APP_PORT=3000
DATABASE_URL=
JWT_SECRET=
ENCRYPTION_SECRET=
ENGINE_URL=http://localhost:8000
ENGINE_API_KEY=
FOREIGN_IDENTITY_SERVICE_URL=http://localhost:3006/api/v1
FOREIGN_IDENTITY_SERVICE_USERNAME=
FOREIGN_IDENTITY_SERVICE_PASSWORD=
AWS_REGION=
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_S3_BUCKET_NAME=
MAIL_HOST=
MAIL_PORT=
MAIL_USER=
MAIL_PASS=
MAIL_FROM=
```

- `FOREIGN_IDENTITY_SERVICE_URL` points at `api/foreign-identity` and is used only when a registration request supplies `fin` instead of `documentNumber`.
- `FOREIGN_IDENTITY_SERVICE_USERNAME` and `FOREIGN_IDENTITY_SERVICE_PASSWORD` are the NIDA-style Basic Auth credentials used for internal FIN lookups. Use a dedicated service admin email as the username so `api/foreign-identity` can still resolve a real admin for audit logs.

## Integration Boundaries

- `app/app` is the main frontend consumer
- Other services validate tokens issued here but should not issue their own user JWTs
- `engine/` is internal-only and should only be called from this service
- `api/admin` shares the database but has its own JWT boundary and should stay isolated

## Important Rules

- This service owns shared schema migrations
- Never store NID/PID or refresh tokens in plain text
- Limited-token routes must be explicit
- A verified user with a stale limited session should be upgraded through `POST /auth/session/upgrade`, not forced to logout
- Verification images must be private, temporary, and deleted after engine processing
- Sensitive endpoints require throttling
- Prisma queries used in responses must select only safe fields

## Contribution Checklist

- Decide whether a route accepts full tokens only or limited tokens too
- Validate uploads, sizes, MIME types, and token type up front
- Preserve the distinction between auth issuance and auth validation
- Update `.env.example` when new required config is introduced

## Testing Rule

- If code is pure logic or can be mocked cleanly, add a unit test.
- If code depends on Nest bootstrapping, DB wiring, or HTTP flow, prefer e2e or integration tests.
