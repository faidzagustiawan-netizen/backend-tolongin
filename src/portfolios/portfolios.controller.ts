import { Controller, DefaultValuePipe, Get, ParseIntPipe, Query } from '@nestjs/common';
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
    // Query param selalu tiba sebagai string. Tanpa pipe ini nilainya diteruskan
    // apa adanya ke Prisma `take` dan bisa menolak atau meloloskan angka liar.
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit = 20,
  ) {
    return this.portfoliosService.getPublicPortfolios({
      search,
      skill,
      limit: Math.min(100, Math.max(1, limit)),
    });
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
  async getLeaderboard(
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit = 10,
  ) {
    return this.portfoliosService.getLeaderboard(
      Math.min(100, Math.max(1, limit)),
    );
  }
}
