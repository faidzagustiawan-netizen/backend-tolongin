import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
  Post,
  Request,
  Patch,
  Body,
} from '@nestjs/common';
import { ApiQuery } from '@nestjs/swagger';
import { CompaniesService } from './companies.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { VerifiedCompanyGuard } from '../auth/guards/verified-company.guard';
import { CompanyOwnerGuard } from '../auth/guards/company-owner.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { resolveCompanyScope } from '../common/utils/company-scope';
import { Role } from '@prisma/client';

@Controller('companies')
export class CompaniesController {
  constructor(private readonly companiesService: CompaniesService) {}

  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'search', required: false })
  @Get()
  findAll(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
  ) {
    return this.companiesService.findAll({
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
      search,
    });
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.companiesService.findOne(id);
  }

  // --- Team Management & Logs ---
  //
  // Seluruh ruang kerja tim adalah wilayah pemilik perusahaan. Daftar anggota
  // beserta emailnya dan jejak audit dulu terbuka untuk setiap akun berperan
  // COMPANY, termasuk yang masuk lewat kode undangan: pemeriksaan
  // `isTeamMember` hanya dipasang pada dua endpoint yang mengubah data, bukan
  // pada dua endpoint yang membacanya.
  //
  // `VerifiedCompanyGuard` ikut dipasang karena akses ke fitur ini baru terbuka
  // setelah legalitas usaha disetujui admin. Sebelumnya hanya layar yang
  // menahannya (`CompanyAccessGate`), sementara API-nya melayani perusahaan
  // yang belum diverifikasi.

  @ApiQuery({
    name: 'companyId',
    required: false,
    description: 'Wajib untuk admin; diabaikan untuk peran perusahaan',
  })
  @Patch('workspace/team/:memberId/status')
  @UseGuards(JwtAuthGuard, RolesGuard, VerifiedCompanyGuard, CompanyOwnerGuard)
  @Roles(Role.COMPANY, Role.ADMIN)
  updateMemberStatus(
    @Request() req: any,
    @Param('memberId') memberId: string,
    @Body('status') status: 'APPROVED' | 'REJECTED',
    @Query('companyId') companyId?: string,
  ) {
    return this.companiesService.updateMemberStatus(
      resolveCompanyScope(req.user, companyId),
      memberId,
      status,
    );
  }

  @ApiQuery({
    name: 'companyId',
    required: false,
    description: 'Wajib untuk admin; diabaikan untuk peran perusahaan',
  })
  @UseGuards(JwtAuthGuard, RolesGuard, VerifiedCompanyGuard, CompanyOwnerGuard)
  @Roles(Role.COMPANY, Role.ADMIN)
  @Get('workspace/team')
  getTeamMembers(@Request() req: any, @Query('companyId') companyId?: string) {
    return this.companiesService.getTeamMembers(
      resolveCompanyScope(req.user, companyId),
    );
  }

  // Kode undangan memberi siapa pun yang memegangnya akses ke ruang kerja,
  // jadi penerbitannya dibatasi ke pemilik perusahaan.
  @UseGuards(JwtAuthGuard, RolesGuard, VerifiedCompanyGuard, CompanyOwnerGuard)
  @Roles(Role.COMPANY, Role.ADMIN)
  @Post('workspace/invite-code')
  generateInviteCode(
    @Request() req: any,
    @Query('companyId') companyId?: string,
  ) {
    return this.companiesService.generateInviteCode(
      resolveCompanyScope(req.user, companyId),
    );
  }

  @ApiQuery({
    name: 'companyId',
    required: false,
    description: 'Wajib untuk admin; diabaikan untuk peran perusahaan',
  })
  @UseGuards(JwtAuthGuard, RolesGuard, VerifiedCompanyGuard, CompanyOwnerGuard)
  @Roles(Role.COMPANY, Role.ADMIN)
  @Get('workspace/logs')
  getActivityLogs(@Request() req: any, @Query('companyId') companyId?: string) {
    return this.companiesService.getActivityLogs(
      resolveCompanyScope(req.user, companyId),
    );
  }
}
