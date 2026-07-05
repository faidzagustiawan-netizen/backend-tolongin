import { Controller, Get, Param, UseGuards, Post, Request } from '@nestjs/common';
import { CompaniesService } from './companies.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '@prisma/client';

@Controller('companies')
export class CompaniesController {
  constructor(private readonly companiesService: CompaniesService) {}

  @Get()
  findAll() {
    return this.companiesService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.companiesService.findOne(id);
  }

  // --- Team Management & Logs ---
  
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.COMPANY, Role.ADMIN)
  @Get('workspace/team')
  getTeamMembers(@Request() req: any) {
    const companyId = req.user.profileId;
    return this.companiesService.getTeamMembers(companyId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.COMPANY, Role.ADMIN)
  @Post('workspace/invite-code')
  generateInviteCode(@Request() req: any) {
    const companyId = req.user.profileId;
    return this.companiesService.generateInviteCode(companyId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.COMPANY, Role.ADMIN)
  @Get('workspace/logs')
  getActivityLogs(@Request() req: any) {
    const companyId = req.user.profileId;
    return this.companiesService.getActivityLogs(companyId);
  }
}
