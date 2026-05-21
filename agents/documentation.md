# api/auth Documentation Rules

This file explains what must be updated when `api/auth` changes.

## Always Update

- Update `README.md` when ownership, architecture, commands, routes, or important behavior changes.
- Update `.env.example` when adding, renaming, or changing an environment variable.
- Update Swagger decorators when adding or changing API endpoints.
- Update `docs/` when changing an integration contract such as verification, sessions, or cross-app redirects.

## Root Guide Updates

Update `../../AGENTS.md` only when the change affects the cross-project picture:

- service boundaries
- shared secrets
- shared schema ownership
- cross-app authentication
- meetings/documents verification handoff
- new deployable services or apps

## Local Agent Guide Updates

Update files in `agents/` when the rules for future AI work change. Keep these files concise and task-oriented.

## Environment Documentation

Every new environment variable in `.env.example` must include:

- what it controls
- whether it is required
- a safe local example
- generation instructions when it is a secret

Never put real or realistic-looking secrets in examples.
