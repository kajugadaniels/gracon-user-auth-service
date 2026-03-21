import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBody,
  ApiResponse,
} from '@nestjs/swagger';
import { CitizenService } from './citizen.service';
import { LookupCitizenDto } from './dto/lookup-citizen.dto';
import { ThrottleAuth } from '../../common/decorators/throttle.decorator';

@ApiTags('Citizen')
@Controller('citizen')
export class CitizenController {
  constructor(private readonly citizenService: CitizenService) {}

  /**
   * POST /api/v1/citizen/lookup
   * Auth limit: 5 per minute.
   * Prevents mass NID enumeration — each lookup hits an external API
   * and carries a cost. Strict limit protects both security and cost.
   */
  @Post('lookup')
  @ThrottleAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Look up a citizen record by National ID number',
    description:
      'Queries the national citizen database for the citizen record associated with a 16-digit Rwanda National ID (NID). ' +
      'Used by the registration form to pre-fill identity fields (name, sex, date of birth) ' +
      'before the user submits their account details.\n\n' +
      '**Caching:** Responses are cached in-memory for **5 minutes** per NID ' +
      '(keyed on a SHA-256 hash of the NID, not the raw number). ' +
      'A cache hit returns instantly without contacting the external citizen API.\n\n' +
      '**External API timeout:** 10 seconds. Requests that exceed this threshold return a 503.\n\n' +
      '**Security note:** The external API is called server-side only — credentials (Basic Auth header) ' +
      'are never exposed to the browser. The raw NID is never logged.\n\n' +
      '**Only 8 fields are extracted** from the full citizen record; all other fields returned by the ' +
      'external API are discarded before the response is sent.\n\n' +
      '**Rate limit:** 5 requests per minute per IP address. Each cache miss triggers an external API call ' +
      'with an associated cost, so this limit is intentionally strict.',
  })
  @ApiBody({ type: LookupCitizenDto })
  @ApiResponse({
    status: 200,
    description: 'Citizen record found and returned successfully.',
    schema: {
      example: {
        success: true,
        data: {
          documentType: 'NATIONAL_ID',
          nid: '1199901234567890',
          surName: 'KWIZERA',
          postNames: 'Gervais',
          sex: 'M',
          dateOfBirth: '1999-06-14T00:00:00.000Z',
          countryOfBirth: 'Rwanda',
        },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description:
      'NID format is invalid (not exactly 16 digits, or contains non-digit characters) ' +
      'or no citizen record was found for the provided NID.',
    schema: {
      example: {
        statusCode: 400,
        message: 'No citizen record found for the provided National ID number.',
      },
    },
  })
  @ApiResponse({
    status: 503,
    description:
      'The external citizen database API did not respond within 10 seconds or returned an unexpected error. ' +
      'Retry after a short delay.',
    schema: {
      example: {
        statusCode: 503,
        message: 'The citizen database is temporarily unavailable. Please try again.',
      },
    },
  })
  @ApiResponse({
    status: 429,
    description: 'Rate limit exceeded — more than 5 lookup requests per minute from this IP address.',
    schema: {
      example: {
        statusCode: 429,
        message: 'ThrottlerException: Too Many Requests',
      },
    },
  })
  async lookupCitizen(@Body() dto: LookupCitizenDto) {
    const citizenData = await this.citizenService.lookupCitizen(
      dto.documentNumber,
    );
    return { success: true, data: citizenData };
  }
}
