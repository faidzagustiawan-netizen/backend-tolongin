import { Controller, Get, Post, Patch, Delete, Param, Body, UseGuards } from '@nestjs/common';
import { AdminService } from './admin.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '@prisma/client';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

@ApiTags('Admin')
@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@ApiBearerAuth('JWT-auth')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('stats')
  async getStats() {
    return this.adminService.getOverviewStats();
  }

  @Get('companies/pending')
  async getPendingCompanies() {
    return this.adminService.getPendingCompanies();
  }

  @Post('companies/:id/verify')
  async verifyCompany(
    @Param('id') companyId: string,
    @Body('status') status: 'VERIFIED' | 'FAILED'
  ) {
    return this.adminService.verifyCompany(companyId, status);
  }

  // --- Expanded Admin Features ---

  @Get('users')
  async getAllUsers() {
    return this.adminService.getAllUsers();
  }

  @Patch('users/:id/ban')
  async toggleBanUser(
    @Param('id') userId: string,
    @Body('isBanned') isBanned: boolean
  ) {
    return this.adminService.toggleBanUser(userId, isBanned);
  }

  @Post('users/:id/warning')
  async sendWarning(
    @Param('id') userId: string,
    @Body('message') message: string
  ) {
    return this.adminService.sendWarning(userId, message);
  }

  @Get('challenges')
  async getAllChallenges() {
    return this.adminService.getAllChallenges();
  }

  @Delete('challenges/:id')
  async takedownChallenge(@Param('id') challengeId: string) {
    return this.adminService.takedownChallenge(challengeId);
  }
}
