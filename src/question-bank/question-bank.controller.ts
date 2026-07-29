import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { QuestionBankService } from './question-bank.service';
import {
  CreateQuestionBankItemDto,
  QueryQuestionBankDto,
  QuestionBankScope,
  UpdateQuestionBankItemDto,
} from './dto/question-bank.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { ChallengeCategory, ChallengeDifficulty, Role } from '@prisma/client';

@ApiTags('Bank Soal')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.COMPANY, Role.ADMIN, Role.TALENT)
@Controller('question-bank')
export class QuestionBankController {
  constructor(private readonly questionBankService: QuestionBankService) {}

  @ApiOperation({
    summary: 'Menelusuri bank soal yang bisa dipungut ke dalam tahapan ujian',
  })
  @ApiQuery({
    name: 'scope',
    enum: QuestionBankScope,
    required: false,
    description: 'PLATFORM, MINE, atau ALL (bawaan)',
  })
  @ApiQuery({ name: 'category', enum: ChallengeCategory, required: false })
  @ApiQuery({ name: 'difficulty', enum: ChallengeDifficulty, required: false })
  @ApiQuery({
    name: 'skillIds',
    required: false,
    description: 'Id skill dipisah koma; cocok bila membawa salah satunya',
  })
  @ApiResponse({ status: 200, description: 'Daftar soal beserta penandanya.' })
  @Get()
  async findAll(@Query() query: QueryQuestionBankDto, @Request() req: any) {
    return this.questionBankService.findAll(query, req.user);
  }

  @ApiOperation({
    summary: 'Penanda topik yang benar-benar terpakai, beserta jumlah soalnya',
  })
  // Rute statis didaftarkan sebelum `:id`; kalau tidak, "tags" akan ditangkap
  // sebagai id soal dan permintaannya selalu berakhir 404.
  @Get('tags')
  async findTags(@Request() req: any, @Query('scope') scope?: string) {
    return this.questionBankService.findTags(
      req.user,
      (scope as QuestionBankScope) ?? QuestionBankScope.ALL,
    );
  }

  @ApiOperation({ summary: 'Rincian satu soal di bank' })
  @ApiResponse({ status: 404, description: 'Soal tidak ditemukan.' })
  @Get(':id')
  async findOne(@Param('id') id: string, @Request() req: any) {
    return this.questionBankService.findOne(id, req.user);
  }

  @ApiOperation({
    summary:
      'Menyimpan soal ke bank (perusahaan ke koleksi pribadi, admin ke bank platform)',
  })
  @ApiResponse({ status: 201, description: 'Soal tersimpan.' })
  @ApiResponse({ status: 403, description: 'Akses ditolak.' })
  @Roles(Role.COMPANY, Role.ADMIN)
  @Post()
  async create(@Body() dto: CreateQuestionBankItemDto, @Request() req: any) {
    return this.questionBankService.create(dto, req.user);
  }

  @ApiOperation({ summary: 'Memperbarui soal milik sendiri' })
  @ApiResponse({ status: 403, description: 'Bukan pemilik soal.' })
  @Roles(Role.COMPANY, Role.ADMIN)
  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateQuestionBankItemDto,
    @Request() req: any,
  ) {
    return this.questionBankService.update(id, dto, req.user);
  }

  @ApiOperation({
    summary: 'Menarik soal dari peredaran (baris tetap disimpan)',
  })
  @Roles(Role.COMPANY, Role.ADMIN)
  @Delete(':id')
  async deactivate(@Param('id') id: string, @Request() req: any) {
    return this.questionBankService.deactivate(id, req.user);
  }
}
