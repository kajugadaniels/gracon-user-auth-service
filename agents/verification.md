# api/auth Verification Rules

This file covers ID-card, selfie, and invitation-driven identity verification.

## Ownership

- `app/app` owns the identity-verification UI.
- `api/auth` owns the verification API, attempt limits, engine calls, and verification status.
- `engine/` is internal-only and must not be exposed to browsers.

## Engine Boundary

- Calls to `engine/` must use internal trust such as `X-Engine-API-Key`.
- Uploaded verification files must be private and temporary.
- Delete temporary files after engine processing.
- Do not log image data, biometric data, or full engine payloads.

## Attempt Rules

- Verification attempt lockout must use environment-backed configuration.
- `VERIFICATION_ATTEMPT_WINDOW_HOURS=0` means repeated verification is allowed for controlled development or test flows.
- Endpoint throttling still applies even when business lockout is disabled.

## Redirect Rules

- Verification return URLs must use exact-origin allowlisting.
- Documents and meetings may send users to `app/app` for verification and return via a safe `next` URL.
- Invalid or foreign `next` values must fall back to a safe local route.

## Invitation Rules

- Document and meeting invitation acceptance can require email OTP, identity verification, neither, or both.
- `api/auth` proves identity status; downstream services enforce whether proof is required for their invitation.
- Do not duplicate verification logic in documents or meetings backends.
