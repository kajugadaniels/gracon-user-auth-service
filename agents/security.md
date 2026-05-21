# api/auth Security Rules

`api/auth` is the issuer and verifier source for user identity. Treat every change as security-sensitive until proven otherwise.

## Non-Negotiable Rules

- Never hardcode secrets, credentials, API keys, tokens, or private material.
- Never store passwords, refresh tokens, reset tokens, invitation tokens, NIDs, PIDs, FINs, or private keys in plain text.
- Hash lookup tokens and identifiers before persistence.
- Encrypt sensitive identifiers that must be recoverable.
- Use constant-time comparison for token and secret equality checks.
- Do not expose raw security-event metadata to frontends.
- Do not log biometric data, NID, FIN, PID, raw tokens, passwords, private keys, or full request bodies from sensitive endpoints.

## Token Rules

- `api/auth` issues user JWTs.
- Other user-domain services validate JWTs; they do not mint user tokens.
- Full-token and limited-token flows must remain explicit.
- Refresh token rotation must preserve reuse detection.
- Logout and logout-all must revoke server-side refresh-token state.

## Identity Data Rules

- NID, FIN, and PID values must be encrypted or hashed depending on whether they need recovery or lookup.
- Do not return encrypted values to clients.
- Do not add new endpoints that reveal identity identifiers unless the service already owns a safe display contract.

## Rate Limit and Abuse Rules

- Login, password reset, password change, resend verification, registration, and identity verification endpoints require throttling.
- If an endpoint changes risk level, review throttling.
- Account lockout and verification-attempt windows must be configurable where already designed that way.

## Log and Audit Rules

- Security events are production artifacts.
- Event logs may record event type, user id, timestamp, IP, and limited operational context.
- User-facing activity must map logs to safe descriptions instead of exposing raw metadata.

## Cross-Service Rules

- Do not expose the engine publicly.
- `api/auth` calls `engine/` using internal trust only.
- Do not introduce direct frontend calls to the engine.
- Do not let admin JWT trust overlap with user JWT trust.
