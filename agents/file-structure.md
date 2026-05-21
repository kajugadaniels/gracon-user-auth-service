# api/auth File Structure Rules

This file defines how TypeScript files in `api/auth` should be written.

## Required File Shape

- Every file must start with a short top-level comment explaining its purpose.
- Every exported class, function, enum, and interface must have JSDoc.
- Every controller method and service public method must have JSDoc.
- Complex business logic must include short comments explaining why the logic exists.
- Security-sensitive code must explain the abuse case it prevents.

## Naming Rules

- Files use `kebab-case.ts`.
- Classes, DTOs, and interfaces use `PascalCase`.
- Functions, variables, and methods use `camelCase`.
- Constants use `UPPER_SNAKE_CASE`.
- Test files use `*.spec.ts`.

## TypeScript Rules

- Do not use `any`.
- Prefer `unknown` plus narrowing for untrusted data.
- Prefer `const` unless reassignment is required.
- Keep functions small and single-purpose.
- Return explicit DTOs or interfaces from public service methods.
- Do not return raw Prisma records directly from controllers.

## Comment Rules

- Comments should explain why, not repeat what the code says.
- Delete commented-out code.
- Do not leave TODO placeholders unless the user explicitly asks for staged work.
- If a security decision is temporary, document the condition that allows it and when it must be removed.

## Error Handling

- Never swallow errors silently.
- Log operational failures with Nest `Logger`, not `console.log`.
- Do not leak internal error detail to API clients.
- Use Nest exceptions with clear, user-safe messages.
