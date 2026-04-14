# Verification Contract

This document freezes the identity-verification contract before the frontend
flow is extracted into shared modules.

## Backend owner

- `api/auth`

## Endpoints

### `POST /api/v1/verification/submit`

Purpose:
- Runs the biometric identity verification flow.

Accepted token types:
- `limited`
- `full`

Request fields:
- `documentNumber`: 16-digit National ID number
- `idCard`: image file
- `selfie`: image file
- `challengeMode`: optional, `INVITATION`

Response shape:
- `success`
- `passed`
- `compositeScore`
- `faceScore`
- `livenessScore`
- `documentMatch`
- `message`
- `failReason`
- `attemptsUsed`
- `attemptsRemaining`
- `lockout`
- `idInfo`
- `upgradedTokens`
- `challengeMode`

Guaranteed semantics:
- `upgradedTokens` is present only when a non-ID-verified user passes.
- `challengeMode=INVITATION` records a fresh invitation challenge without
  weakening the normal account verification flow.
- `lockout.retryAvailableAt` and `lockout.retryAfterSeconds` are `null` unless
  the user has exhausted the windowed attempt budget.

### `GET /api/v1/verification/status`

Purpose:
- Returns the current verification state for rendering verification UI.

Accepted token types:
- `limited`
- `full`

Response shape:
- `isIdVerified`
- `attemptsUsed`
- `attemptsRemaining`
- `canAttempt`
- `lastAttemptAt`
- `lockout`

Guaranteed semantics:
- Attempt counting is based on the rolling 24-hour `id_verifications` window,
  not the cumulative `user.verificationAttempts` counter.
- `lockout` returns the same retry timing semantics as the submit response.

## Challenge modes

- `STANDARD`: normal account verification
- `INVITATION`: invitation-scoped biometric challenge after invitation email OTP

## Frontend obligations

- Never compute retry timing locally from assumptions.
- Use `lockout.retryAvailableAt` and `lockout.retryAfterSeconds` from the API.
- Treat `api/auth` as the source of truth for pass/fail/lockout decisions.
- Keep app-specific differences limited to copy, routing, and post-success
  behavior.
