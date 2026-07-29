import { Injectable, NotFoundException } from '@nestjs/common';
import { VerificationStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { IdentityDedupeService } from '../verification/identity-dedupe.service';

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
    private readonly identityDedupe: IdentityDedupeService,
  ) {}

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
        OR: [
          { kybStatus: 'PENDING' },
          { kybStatus: 'VERIFIED', user: { isVerified: false } }
        ]
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

    if (status === 'VERIFIED') {
      await this.prisma.user.update({
        where: { id: company.userId },
        data: { isVerified: true },
      });
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

  // --- 3b. Antrean Tinjau Identitas ---

  /**
   * Profil yang ditandai pemeriksaan duplikat wajah sebagai "mirip dengan
   * identitas lain" tetapi tidak cukup mirip untuk ditolak otomatis.
   *
   * Zona ini sengaja ditinjau manusia: menolak pencari kerja yang sah karena
   * kemiripan wajah adalah kesalahan yang tidak bisa mereka perbaiki sendiri
   * (dan kembar identik itu nyata).
   */
  async getIdentityReviewQueue() {
    const flagged = await this.prisma.talentProfile.findMany({
      where: { needsIdentityReview: true },
      select: {
        id: true,
        slug: true,
        fullName: true,
        ktpNik: true,
        duplicateCheckDistance: true,
        duplicateCheckMatchId: true,
        faceAlignmentDegraded: true,
        createdAt: true,
        // Statusnya membedakan dua jenis tinjauan yang tampil di antrean yang
        // sama: PENDING berarti wajah-vs-KTP berhenti di zona ragu dan akun
        // belum aktif, sedangkan VERIFIED berarti akun sudah jalan dan yang
        // ditinjau hanya kemiripan dengan identitas lain.
        faceVerificationStatus: true,
        user: { select: { id: true, email: true, isBanned: true } },
      },
      orderBy: { duplicateCheckDistance: 'asc' },
      take: 100,
    });

    // Profil pembanding diambil sekaligus agar admin bisa menilai keduanya
    // berdampingan tanpa permintaan tambahan per baris.
    const matchIds = flagged
      .map((p) => p.duplicateCheckMatchId)
      .filter((id): id is string => !!id);

    const matches = matchIds.length
      ? await this.prisma.talentProfile.findMany({
          where: { id: { in: matchIds } },
          select: {
            id: true,
            slug: true,
            fullName: true,
            ktpNik: true,
            user: { select: { email: true } },
          },
        })
      : [];

    const matchById = new Map(matches.map((m) => [m.id, m]));

    return flagged.map((profile) => ({
      ...profile,
      matchedProfile: profile.duplicateCheckMatchId
        ? (matchById.get(profile.duplicateCheckMatchId) ?? null)
        : null,
    }));
  }

  /**
   * Menuntaskan satu tinjauan identitas.
   * `approve` berarti dua profil dinyatakan orang yang berbeda.
   */
  async resolveIdentityReview(
    adminUserId: string,
    talentId: string,
    approve: boolean,
    note?: string,
  ) {
    const profile = await this.prisma.talentProfile.findUnique({
      where: { id: talentId },
      select: {
        id: true,
        userId: true,
        duplicateCheckDistance: true,
        duplicateCheckMatchId: true,
      },
    });

    if (!profile) {
      throw new NotFoundException('Profil talenta tidak ditemukan');
    }

    const updated = await this.prisma.talentProfile.update({
      where: { id: talentId },
      data: {
        needsIdentityReview: false,
        identityReviewedAt: new Date(),
        identityReviewedBy: adminUserId,
        // Persetujuan harus menetapkan VERIFIED, bukan sekadar mencabut tanda.
        // Profil yang ditahan di zona tinjau berstatus PENDING; kalau tinjauan
        // hanya mematikan tandanya, profil itu tidak pernah keluar dari PENDING
        // dan penggunanya terkunci tanpa cara memperbaikinya sendiri.
        faceVerificationStatus: approve
          ? VerificationStatus.VERIFIED
          : VerificationStatus.FAILED,
      },
    });

    // Bila dinyatakan duplikat, acuan biometriknya dibuang supaya tidak ikut
    // dibandingkan lagi dan tidak menandai profil sah berikutnya.
    if (!approve) {
      await this.identityDedupe.clearVector(talentId);
    }

    await this.createAuditLog(
      adminUserId,
      approve ? 'IDENTITY_REVIEW_APPROVED' : 'IDENTITY_REVIEW_REJECTED',
      'TALENT_PROFILE',
      talentId,
      {
        distance: profile.duplicateCheckDistance,
        matchedTalentId: profile.duplicateCheckMatchId,
        note: note ?? null,
      },
    );

    await this.notificationsService.sendNotification(
      profile.userId,
      approve
        ? 'Tinjauan Identitas Selesai ✅'
        : 'Verifikasi Identitas Dibatalkan',
      approve
        ? 'Tinjauan identitas Anda telah selesai dan akun Anda dinyatakan sah.'
        : `Verifikasi identitas Anda dibatalkan karena terindikasi duplikat.${note ? ` Catatan: ${note}` : ''} Hubungi dukungan bila Anda merasa ini keliru.`,
      '/settings/kyc',
    );

    return updated;
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
