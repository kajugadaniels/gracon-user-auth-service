// Centralises CORS configuration so it is not scattered across main.ts.
// Strict CORS is the complement to Helmet — Helmet sets headers the
// browser enforces, CORS controls which origins can call this API.
import { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';

/**
 * Builds the CORS options based on the allowed frontend origin.
 * Only the frontend URL from .env is permitted — no wildcards.
 *
 * credentials: true is required because the frontend sends the
 * session cookie (SameSite=Strict) alongside Bearer tokens.
 */
export function buildCorsConfig(frontendUrl: string): CorsOptions {
  return {
    // Only our own frontend can make credentialed requests.
    // In production this is the deployed app URL from .env.
    origin: frontendUrl,

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
