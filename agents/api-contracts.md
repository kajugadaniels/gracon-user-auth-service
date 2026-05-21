# api/auth API Contract Rules

This file defines controller, DTO, validation, and Swagger requirements.

## Controller Rules

- Every controller must use `@ApiTags`.
- Every endpoint must use `@ApiOperation`.
- Every endpoint must declare success and important failure responses with `@ApiResponse`.
- Endpoints accepting a request body must use `@ApiBody`.
- Protected endpoints must use `@ApiBearerAuth` and the correct guard.
- Rate-sensitive endpoints must use the appropriate throttling decorator.

## DTO Rules

- Every DTO property must use `@ApiProperty` or `@ApiPropertyOptional`.
- Every input DTO property must use class-validator decorators.
- Use enum DTO values when the API accepts a controlled vocabulary.
- Use `class-transformer` only where needed for query type coercion or safe trimming.

## Validation Rules

- Validate input close to the controller edge.
- Reject unknown input through the global validation pipe.
- Never trust client-provided user ids for authenticated-user ownership. Use `@CurrentUser()`.
- Never accept a user id in the body when the value should come from the JWT.

## Response Rules

- Do not return Prisma models directly from controllers.
- Use explicit response objects or DTOs.
- Select only required fields from Prisma.
- Do not expose hashed, encrypted, or internal metadata fields.
- User-facing error messages must be clear but not reveal internals.

## Swagger Access Rule

Swagger should be open in development and protected in production by the docs basic-auth middleware configured in `main.ts`.
