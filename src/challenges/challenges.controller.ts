import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { ChallengesService } from './challenges.service';
import { CreateChallengeDto } from './dto/create-challenge.dto';
import { GenerateAiChallengeDto } from './dto/generate-ai-challenge.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { ChallengeCategory, ChallengeDifficulty, ChallengeType, Role } from '@prisma/client';

@ApiTags('Challenge Directory & AI Generator')
@Controller('challenges')
export class ChallengesController {
  constructor(private readonly challengesService: ChallengesService) {}

  @ApiOperation({
    summary: 'Mendapatkan daftar challenge riil dari mitra perusahaan',
  })
  @ApiQuery({
    name: 'category',
    enum: ChallengeCategory,
    required: false,
    description: 'Filter kategori keahlian',
  })
  @ApiQuery({
    name: 'difficulty',
    enum: ChallengeDifficulty,
    required: false,
    description: 'Filter tingkat kesulitan',
  })
  @ApiQuery({
    name: 'search',
    required: false,
    description: 'Pencarian judul atau deskripsi',
  })
  @ApiQuery({
    name: 'companyId',
    required: false,
    description: 'Filter berdasarkan ID perusahaan',
  })
  @ApiResponse({ status: 200, description: 'Daftar challenge aktif.' })
  @Get()
  async findAll(
    @Query('category') category?: ChallengeCategory,
    @Query('difficulty') difficulty?: ChallengeDifficulty,
    @Query('search') search?: string,
    @Query('companyId') companyId?: string,
  ) {
    return this.challengesService.findAll({
      category,
      difficulty,
      search,
      companyId,
    });
  }

  @ApiOperation({
    summary: 'Mendapatkan rincian studi kasus berdasarkan slug atau ID',
  })
  @ApiResponse({
    status: 200,
    description: 'Detail studi kasus lengkap beserta diskusi.',
  })
  @ApiResponse({ status: 404, description: 'Challenge tidak ditemukan.' })
  @Get(':slugOrId')
  async findOne(@Param('slugOrId') slugOrId: string) {
    return this.challengesService.findOne(slugOrId);
  }

  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Membuat challenge baru (Khusus Perusahaan & Admin & Talent)',
  })
  @ApiResponse({
    status: 201,
    description: 'Challenge berhasil dibuat dan diterbitkan.',
  })
  @ApiResponse({ status: 403, description: 'Akses ditolak.' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.COMPANY, Role.ADMIN, Role.TALENT)
  @Post()
  async create(
    @Request() req: any,
    @Body() createChallengeDto: CreateChallengeDto,
  ) {
    if (req.user.role === Role.TALENT) {
      return this.challengesService.createPublic(req.user.userId, createChallengeDto);
    } else {
      const companyId = req.user.profileId;
      return this.challengesService.create(companyId, createChallengeDto);
    }
  }

  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary:
      'Membuat studi kasus otomatis menggunakan AI Generatif (Prompt-to-Challenge)',
  })
  @ApiResponse({
    status: 201,
    description: 'Studi kasus draf berhasil dirumuskan oleh AI.',
  })
  @ApiResponse({ status: 403, description: 'Akses ditolak.' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.COMPANY, Role.ADMIN, Role.TALENT)
  @Post('ai-generate')
  async generateAiChallenge(
    @Request() req: any,
    @Body() dto: GenerateAiChallengeDto,
  ) {
    if (req.user.role === Role.TALENT) {
      return this.challengesService.generateAiPublicChallenge(req.user.userId, dto);
    } else {
      const companyId = req.user.profileId;
      return this.challengesService.generateAiChallenge(companyId, dto);
    }
  }
}
