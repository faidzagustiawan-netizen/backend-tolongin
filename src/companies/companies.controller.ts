import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
  Post,
  Request,
} from '@nestjs/common';
import { ApiQuery } from '@nestjs/swagger';
import { CompaniesService } from './companies.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CompanyRoles } from '../auth/decorators/company-roles.decorator';
import { CompanyRolesGuard } from '../auth/guards/company-roles.guard';
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

  @ApiQuery({
    name: 'companyId',
    required: false,
    description: 'Wajib untuk admin; diabaikan untuk peran perusahaan',
  })
  @Patch('workspace/team/:memberId/status')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.COMPANY, Role.ADMIN)
  @CompanyRoles('OWNER', 'ADMIN')
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

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.COMPANY, Role.ADMIN)
  @Get('workspace/team')
  getTeamMembers(@Request() req: any, @Query('companyId') companyId?: string) {
    return this.companiesService.getTeamMembers(
      resolveCompanyScope(req.user, companyId),
    );
  }

  // Kode undangan memberi siapa pun yang memegangnya akses ke ruang kerja,
  // jadi penerbitannya dibatasi ke pemilik dan admin perusahaan — bukan setiap
  // rekruter yang kebetulan ada di dalam tim.
  @UseGuards(JwtAuthGuard, RolesGuard, CompanyRolesGuard)
  @Roles(Role.COMPANY, Role.ADMIN)
  @CompanyRoles('OWNER', 'ADMIN')
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
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.COMPANY, Role.ADMIN)
  @Get('workspace/logs')
  getActivityLogs(@Request() req: any, @Query('companyId') companyId?: string) {
    return this.companiesService.getActivityLogs(
      resolveCompanyScope(req.user, companyId),
    );
  }
}
