# Auth Service

> Part of the ID Verification Platform microservice architecture.
> Handles all user-facing authentication, registration, and identity
> verification flows.

---

## What This Service Does

This service is the primary gateway between the user-facing application
and the platform's data layer. It is responsible for:

- **User registration with National ID** — validates a citizen's identity
  against the national registry API before creating an account
- **Email verification** — issues time-limited tokens, confirms ownership
  of the registered email address before activating the account
- **AI-powered ID face verification** — orchestrates the full biometric
  verification flow: captures ID card photo and selfie, sends them to the
  AI engine for face comparison and liveness detection, stores the audit
  result, and upgrades the user's access token upon passing
- **JWT authentication** — issues short-lived access tokens (15 min) and
  long-lived refresh tokens (30 days) with full rotation support
- **Password management** — bcrypt-hashed storage, secure reset flow via
  email with 1-hour expiring tokens, password change with session revocation
- **Profile management** — profile updates, profile image upload to AWS S3
  with presigned URL serving

This service does **not** handle admin operations. Those are handled by
the Admin Service (`api/admin/`).

---

## Architecture Position
```
app/app (Next.js)
      │
      ▼
api/auth (this service — port 3000)
      │                    │
      ▼                    ▼
Neon Postgres         engine/ (FastAPI — port 8000)
                      AWS Rekognition
                      AWS S3
```

The user frontend communicates exclusively with this service.
This service communicates with the AI engine for verification,
AWS S3 for image storage, and Neon Postgres for all persistent data.

---

## Key Security Properties

- National ID numbers (NIDs) are **AES-256-CBC encrypted** before storage
  and never returned in plain text in any API response
- Platform IDs (PIDs) follow the same encryption scheme
- Passwords are **bcrypt hashed** with 12 rounds — never stored plain
- Refresh tokens are stored as **SHA-256 hashes** — the raw token only
  exists in the HTTP response at issuance time
- Verification images are **never stored permanently** — uploaded to S3
  temporarily, passed to Rekognition, deleted immediately after scoring
- All sensitive endpoints are **rate limited** — login and registration
  allow 5 attempts per minute, verification and password changes allow
  3 attempts per 10 minutes
- API documentation (`/docs`, `/redoc`) is protected by **basic auth**
  in production and disabled from public access

---

## Token System

This service issues two token types:

| Type | Expiry | Purpose |
|---|---|---|
| `full` | 15 minutes | Full access — all protected routes |
| `limited` | 2 hours | Issued after email verification, before ID verification — only reaches `/verification/*` routes |

After a user passes ID verification, the limited token is automatically
upgraded to a full token without requiring a second login.

---

## Tech Stack

| Concern | Technology |
|---|---|
| Framework | NestJS (TypeScript) |
| Database ORM | Prisma |
| Database | Neon Postgres (PostgreSQL) |
| Authentication | Passport.js + JWT |
| Image storage | AWS S3 |
| AI verification | AWS Rekognition via FastAPI engine |
| Email | Nodemailer + Handlebars templates |
| Validation | class-validator + class-transformer |
| Rate limiting | @nestjs/throttler |
| Security headers | helmet |
| API docs | Swagger / OpenAPI |

---

## Environment Variables

Copy `.env.example` to `.env` and fill in all values before running.
```bash
cp .env.example .env
```

See `.env.example` for the full list with generation instructions for
secrets.

---

## Running Locally
```bash
# Install dependencies
npm install

# Generate Prisma client
npx prisma generate

# Run database migrations (only this service runs migrations)
npx prisma migrate dev

# Start in development mode (hot reload)
npm run start:dev

# Start in production mode
npm run start:prod
```

Service will be available at: `http://localhost:3000/api/v1`
API documentation: `http://localhost:3000/docs`

---

## Running in Production
```bash
npm run build
node dist/main.js
```

In production:
- Set `APP_ENV=production` in `.env`
- Set `DOCS_BASIC_AUTH_USER` and `DOCS_BASIC_AUTH_PASS` to protect `/docs`
- Ensure `FRONTEND_URL` matches the deployed user app URL exactly

---

## Related Services

| Service | Location | Purpose |
|---|---|---|
| Admin Service | `api/admin/` | Admin operations, user management |
| AI Engine | `engine/` | Face comparison, liveness detection |
| User App | `app/app/` | User-facing Next.js frontend |
| Admin App | `app/admin/` | Admin Next.js dashboard |
```

---

**Git command for the README:**
```
git add "api/auth/README.md"
git commit -m "docs(auth): add professional README explaining auth service purpose, architecture, and setup"