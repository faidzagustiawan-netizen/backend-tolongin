import { Controller, Post, Get, Body, Request, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { VerificationService } from './verification.service';
import { VerifyFaceDto } from './dto/verify-face.dto';
import { VerifyKybDto } from './dto/verify-kyb.dto';
import { VerifyExecutionDto } from './dto/verify-execution.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
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
    status: 200,
    description: 'Wajah terverifikasi dan hash biometrik disimpan.',
  })
  @Roles(Role.TALENT)
  @Post('face-ai')
  async verifyTalentFace(@Request() req: any, @Body() dto: VerifyFaceDto) {
    const talentId = req.user.profileId;
    return this.verificationService.verifyTalentFace(talentId, dto);
  }

  @ApiOperation({
    summary: 'Verifikasi KYB (Know Your Business) legalitas perusahaan',
  })
  @ApiResponse({
    status: 200,
    description: 'Dokumen KYB terverifikasi dan lencana Verified Partner aktif.',
  })
  @Roles(Role.COMPANY, Role.ADMIN)
  @Post('kyb')
  async verifyCompanyKyb(@Request() req: any, @Body() dto: VerifyKybDto) {
    const companyId = req.user.profileId;
    return this.verificationService.verifyCompanyKyb(companyId, dto);
  }

  @ApiOperation({
    summary: 'Verifikasi anti-joki real-time saat pengerjaan studi kasus di Workspace',
  })
  @ApiResponse({ status: 200, description: 'Hasil pencocokan biometrik wajah.' })
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
    );
  }
}
