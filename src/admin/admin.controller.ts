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

  // --- 1. Analytics ---
  @Get('analytics')
  async getAdvancedAnalytics() {
    return this.adminService.getAdvancedAnalytics();
  }

  // --- 2. Billing ---
  @Get('billing')
  async getBillingTransactions() {
    return this.adminService.getBillingTransactions();
  }

  // --- 3. Audit Logs ---
  @Get('audit-logs')
  async getAuditLogs() {
    return this.adminService.getAuditLogs();
  }

  // --- 4. Announcements (CMS) ---
  @Get('announcements')
  async getAnnouncements() {
    return this.adminService.getAnnouncements();
  }

  @Post('announcements')
  async createAnnouncement(@Body() data: { title: string; content: string; type: 'INFO'|'WARNING'|'SUCCESS'|'MAINTENANCE' }) {
    return this.adminService.createAnnouncement(data);
  }

  @Delete('announcements/:id')
  async deleteAnnouncement(@Param('id') id: string) {
    return this.adminService.deleteAnnouncement(id);
  }

  // --- 5. Support Tickets ---
  @Get('tickets')
  async getTickets() {
    return this.adminService.getTickets();
  }

  @Get('tickets/:id/replies')
  async getTicketReplies(@Param('id') id: string) {
    return this.adminService.getTicketReplies(id);
  }

  @Post('tickets/:id/replies')
  async replyToTicket(
    @Param('id') id: string,
    @Body('userId') userId: string,
    @Body('message') message: string
  ) {
    return this.adminService.replyToTicket(id, userId, message);
  }

  @Patch('tickets/:id/close')
  async closeTicket(@Param('id') id: string) {
    return this.adminService.closeTicket(id);
  }
}

