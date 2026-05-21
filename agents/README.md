# api/auth Agent Guide

This directory contains project-local execution rules for AI agents working in `api/auth`.

Use these files as a focused supplement to the platform rules, not a replacement for them.

## Reading Order

1. Read `../../AGENTS.md`.
2. Read `../README.md`.
3. Read this file.
4. Read the topic file that matches the task.
5. Inspect the actual source code before editing.

## Topic Files

- [folder-structure.md](./folder-structure.md) — where new modules, DTOs, helpers, tests, and docs belong.
- [file-structure.md](./file-structure.md) — naming, comments, exported API shape, and TypeScript style.
- [security.md](./security.md) — secrets, identifiers, tokens, logs, rate limits, and abuse-case rules.
- [api-contracts.md](./api-contracts.md) — controller, DTO, Swagger, validation, and response-contract rules.
- [database-prisma.md](./database-prisma.md) — Prisma ownership, migrations, indexes, selects, and sensitive columns.
- [auth-session.md](./auth-session.md) — login, refresh, logout, token types, and cross-app session behavior.
- [verification.md](./verification.md) — identity verification, engine boundary, attempts, uploads, and redirects.
- [testing.md](./testing.md) — when to add tests and which commands to run.
- [git.md](./git.md) — copy-paste commit command format for this project.
- [documentation.md](./documentation.md) — README, `.env.example`, Swagger, and root-guide update rules.

## Scope

These rules apply only inside `api/auth`. If a change touches another service or app, read that project's README and agent guide too.

## Conflict Rule

If a local rule conflicts with `../../AGENTS.md`, the root guide wins. Update the local rule instead of working around the conflict.

## Completion Rule

Before reporting completion, state:

- which topic files were relevant
- whether this was docs-only or code-changing
- which build/test/typecheck command was run, or why it was not necessary
