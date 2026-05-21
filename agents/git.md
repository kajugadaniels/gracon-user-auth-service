# api/auth Git Rules

Codex must never run git commands automatically.

Present commands for the developer to copy and run.

## Path Rule

All paths must be relative to the `api/auth` project root.

Correct:

```bash
git add "src/modules/users/users.service.ts"
git commit -m "feat(users): add read-only activity feed"
```

Wrong:

```bash
git add "api/auth/src/modules/users/users.service.ts"
git commit -m "feat(users): add read-only activity feed"
```

## Commit Rules

- One file per `git add`.
- Never use `git add .`.
- Never use `git add -A`.
- Never include `cd api/auth`.
- Never run `git push`.
- Use Conventional Commits.
- Keep one logical change per commit.

## Common Scopes

- `auth` for login, refresh, logout, token issuance, and password reset.
- `users` for profile, preferences, user activity, and account operations.
- `verification` for ID verification and engine-backed verification flow.
- `guards` for auth guards and throttling guards.
- `prisma` for schema, migrations, and seed files.
- `mailer` for transactional email templates and delivery.
- `security` for hardening, logs, token reuse, and sensitive-data protection.
- `docs` for Markdown or Swagger-only documentation updates.
