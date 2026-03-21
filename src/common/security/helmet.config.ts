// Helmet configuration for the ID Verification Platform.
// Each directive is documented with the attack it prevents.
// These settings are intentionally strict — we control every
// origin this API communicates with, so broad permissions
// are never needed.
import { HelmetOptions } from 'helmet';

/**
 * Builds the Helmet configuration object based on the environment.
 * Development relaxes CSP so Swagger UI assets load correctly.
 * Production enforces the full strict policy.
 */
export function buildHelmetConfig(env: string): HelmetOptions {
  const isProd = env === 'production';

  return {
    // ── Content-Security-Policy ───────────────────────────────────
    // Tells the browser which sources are allowed to load content.
    // Prevents XSS by blocking inline scripts and unauthorized origins.
    contentSecurityPolicy: isProd
      ? {
          directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'"],
            styleSrc: ["'self'"],
            imgSrc: ["'self'", 'data:', 'https:'],
            connectSrc: ["'self'"],
            fontSrc: ["'self'"],
            objectSrc: ["'none'"],
            mediaSrc: ["'none'"],
            frameSrc: ["'none'"],
            // Prevents embedding in iframes — stops clickjacking
            frameAncestors: ["'none'"],
            // Forces HTTPS for all subresource requests
            upgradeInsecureRequests: [],
          },
        }
      : {
          // Development — relax CSP so Swagger UI works
          // Swagger loads scripts and styles from its own bundle
          directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", 'data:', 'https:'],
            connectSrc: ["'self'"],
            objectSrc: ["'none'"],
            frameSrc: ["'none'"],
          },
        },

    // ── Cross-Origin-Embedder-Policy ──────────────────────────────
    // Prevents the page from loading cross-origin resources that
    // don't explicitly grant permission. Required for SharedArrayBuffer.
    crossOriginEmbedderPolicy: isProd ? { policy: 'require-corp' } : false, // disable in dev — breaks Swagger UI asset loading

    // ── Cross-Origin-Opener-Policy ────────────────────────────────
    // Isolates the browsing context — prevents cross-origin window
    // attacks like Spectre-based side-channel exploits.
    crossOriginOpenerPolicy: { policy: 'same-origin' },

    // ── Cross-Origin-Resource-Policy ─────────────────────────────
    // Prevents other sites from embedding our API responses.
    // "same-origin" means only our own frontend can load responses.
    crossOriginResourcePolicy: { policy: 'same-origin' },

    // ── DNS Prefetch Control ──────────────────────────────────────
    // Disables browser DNS prefetching — prevents leaking which
    // external services this API communicates with.
    dnsPrefetchControl: { allow: false },

    // ── Frameguard ────────────────────────────────────────────────
    // Sets X-Frame-Options: DENY — prevents the API responses from
    // being embedded in an iframe on another domain (clickjacking).
    frameguard: { action: 'deny' },

    // ── Hide Powered-By ──────────────────────────────────────────
    // Removes the X-Powered-By: Express header.
    // An attacker who knows the framework can target known CVEs.
    hidePoweredBy: true,

    // ── HTTP Strict Transport Security ───────────────────────────
    // Forces browsers to use HTTPS for all future requests to this domain.
    // maxAge: 1 year in seconds (HSTS preload lists require >= 1 year)
    // includeSubDomains: also applies to all subdomains
    // preload: signals readiness for HSTS preload list submission
    hsts: isProd
      ? {
          maxAge: 31_536_000,
          includeSubDomains: true,
          preload: true,
        }
      : false, // do not enforce HSTS in development (no HTTPS locally)

    // ── IE No Open ───────────────────────────────────────────────
    // Sets X-Download-Options: noopen — prevents Internet Explorer
    // from executing HTML in the context of the site on download.
    ieNoOpen: true,

    // ── No Sniff ─────────────────────────────────────────────────
    // Sets X-Content-Type-Options: nosniff — prevents browsers from
    // MIME-sniffing a response away from the declared Content-Type.
    // Stops browsers from treating a JSON response as executable HTML.
    noSniff: true,

    // ── Origin Agent Cluster ──────────────────────────────────────
    // Requests that the browser isolates this origin in its own
    // agent cluster — limits shared memory attacks between origins.
    originAgentCluster: true,

    // ── Permitted Cross-Domain Policies ──────────────────────────
    // Sets X-Permitted-Cross-Domain-Policies: none — prevents Adobe
    // Flash and Acrobat from loading cross-domain policy files.
    permittedCrossDomainPolicies: { permittedPolicies: 'none' },

    // ── Referrer Policy ──────────────────────────────────────────
    // Controls how much referrer information is sent with requests.
    // "no-referrer" means no Referer header is ever sent — prevents
    // leaking API paths or query parameters to third-party services.
    referrerPolicy: { policy: 'no-referrer' },

    // ── XSS Filter ───────────────────────────────────────────────
    // Sets X-XSS-Protection: 0 — intentionally DISABLES the old
    // browser XSS auditor. Modern guidance recommends disabling it
    // because it can introduce its own vulnerabilities.
    // CSP above provides the real XSS protection.
    xssFilter: false,
  };
}
