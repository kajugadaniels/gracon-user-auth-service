// Centralises CORS configuration so it is not scattered across main.ts.
// Strict CORS is the complement to Helmet — Helmet sets headers the
// browser enforces, CORS controls which origins can call this API.
import { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';

/**
 * Expands one or more environment strings into a strict frontend origin allowlist.
 * Values may be a single origin or a comma-separated list, so the caller can
 * pass `FRONTEND_URL` and `FRONTEND_URLS` together.
 */
function parseAllowedOrigins(...values: Array<string | undefined>): string[] {
  return values
    .flatMap((value) => (value ?? '').split(','))
    .map((origin) => origin.trim())
    .filter(Boolean);
}

/**
 * Builds the CORS options for the auth service.
 *
 * The auth API is reached from multiple frontend origins (the user app
 * primarily, but the admin and documents apps also need session-recovery
 * proxies), so we accept a comma-separated `FRONTEND_URLS` allowlist
 * alongside the primary `FRONTEND_URL`. Wildcards are never permitted.
 *
 * `credentials: true` is required because the frontend sends the
 * session cookie (SameSite=Strict) alongside Bearer tokens.
 *
 * @param frontendUrl - Primary frontend origin (the user app).
 * @param frontendUrls - Optional comma-separated extra origins.
 * @returns Nest-compatible CorsOptions backed by a strict origin function.
 */
export function buildCorsConfig(
  frontendUrl: string,
  frontendUrls?: string,
): CorsOptions {
  const allowedOrigins = parseAllowedOrigins(frontendUrl, frontendUrls);

  return {
    // Strict origin function — explicit allowlist, no wildcards.
    origin(origin, callback) {
      // Same-origin or non-browser callers (no Origin header) are always allowed.
      if (!origin) {
        callback(null, true);
        return;
      }

      if (allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }

      callback(
        new Error(
          `Origin ${origin} is not allowed by auth service CORS policy.`,
        ),
        false,
      );
    },

    // Allow only the HTTP methods this API actually uses.
    // OPTIONS is required for preflight requests.
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],

    // Headers the frontend is allowed to send.
    // Content-Type and Authorization cover all our use cases.
    allowedHeaders: ['Content-Type', 'Authorization'],

    // Headers the frontend JavaScript is allowed to read from responses.
    // Retry-After is exposed so the frontend can handle 429s gracefully.
    exposedHeaders: ['Retry-After'],

    // Must be true — our frontend sends cookies (session_active)
    // alongside the Bearer token in the Authorization header.
    credentials: true,

    // How long (seconds) browsers cache the preflight response.
    // 24 hours avoids repeated OPTIONS requests in production.
    maxAge: 86_400,
  };
}
