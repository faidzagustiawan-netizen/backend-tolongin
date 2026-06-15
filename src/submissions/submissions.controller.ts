import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
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
import { SubmissionsService } from './submissions.service';
import { EnrollDto } from './dto/enroll.dto';
import { SubmitSolutionDto } from './dto/submit-solution.dto';
import { GradeSubmissionDto } from './dto/grade-submission.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '@prisma/client';

@ApiTags('Workspace, Submissions & AI Assessment')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('workspace')
export class SubmissionsController {
  constructor(private readonly submissionsService: SubmissionsService) {}

  @ApiOperation({
    summary: 'Mendaftar (enroll) dan menyetujui NDA untuk mengerjakan challenge',
  })
  @ApiResponse({
    status: 201,
    description: 'Berhasil mendaftar, waktu pengerjaan mulai dicatat.',
  })
  @ApiResponse({
    status: 400,
    description: 'Anda sudah terdaftar di challenge ini.',
  })
  @Roles(Role.TALENT)
  @Post('enroll')
  async enroll(@Request() req: any, @Body() enrollDto: EnrollDto) {
    const talentId = req.user.profileId;
    return this.submissionsService.enroll(talentId, enrollDto);
  }

  @ApiOperation({
    summary:
      'Mendapatkan daftar challenge yang sedang atau telah dikerjakan talenta',
  })
  @ApiResponse({ status: 200, description: 'Daftar riwayat enrollment talenta.' })
  @Roles(Role.TALENT)
  @Get('my-enrollments')
  async getMyEnrollments(@Request() req: any) {
    const talentId = req.user.profileId;
    return this.submissionsService.getTalentEnrollments(talentId);
  }

  @ApiOperation({
    summary: 'Mengunggah solusi dan memicu AI Anti-Plagiarism & Correction Engine',
  })
  @ApiResponse({
    status: 201,
    description:
      'Solusi berhasil diunggah, skor AI dan ringkasan ulasan otomatis dibuat.',
  })
  @Roles(Role.TALENT)
  @Post('submit')
  async submitSolution(@Request() req: any, @Body() dto: SubmitSolutionDto) {
    const talentId = req.user.profileId;
    return this.submissionsService.submitSolution(talentId, dto);
  }

  @ApiOperation({
    summary:
      'Mendapatkan seluruh solusi yang dikumpulkan talenta pada challenge perusahaan',
  })
  @ApiQuery({
    name: 'challengeId',
    required: false,
    description: 'Filter berdasarkan ID Challenge spesifik',
  })
  @ApiResponse({ status: 200, description: 'Daftar submission talenta.' })
  @Roles(Role.COMPANY, Role.ADMIN)
  @Get('company-submissions')
  async getCompanySubmissions(
    @Request() req: any,
    @Query('challengeId') challengeId?: string,
  ) {
    const companyId = req.user.profileId;
    return this.submissionsService.getSubmissionsForCompany(
      companyId,
      challengeId,
    );
  }

  @ApiOperation({
    summary: 'Mendapatkan daftar challenge beserta statistik submisi untuk company',
  })
  @ApiResponse({ status: 200, description: 'Daftar challenge dan statistik submisi.' })
  @Roles(Role.COMPANY, Role.ADMIN)
  @Get('challenge-stats')
  async getChallengeStats(@Request() req: any) {
    const companyId = req.user.profileId;
    return this.submissionsService.getChallengeStats(companyId);
  }

  @ApiOperation({
    summary:
      'Memberikan penilaian akhir rekruter dan menerbitkan portofolio otomatis',
  })
  @ApiResponse({
    status: 200,
    description:
      'Penilaian akhir tersimpan, XP ditambahkan, dan portofolio terverifikasi diterbitkan.',
  })
  @Roles(Role.COMPANY, Role.ADMIN)
  @Put('grade/:id')
  async gradeSubmission(
    @Request() req: any,
    @Param('id') submissionId: string,
    @Body() dto: GradeSubmissionDto,
  ) {
    const companyId = req.user.profileId;
    return this.submissionsService.gradeSubmission(
      companyId,
      submissionId,
      dto,
    );
  }
}
