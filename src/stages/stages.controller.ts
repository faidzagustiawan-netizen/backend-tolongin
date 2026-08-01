import {
  Controller,
  Get,
  Param,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { StageGateService } from './stage-gate.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '@prisma/client';

@ApiTags('Tahapan Pengerjaan')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('stages')
export class StagesController {
  constructor(private readonly stageGateService: StageGateService) {}

  @ApiOperation({
    summary: 'Keadaan seluruh tahap satu pendaftaran',
    description:
      'Server yang memutuskan tahap mana terbuka, beserta alasan terkunci dan ' +
      'sisa waktu menurut jam server. Klien tidak menghitung sendiri.',
  })
  @ApiResponse({ status: 200, description: 'Daftar tahap beserta keadaannya.' })
  @Roles(Role.TALENT)
  @Get('enrollment/:enrollmentId')
  async getStages(
    @Request() req: any,
    @Param('enrollmentId') enrollmentId: string,
  ) {
    return this.stageGateService.getStages(req.user.profileId, enrollmentId);
  }

  @ApiOperation({
    summary: 'Mulai mengerjakan satu tahap',
    description:
      'Mencap waktu mulai dan menghitung batas kedaluwarsanya. Idempoten: ' +
      'memanggilnya lagi tidak memperpanjang waktu.',
  })
  @ApiResponse({ status: 201, description: 'Tahap dimulai, jam berjalan.' })
  @ApiResponse({ status: 403, description: 'Tahap belum terbuka.' })
  @Roles(Role.TALENT)
  @Post('enrollment/:enrollmentId/:sectionId/start')
  async startStage(
    @Request() req: any,
    @Param('enrollmentId') enrollmentId: string,
    @Param('sectionId') sectionId: string,
  ) {
    return this.stageGateService.startStage(
      req.user.profileId,
      enrollmentId,
      sectionId,
    );
  }

  @ApiOperation({
    summary: 'Kandidat yang menunggu persetujuan manual pada satu studi kasus',
    description:
      'Rute tersendiri, bukan bagian dari daftar submisi: tahap yang menunggu ' +
      'persetujuan belum punya submisi apa pun. Hanya pemilik studi kasus.',
  })
  @ApiResponse({
    status: 200,
    description: 'Daftar kandidat beserta attemptId.',
  })
  @Roles(Role.COMPANY, Role.TALENT, Role.ADMIN)
  @Get('challenge/:challengeId/approvals')
  async listPendingApprovals(
    @Request() req: any,
    @Param('challengeId') challengeId: string,
  ) {
    return this.stageGateService.listPendingApprovals(
      req.user.profileId,
      challengeId,
      req.user.role,
    );
  }

  @ApiOperation({
    summary: 'Meloloskan kandidat ke satu tahap secara manual',
    description:
      'Untuk syarat masuk MANUAL_APPROVAL, dan sebagai jalan keluar ketika ' +
      'penilaian tahap sebelumnya belum selesai. Hanya pemilik studi kasus.',
  })
  @ApiResponse({ status: 201, description: 'Kandidat diloloskan.' })
  @Roles(Role.COMPANY, Role.TALENT, Role.ADMIN)
  @Post('attempt/:attemptId/approve')
  async approveStage(
    @Request() req: any,
    @Param('attemptId') attemptId: string,
  ) {
    return this.stageGateService.approveStage(
      req.user.sub,
      req.user.profileId,
      attemptId,
      req.user.role,
    );
  }
}
