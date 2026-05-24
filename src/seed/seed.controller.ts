import { Controller, Post, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { SeedService } from './seed.service';

@ApiTags('Data Seeding & Demo')
@Controller('seed')
export class SeedController {
  constructor(private readonly seedService: SeedService) {}

  @ApiOperation({
    summary:
      'Mempopulasi database dengan data sampel (Perusahaan, Talenta, Challenge, Portofolio)',
  })
  @ApiResponse({ status: 200, description: 'Seeding berhasil dijalankan.' })
  @HttpCode(HttpStatus.OK)
  @Post()
  async seed() {
    return this.seedService.seed();
  }
}
