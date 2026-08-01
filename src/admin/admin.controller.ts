import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { AdminService } from './admin.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role, TicketStatus } from '@prisma/client';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import {
  CreateAnnouncementDto,
  ReplyTicketDto,
  ResolveIdentityReviewDto,
  SendWarningDto,
  TakedownChallengeDto,
  ToggleBanUserDto,
  VerifyCompanyDto,
} from './dto/admin-actions.dto';

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

  @ApiOperation({ summary: 'Menuntaskan tinjauan legalitas usaha (KYB)' })
  @Post('companies/:id/verify')
  async verifyCompany(
    @Request() req: any,
    @Param('id') companyId: string,
    @Body() dto: VerifyCompanyDto,
  ) {
    return this.adminService.verifyCompany(
      req.user.sub,
      companyId,
      dto.status,
      dto.reason,
    );
  }

  // --- Expanded Admin Features ---

  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({
    name: 'search',
    required: false,
    description: 'Cocokkan email atau nama lengkap',
  })
  @ApiQuery({ name: 'role', required: false, enum: Role })
  @Get('users')
  async getAllUsers(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('role') role?: Role,
  ) {
    return this.adminService.getAllUsers({
      page,
      limit,
      search,
      // Nilai sembarang dari query string tidak boleh sampai ke `where` Prisma
      // sebagai filter enum yang tidak sah.
      role: role && role in Role ? role : undefined,
    });
  }

  @Patch('users/:id/ban')
  async toggleBanUser(
    @Request() req: any,
    @Param('id') userId: string,
    @Body() dto: ToggleBanUserDto,
  ) {
    return this.adminService.toggleBanUser(
      req.user.sub,
      userId,
      dto.isBanned,
      dto.reason,
    );
  }

  @Post('users/:id/warning')
  async sendWarning(
    @Request() req: any,
    @Param('id') userId: string,
    @Body() dto: SendWarningDto,
  ) {
    return this.adminService.sendWarning(req.user.sub, userId, dto.message);
  }

  @ApiOperation({
    summary:
      'Daftar profil talenta yang ditandai mirip dengan identitas terdaftar lain',
  })
  @Get('identity-reviews')
  async getIdentityReviews() {
    return this.adminService.getIdentityReviewQueue();
  }

  @ApiOperation({
    summary:
      'Menuntaskan tinjauan identitas. approve=true berarti dinyatakan orang berbeda.',
  })
  @Post('identity-reviews/:talentId')
  async resolveIdentityReview(
    @Request() req: any,
    @Param('talentId') talentId: string,
    @Body() dto: ResolveIdentityReviewDto,
  ) {
    return this.adminService.resolveIdentityReview(
      req.user.sub,
      talentId,
      dto.approve,
      dto.note,
    );
  }

  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'search', required: false, description: 'Cocokkan judul' })
  @Get('challenges')
  async getAllChallenges(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
  ) {
    return this.adminService.getAllChallenges({ page, limit, search });
  }

  @ApiOperation({
    summary: 'Menurunkan studi kasus dari peredaran',
    description:
      'Studi kasus ditutup dan ditandai, bukan dihapus: submisi, penilaian, ' +
      'dan portofolio talenta yang sudah terbit tetap utuh. Karena itu ' +
      'metodenya POST, bukan DELETE — tidak ada baris yang hilang.',
  })
  @Post('challenges/:id/takedown')
  async takedownChallenge(
    @Request() req: any,
    @Param('id') challengeId: string,
    @Body() dto: TakedownChallengeDto,
  ) {
    return this.adminService.takedownChallenge(
      req.user.sub,
      challengeId,
      dto.reason,
    );
  }

  @ApiOperation({ summary: 'Mencabut penurunan studi kasus' })
  @Post('challenges/:id/restore')
  async restoreChallenge(
    @Request() req: any,
    @Param('id') challengeId: string,
  ) {
    return this.adminService.restoreChallenge(req.user.sub, challengeId);
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
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @Get('announcements')
  async getAnnouncements(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.adminService.getAnnouncements({ page, limit });
  }

  @Post('announcements')
  async createAnnouncement(
    @Request() req: any,
    @Body() dto: CreateAnnouncementDto,
  ) {
    return this.adminService.createAnnouncement(req.user.sub, dto);
  }

  @Delete('announcements/:id')
  async deleteAnnouncement(@Request() req: any, @Param('id') id: string) {
    return this.adminService.deleteAnnouncement(req.user.sub, id);
  }

  // --- 5. Support Tickets ---
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({
    name: 'search',
    required: false,
    description: 'Cocokkan judul tiket atau email pelapor',
  })
  @ApiQuery({ name: 'status', required: false, enum: TicketStatus })
  @Get('tickets')
  async getTickets(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('status') status?: TicketStatus,
  ) {
    return this.adminService.getTickets({
      page,
      limit,
      search,
      status: status && status in TicketStatus ? status : undefined,
    });
  }

  @Get('tickets/:id/replies')
  async getTicketReplies(@Param('id') id: string) {
    return this.adminService.getTicketReplies(id);
  }

  @Post('tickets/:id/replies')
  async replyToTicket(
    @Request() req: any,
    @Param('id') id: string,
    @Body() dto: ReplyTicketDto,
  ) {
    return this.adminService.replyToTicket(req.user.sub, id, dto.message);
  }

  @Patch('tickets/:id/close')
  async closeTicket(@Request() req: any, @Param('id') id: string) {
    return this.adminService.closeTicket(req.user.sub, id);
  }
}
