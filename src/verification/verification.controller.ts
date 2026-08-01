import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  Request,
  UseGuards,
  HttpCode,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { resolveCompanyScope } from '../common/utils/company-scope';
import { VerificationService } from './verification.service';
import { VerifyFaceDto } from './dto/verify-face.dto';
import { VerifyKybDto } from './dto/verify-kyb.dto';
import { VerifyExecutionDto } from './dto/verify-execution.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CompanyOwnerGuard } from '../auth/guards/company-owner.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '@prisma/client';

@ApiTags('Identity Validation & KYB Security')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('verification')
export class VerificationController {
  constructor(private readonly verificationService: VerificationService) {}

  @ApiOperation({
    summary: 'Verifikasi wajah biometrik AI untuk talenta (Mencegah Joki)',
  })
  @ApiResponse({
    status: 202,
    description: 'Proses verifikasi diterima dan berjalan di latar belakang.',
  })
  @Roles(Role.TALENT)
  @HttpCode(202)
  @Post('face-ai')
  async verifyTalentFace(@Request() req: any, @Body() dto: VerifyFaceDto) {
    const talentId = req.user.profileId;
    return this.verificationService.verifyTalentFace(talentId, dto);
  }

  @ApiOperation({
    summary: 'Pengiriman dokumen KYB (legalitas usaha) untuk ditinjau admin',
  })
  @ApiResponse({
    status: 200,
    description: 'Dokumen KYB diterima dan berstatus menunggu tinjauan admin.',
  })
  // Legalitas adalah dokumen milik badan usaha, bukan milik anggota tim yang
  // diundang. `profileId` di bawah bernilai sama dengan companyId untuk
  // keduanya, sehingga tanpa penjaga ini anggota tim bisa mengganti dokumen
  // legalitas perusahaan tempatnya bekerja.
  @ApiQuery({
    name: 'companyId',
    required: false,
    description: 'Wajib untuk admin; diabaikan untuk peran perusahaan',
  })
  @Roles(Role.COMPANY, Role.ADMIN)
  @UseGuards(CompanyOwnerGuard)
  @Post('kyb')
  async submitCompanyKyb(
    @Request() req: any,
    @Body() dto: VerifyKybDto,
    @Query('companyId') companyId?: string,
  ) {
    // Token admin tidak membawa profileId. Sebelumnya nilai undefined itu
    // diteruskan ke `findUnique({ where: { id: undefined } })` dan permintaan
    // berakhir sebagai PrismaClientValidationError 500 — endpoint ini
    // mengizinkan ADMIN lewat @Roles tapi tidak pernah bisa dipakai admin.
    return this.verificationService.submitCompanyKyb(
      resolveCompanyScope(req.user, companyId),
      dto,
    );
  }

  @ApiOperation({
    summary:
      'Verifikasi anti-joki real-time saat pengerjaan studi kasus di Workspace',
  })
  @ApiResponse({
    status: 200,
    description: 'Hasil pencocokan biometrik wajah.',
  })
  @Roles(Role.TALENT)
  @Post('verify-execution')
  async verifyExecution(@Request() req: any, @Body() dto: VerifyExecutionDto) {
    const talentId = req.user.profileId;
    return this.verificationService.verifyExecution(talentId, dto);
  }

  @ApiOperation({
    summary: 'Mendapatkan status verifikasi identitas / KYB saat ini',
  })
  @ApiResponse({ status: 200, description: 'Status verifikasi akun.' })
  @Get('status')
  async getStatus(@Request() req: any) {
    return this.verificationService.getVerificationStatus(
      req.user.sub,
      req.user.role,
      req.user.profileId,
    );
  }
}
