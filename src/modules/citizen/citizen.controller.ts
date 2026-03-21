import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { CitizenService } from './citizen.service';
import { LookupCitizenDto } from './dto/lookup-citizen.dto';
import { ThrottleAuth } from '../../common/decorators/throttle.decorator';

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
  async lookupCitizen(@Body() dto: LookupCitizenDto) {
    const citizenData = await this.citizenService.lookupCitizen(
      dto.documentNumber,
    );
    return { success: true, data: citizenData };
  }
}
