import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiOkResponse,
  ApiBadRequestResponse,
  ApiNotFoundResponse,
  ApiServiceUnavailableResponse,
  ApiGatewayTimeoutResponse,
} from '@nestjs/swagger';
import { CitizenService } from './citizen.service';
import { LookupCitizenDto } from './dto/lookup-citizen.dto';
import { CitizenData } from './interfaces/citizen-api-response.interface';

@ApiTags('Citizen')
@Controller('citizen')
export class CitizenController {
  constructor(private readonly citizenService: CitizenService) {}

  @Post('lookup')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Look up a citizen by National ID number',
    description: `Queries the national citizen database using the provided 16-digit NID and returns the citizen's identity data.

**Use case:** Called by the registration form after the user enters their NID — the response pre-fills their name, date of birth, and other personal details automatically.

**Security:** The raw NID is never logged or returned in error messages. Only the last 4 digits appear in error responses for identification purposes.

**Caching:** Successful lookups are cached for 5 minutes. Repeated requests for the same NID within that window are served from cache without hitting the external API.`,
  })
  @ApiOkResponse({
    description: 'Citizen found. Returns cleaned identity data.',
    schema: {
      example: {
        success: true,
        data: {
          documentType: 'NID',
          nid: '1199880012345678',
          surName: 'UWASE',
          postNames: 'Amani Grace',
          sex: 'F',
          dateOfBirth: '1998-04-15T00:00:00.000Z',
          countryOfBirth: 'Rwanda',
        },
      },
    },
  })
  @ApiBadRequestResponse({
    description: 'The NID format is invalid (not exactly 16 digits).',
    schema: {
      example: {
        statusCode: 400,
        error: 'Invalid Document',
        message: 'The provided National ID number is invalid.',
      },
    },
  })
  @ApiNotFoundResponse({
    description: 'No citizen found for the given NID.',
    schema: {
      example: {
        statusCode: 404,
        error: 'Citizen Not Found',
        message: 'No citizen found for document ending in ...5678',
      },
    },
  })
  @ApiServiceUnavailableResponse({
    description: 'The national ID verification service is temporarily down.',
    schema: {
      example: {
        statusCode: 503,
        error: 'Citizen API Unavailable',
        message:
          'National ID verification service is temporarily unavailable. Please try again later.',
      },
    },
  })
  @ApiGatewayTimeoutResponse({
    description: 'The national ID verification service did not respond in time.',
    schema: {
      example: {
        statusCode: 504,
        error: 'Citizen API Timeout',
        message:
          'National ID verification service timed out. Please try again.',
      },
    },
  })
  async lookupCitizen(@Body() dto: LookupCitizenDto): Promise<{
    success: boolean;
    data: CitizenData;
  }> {
    const citizenData = await this.citizenService.lookupCitizen(
      dto.documentNumber,
    );
    return {
      success: true,
      data: citizenData,
    };
  }
}
