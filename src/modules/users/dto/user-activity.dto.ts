/**
 * DTOs for the authenticated user's immutable activity feed.
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

/**
 * Public activity categories exposed to the account settings UI.
 */
export enum UserActivityCategoryDtoValue {
  ALL = 'all',
  AUTHENTICATION = 'authentication',
  VERIFICATION = 'verification',
  ACCOUNT = 'account',
  SECURITY = 'security',
}

/**
 * Supported user activity ordering modes.
 */
export enum UserActivityOrderDtoValue {
  NEWEST = 'newest',
  OLDEST = 'oldest',
}

/**
 * Query parameters for the user activity endpoint.
 */
export class UserActivityQueryDto {
  @ApiPropertyOptional({
    example: 1,
    minimum: 1,
    default: 1,
    description: 'One-based page number. Defaults to the first page.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({
    example: 12,
    minimum: 1,
    maximum: 50,
    default: 12,
    description:
      'Number of activity rows to return per page. The settings UI uses 12; the API caps requests at 50.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  pageSize?: number = 12;

  @ApiPropertyOptional({
    enum: UserActivityCategoryDtoValue,
    default: UserActivityCategoryDtoValue.ALL,
    description:
      'Activity category filter. Use all to include every supported event type.',
  })
  @IsOptional()
  @IsEnum(UserActivityCategoryDtoValue)
  category?: UserActivityCategoryDtoValue = UserActivityCategoryDtoValue.ALL;

  @ApiPropertyOptional({
    enum: UserActivityOrderDtoValue,
    default: UserActivityOrderDtoValue.NEWEST,
    description: 'Sort order for the activity feed.',
  })
  @IsOptional()
  @IsEnum(UserActivityOrderDtoValue)
  order?: UserActivityOrderDtoValue = UserActivityOrderDtoValue.NEWEST;

  @ApiPropertyOptional({
    example: 'login',
    minLength: 2,
    maxLength: 80,
    description:
      'Optional case-insensitive search over safe activity labels, descriptions, categories, and event codes.',
  })
  @IsOptional()
  @IsString()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().slice(0, 80) : value,
  )
  search?: string;
}

/**
 * One read-only activity row returned to the user settings UI.
 */
export class UserActivityItemDto {
  @ApiProperty({
    example: '8a972f16-8894-4a4f-8b72-377d3c4f2b21',
    description: 'Immutable activity event identifier.',
  })
  id!: string;

  @ApiProperty({
    example: 'LOGIN_SUCCESS',
    description:
      'Internal security event code. Safe to expose because it contains no secret values.',
  })
  eventType!: string;

  @ApiProperty({
    enum: UserActivityCategoryDtoValue,
    example: UserActivityCategoryDtoValue.AUTHENTICATION,
    description: 'High-level activity category used for filtering.',
  })
  category!: Exclude<UserActivityCategoryDtoValue, UserActivityCategoryDtoValue.ALL>;

  @ApiProperty({
    example: 'Successful sign in',
    description: 'Human-readable activity title.',
  })
  title!: string;

  @ApiProperty({
    example: 'Your account was accessed with a valid password and session.',
    description: 'Safe user-facing explanation of the event.',
  })
  description!: string;

  @ApiProperty({
    example: 'success',
    enum: ['success', 'warning', 'danger', 'neutral'],
    description: 'Visual severity hint used by the frontend only.',
  })
  tone!: 'success' | 'warning' | 'danger' | 'neutral';

  @ApiProperty({
    example: '2026-05-21T09:32:10.000Z',
    description: 'UTC timestamp when the activity occurred.',
  })
  createdAt!: Date;

  @ApiPropertyOptional({
    example: '197.243.12.10',
    description:
      'IP address recorded by the auth service when available. This is shown for account transparency.',
    nullable: true,
  })
  ipAddress!: string | null;
}

/**
 * Pagination metadata for the activity feed.
 */
export class UserActivityPaginationDto {
  @ApiProperty({ example: 1, description: 'Current one-based page number.' })
  page!: number;

  @ApiProperty({ example: 12, description: 'Rows requested per page.' })
  pageSize!: number;

  @ApiProperty({ example: 84, description: 'Total matching activity rows.' })
  totalItems!: number;

  @ApiProperty({ example: 7, description: 'Total available pages.' })
  totalPages!: number;
}

/**
 * Paginated user activity response.
 */
export class UserActivityResponseDto {
  @ApiProperty({
    type: [UserActivityItemDto],
    description: 'Read-only activity rows for the current page.',
  })
  items!: UserActivityItemDto[];

  @ApiProperty({
    type: UserActivityPaginationDto,
    description: 'Pagination details for the current query.',
  })
  pagination!: UserActivityPaginationDto;
}
