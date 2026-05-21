# api/auth Auth and Session Rules

This file covers login, token issuance, refresh, logout, and cross-app session behavior.

## Ownership

- `api/auth` issues user access and refresh tokens.
- `api/auth` validates and rotates refresh tokens.
- User-domain services validate tokens but do not issue them.
- Admin token issuance stays in `api/admin` and must not share user-token trust.

## Token Types

- Full tokens grant normal authenticated access.
- Limited tokens are for staged flows such as email-verified but identity-incomplete users.
- A route that accepts limited tokens must declare that explicitly.
- Do not accidentally allow limited tokens on full-token endpoints.

## Refresh Rules

- Refresh tokens must be stored hashed.
- Refresh rotation should revoke the used token and issue a new one.
- Reuse of revoked refresh tokens must be treated as a security event.
- Parallel app calls should not force unnecessary logout when a safe single-flight recovery path exists.

## Logout Rules

- Logout must revoke the active refresh-token state.
- Logout-all must revoke active sessions across devices.
- Cross-app logout must clear shared session cookies through the owning frontend route.

## Cross-App Session Rules

- Development can preserve the legacy readable-cookie compatibility path where explicitly enabled.
- Production must rely on `HttpOnly`, `Secure`, parent-domain cookies for credentials.
- `session_active` is a non-sensitive hint, never proof of auth.
- Cross-app redirect targets must be exact-origin allowlisted.
- Never preserve `/logout` as a login `next` value.
