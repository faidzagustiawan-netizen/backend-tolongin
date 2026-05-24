import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { PortfoliosService } from './portfolios.service';

@ApiTags('Showcase & Gamification Leaderboard')
@Controller()
export class PortfoliosController {
  constructor(private readonly portfoliosService: PortfoliosService) {}

  @ApiOperation({
    summary:
      'Mendapatkan etalase portofolio publik dari hasil penyelesaian challenge',
  })
  @ApiQuery({
    name: 'search',
    required: false,
    description: 'Pencarian kata kunci',
  })
  @ApiQuery({
    name: 'skill',
    required: false,
    description: 'Filter keahlian spesifik',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: 'Batas jumlah hasil (default 20)',
  })
  @ApiResponse({
    status: 200,
    description: 'Daftar portofolio terverifikasi.',
  })
  @Get('portfolios')
  async getPublicPortfolios(
    @Query('search') search?: string,
    @Query('skill') skill?: string,
    @Query('limit') limit?: number,
  ) {
    return this.portfoliosService.getPublicPortfolios({ search, skill, limit });
  }

  @ApiOperation({
    summary:
      'Mendapatkan papan peringkat (Leaderboard) talenta berdasarkan XP & Gamifikasi',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: 'Batas peringkat teratas (default 10)',
  })
  @ApiResponse({
    status: 200,
    description: 'Papan peringkat talenta terbaik.',
  })
  @Get('leaderboard')
  async getLeaderboard(@Query('limit') limit?: number) {
    return this.portfoliosService.getLeaderboard(limit ?? 10);
  }
}
