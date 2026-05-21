# api/auth Testing Rules

This file explains when tests are required and which commands to run.

## When To Add Tests

- Add unit tests for pure helpers and normalization logic.
- Add regression tests for auth/session recovery, token cleanup, redirect safety, and verification routing.
- Add tests for security-sensitive edge cases: token reuse, limited-token restrictions, lockout behavior, and unsafe redirects.
- Prefer integration or e2e tests for flows that depend on Nest bootstrapping, guards, Prisma, or HTTP behavior.

## Test Style

- Test behavior, not implementation details.
- Mock external services such as mail, S3, citizen lookup, foreign identity lookup, and engine calls.
- Do not use real secrets or real biometric data in tests.
- Keep test fixtures explicit and minimal.

## Required Validation

Before reporting a code-changing task complete, run the most relevant command:

```bash
npm run build
npm run test
npm run test:e2e
```

For docs-only changes, a build is not required. Say clearly that the change was docs-only.

## Prisma Validation

If the Prisma schema changes, run or ask the user to run the appropriate Prisma validation/generation flow. Do not run migrations automatically.
