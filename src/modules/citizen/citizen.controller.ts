import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { CitizenService } from './citizen.service';
import { LookupCitizenDto } from './dto/lookup-citizen.dto';
import { CitizenData } from './interfaces/citizen-api-response.interface';

// This endpoint is called by the frontend registration form
// when the user enters their NID number — it pre-fills their info
// Route: POST /api/v1/citizen/lookup
@Controller('citizen')
export class CitizenController {
  constructor(private readonly citizenService: CitizenService) {}

  @Post('lookup')
  @HttpCode(HttpStatus.OK) // return 200, not 201, since we're looking up not creating
  async lookupCitizen(@Body() dto: LookupCitizenDto): Promise<{
    success: boolean;
    data: CitizenData;
  }> {
    const citizenData = await this.citizenService.lookupCitizen(
      dto.documentNumber,
    );

    // Return only the clean CitizenData — never return raw API response to frontend
    return {
      success: true,
      data: citizenData,
    };
  }
}
