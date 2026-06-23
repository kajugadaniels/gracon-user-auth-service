# API Auth

Primary identity and authentication backend for the Gracon platform.

This service owns user registration, login, email verification, password reset, refresh-token rotation, citizen lookup, profile management, and AI-backed identity verification. Every other protected backend trusts tokens issued here.

## Overview

- Runtime: NestJS + TypeScript
- Default port: `3000`
- Database access: shared Neon/Postgres via Prisma
- Primary consumers: `app/app`, selective validation from other APIs
- Special role: source of truth for user JWT issuance and user identity/session behavior

First clone database setup:
[docs/database-setup.md](./docs/database-setup.md)

## What This Service Owns

- User registration and login
- Registration via Rwanda NID or Foreign Identity Number (FIN)
- Full and limited JWT issuance
- Refresh-token rotation and revocation
- Email verification and password reset
- Profile read/update
- Read-only user activity feed backed by immutable security-event logs
- Citizen lookup integration
- Foreign identity lookup integration for FIN-backed registration
- ID + selfie verification workflow via the internal engine
- Security-event capture and token cleanup background work
- Shared persistence for personal certificate requests that must be approved before `api/signature` issues a real certificate
- Shared admin-audit enum values for certificate-request approval and rejection actions emitted by `api/admin`
- Shared persistence for per-user certificate access policy, so revocation history and hard certificate bans stay separate
- Shared persistence for Gracon meetings data used by `api/meetings`; schema migrations belong to `api/database`
- Shared persistence for user-level invitation defaults consumed by `app/documents` and `app/meetings`
- User-facing account activity is served from `SecurityEventLog` through a presentation-safe read-only endpoint. Do not expose raw event metadata to frontend apps.

## Core Skills Needed

- NestJS authentication and authorization patterns
- Prisma query discipline and shared database-client usage
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
    users/          profile, preferences, activity feed, and account operations
    verification/   ID verification submission and result handling
```

## Folder Structure

```text
api/auth/
  agents/
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

## AI Agent Rules

Project-specific AI execution rules live in [`agents/README.md`](./agents/README.md).
Read that guide before changing auth, sessions, verification, database access,
security-sensitive flows, or user/account APIs. These local rules supplement
the monorepo root `AGENTS.md`; they do not override platform-wide security,
service-boundary, or git-command rules.

## Local Commands

```bash
npm install
npm run start:dev
npm run build
npm run test
npm run lint
npm run seed:verified-users
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
VERIFICATION_ATTEMPT_WINDOW_HOURS=24
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
- `VERIFICATION_ATTEMPT_WINDOW_HOURS` controls the business lockout window for ID-card + face verification attempts. The default is `24`; set it to `0` only in local development or controlled test environments when repeated verification attempts are needed. Endpoint throttling still remains active.

## Development Fake Verified Users

`api/auth` owns the fake verified user seed because this service owns user registration, login, password hashing, and encrypted NID/PID persistence behavior. Do not seed login-ready users from `api/institution` or another consumer service.

The fake verified user seed creates 100 Rwandan, login-ready users for local development or controlled test databases:

- shared password: `Password!7`
- `isVerified=true`
- `isActive=true`
- `isIdVerified=true`
- encrypted NID and PID values
- hashed NID and PID lookup values
- Gmail-style addresses based on generated names
- Rwandan phone numbers using `+25078`, `+25072`, or `+25073`

The seed is intentionally separate from `api/database` database-owned seeds. Run fake users explicitly:

```bash
ALLOW_FAKE_VERIFIED_USERS_SEED=true npm run seed:verified-users
```

Safety rules:

- `ALLOW_FAKE_VERIFIED_USERS_SEED=true` is required or the script exits before connecting to the database.
- `APP_ENV=production` also requires `ALLOW_PRODUCTION_FAKE_VERIFIED_USERS_SEED=true`.
- Production use should only happen in an approved disposable production-like test environment, never against the real production user database.
- The script is idempotent by generated NID hash; rerunning it skips users already created by the same seed identity set.
- Existing emails and phone numbers are loaded first so generated contact details do not collide with current development data.

## Integration Boundaries

- `app/app` is the main frontend consumer
- Other services validate tokens issued here but should not issue their own user JWTs
- `engine/` is internal-only and should only be called from this service
- `api/admin` shares the database but has its own JWT boundary and should stay isolated

## Important Rules

- Shared schema migrations belong to `api/database`
- Meeting table changes must be made in `api/database/prisma/schema.prisma` first, then propagated to meeting consumers during the generated-client migration
- Cross-platform user preference behavior belongs here, but schema changes for those settings start in `api/database`. Documents and meetings consume those settings as UI defaults but still enforce their own backend invitation gates.
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

## User Preferences

`api/auth` owns the `user_preferences` table because invitation defaults follow
the user across Gracon frontends. The first settings are intentionally small:

- `defaultDocumentInviteVerifications`
- `defaultMeetingInviteVerifications`

Both fields use `UserInviteVerificationPreference[]` and default to
`[NO_VERIFICATION]`. `NO_VERIFICATION` is exclusive; the service rejects any
request that combines it with `EMAIL_OTP` or `IDENTITY_VERIFICATION`.

Implemented endpoints:

- `GET /api/v1/users/preferences` returns saved preferences or the no-verification defaults when no row exists yet.
- `PATCH /api/v1/users/preferences` updates one or both preference fields.

These settings only preselect invite-dialog UI in `app/documents` and
`app/meetings`. They never bypass downstream document or meeting access checks.

## Testing Rule

- If code is pure logic or can be mocked cleanly, add a unit test.
- If code depends on Nest bootstrapping, DB wiring, or HTTP flow, prefer e2e or integration tests.
