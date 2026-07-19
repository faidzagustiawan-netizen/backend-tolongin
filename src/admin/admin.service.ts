import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  async getOverviewStats() {
    const totalUsers = await this.prisma.user.count();
    const totalTalents = await this.prisma.user.count({
      where: { role: 'TALENT' },
    });
    const totalCompanies = await this.prisma.user.count({
      where: { role: 'COMPANY' },
    });
    const totalChallenges = await this.prisma.challenge.count();
    const totalSubmissions = await this.prisma.submission.count();

    return {
      totalUsers,
      totalTalents,
      totalCompanies,
      totalChallenges,
      totalSubmissions,
    };
  }

  async getPendingCompanies() {
    return this.prisma.companyProfile.findMany({
      where: {
        kybStatus: 'PENDING',
      },
      include: {
        user: true,
      },
    });
  }

  async verifyCompany(companyId: string, status: 'VERIFIED' | 'FAILED') {
    const company = await this.prisma.companyProfile.findUnique({
      where: { id: companyId },
    });
    if (!company) {
      throw new NotFoundException('Company not found');
    }

    return this.prisma.companyProfile.update({
      where: { id: companyId },
      data: { kybStatus: status },
    });
  }

  // --- Expanded Admin Features ---

  async getAllUsers() {
    return this.prisma.user.findMany({
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        isVerified: true,
        isBanned: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async toggleBanUser(userId: string, isBanned: boolean) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    return this.prisma.user.update({
      where: { id: userId },
      data: { isBanned },
    });
  }

  async sendWarning(userId: string, message: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    return this.prisma.notification.create({
      data: {
        userId,
        title: 'Peringatan Admin',
        content: message,
      },
    });
  }

  async getAllChallenges() {
    return this.prisma.challenge.findMany({
      include: {
        company: {
          select: { companyName: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async takedownChallenge(challengeId: string) {
    const challenge = await this.prisma.challenge.findUnique({
      where: { id: challengeId },
    });
    if (!challenge) throw new NotFoundException('Challenge not found');

    // Option 1: Soft delete or status change. Since there is no status, we can just delete it or mark it.
    // The user said "takedown aja jangan sampai bisa edit". Let's delete it.
    return this.prisma.challenge.delete({
      where: { id: challengeId },
    });
  }

  // --- 1. Analytics & Reporting ---
  async getAdvancedAnalytics() {
    // 6 Months User Growth
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
    sixMonthsAgo.setDate(1);

    const users = await this.prisma.user.findMany({
      where: { createdAt: { gte: sixMonthsAgo } },
      select: { createdAt: true, role: true },
    });

    const monthNames = [
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec',
    ];
    const growthData = Array.from({ length: 6 }).map((_, i) => {
      const d = new Date(sixMonthsAgo);
      d.setMonth(d.getMonth() + i);
      return {
        month: `${monthNames[d.getMonth()]}`,
        monthValue: d.getMonth(),
        yearValue: d.getFullYear(),
        talentCount: 0,
        companyCount: 0,
      };
    });

    users.forEach((u) => {
      const uMonth = u.createdAt.getMonth();
      const uYear = u.createdAt.getFullYear();
      const index = growthData.findIndex(
        (g) => g.monthValue === uMonth && g.yearValue === uYear,
      );
      if (index !== -1) {
        if (u.role === 'TALENT') growthData[index].talentCount++;
        if (u.role === 'COMPANY') growthData[index].companyCount++;
      }
    });

    // Challenge Demographics
    const uiuxCount = await this.prisma.challenge.count({
      where: { category: 'UI_UX' },
    });
    const feCount = await this.prisma.challenge.count({
      where: { category: 'FRONTEND' },
    });
    const beCount = await this.prisma.challenge.count({
      where: { category: 'BACKEND' },
    });
    const dsCount = await this.prisma.challenge.count({
      where: { category: 'DATA_SCIENCE' },
    });

    const challengeCategories = [
      { name: 'UI/UX', value: uiuxCount },
      { name: 'Frontend', value: feCount },
      { name: 'Backend', value: beCount },
      { name: 'Data Science', value: dsCount },
    ];

    return {
      growthData: growthData.map((g) => ({
        month: g.month,
        Talent: g.talentCount,
        Perusahaan: g.companyCount,
      })),
      challengeCategories,
    };
  }

  // --- 2. Billing & Finance ---
  async getBillingTransactions() {
    return this.prisma.paymentTransaction.findMany({
      include: {
        user: { select: { email: true, fullName: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  // --- 3. Audit Logs ---
  async getAuditLogs() {
    return this.prisma.systemAuditLog.findMany({
      include: {
        user: { select: { email: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async createAuditLog(
    userId: string,
    action: string,
    entityType: string,
    entityId?: string,
    details?: any,
  ) {
    return this.prisma.systemAuditLog.create({
      data: { userId, action, entityType, entityId, details: details || {} },
    });
  }

  // --- 4. Announcements (CMS) ---
  async getAnnouncements() {
    return this.prisma.announcement.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  async createAnnouncement(data: {
    title: string;
    content: string;
    type: 'INFO' | 'WARNING' | 'SUCCESS' | 'MAINTENANCE';
  }) {
    return this.prisma.announcement.create({ data });
  }

  async deleteAnnouncement(id: string) {
    return this.prisma.announcement.delete({ where: { id } });
  }

  // --- 5. Support Tickets ---
  async getTickets() {
    return this.prisma.supportTicket.findMany({
      include: {
        user: { select: { email: true, fullName: true, role: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getTicketReplies(ticketId: string) {
    return this.prisma.ticketReply.findMany({
      where: { ticketId },
      include: {
        user: { select: { email: true, role: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async replyToTicket(ticketId: string, userId: string, message: string) {
    const ticket = await this.prisma.supportTicket.findUnique({
      where: { id: ticketId },
    });
    if (!ticket) throw new NotFoundException('Ticket not found');

    // Auto change status to IN_PROGRESS if OPEN
    if (ticket.status === 'OPEN') {
      await this.prisma.supportTicket.update({
        where: { id: ticketId },
        data: { status: 'IN_PROGRESS' },
      });
    }

    return this.prisma.ticketReply.create({
      data: { ticketId, userId, message },
    });
  }

  async closeTicket(ticketId: string) {
    return this.prisma.supportTicket.update({
      where: { id: ticketId },
      data: { status: 'CLOSED' },
    });
  }
}
