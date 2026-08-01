import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AnnouncementType,
  ChallengeStatus,
  Prisma,
  Role,
  TicketStatus,
  VerificationStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { IdentityDedupeService } from '../verification/identity-dedupe.service';
import { CreateAnnouncementDto, KybDecision } from './dto/admin-actions.dto';

/** Bentuk paginasi yang sama dipakai daftar submisi dan direktori challenge. */
export interface AdminListQuery {
  page?: string;
  limit?: string;
  search?: string;
}

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
    private readonly identityDedupe: IdentityDedupeService,
  ) {}

  /** Berapa bidang teratas yang ditampilkan di grafik sebaran. */
  private static readonly TOP_CATEGORIES = 8;

  /**
   * Halaman dan ukuran halaman yang sudah dijepit ke rentang wajar.
   *
   * Daftar admin dulu memanggil `findMany` tanpa `take` sama sekali — satu
   * permintaan menarik seluruh tabel pengguna.
   */
  private paginate(query: AdminListQuery | undefined, fallbackLimit = 25) {
    const page = Math.max(1, Number(query?.page) || 1);
    const limit = Math.min(
      100,
      Math.max(1, Number(query?.limit) || fallbackLimit),
    );
    return { page, limit, skip: (page - 1) * limit };
  }

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
          { kybStatus: 'VERIFIED', user: { isVerified: false } },
        ],
      },
      include: {
        user: true,
      },
    });
  }

  async verifyCompany(
    adminUserId: string,
    companyId: string,
    status: KybDecision,
    reason?: string,
  ) {
    const company = await this.prisma.companyProfile.findUnique({
      where: { id: companyId },
    });
    if (!company) {
      throw new NotFoundException('Company not found');
    }

    const approved = status === VerificationStatus.VERIFIED;

    // Penolakan juga harus mencabut `isVerified`. Tanpa ini perusahaan yang
    // pernah lolos lalu ditinjau ulang dan ditolak tetap memegang akses penuh:
    // `VerifiedCompanyGuard` membaca `isVerified`, bukan `kybStatus`.
    await this.prisma.user.update({
      where: { id: company.userId },
      data: { isVerified: approved },
    });

    const updated = await this.prisma.companyProfile.update({
      where: { id: companyId },
      data: { kybStatus: status },
    });

    await this.createAuditLog(
      adminUserId,
      approved ? 'COMPANY_KYB_APPROVED' : 'COMPANY_KYB_REJECTED',
      'COMPANY_PROFILE',
      companyId,
      { reason: reason ?? null },
    );

    // Sebelumnya keputusan ini tidak mengabari siapa pun. Perusahaan yang
    // mengirim dokumen legalitas menunggu tanpa tanda apa pun bahwa hasilnya
    // sudah keluar — dan yang ditolak tidak pernah tahu apa yang salah.
    await this.notificationsService.sendNotification(
      company.userId,
      approved
        ? 'Verifikasi Perusahaan Disetujui ✅'
        : 'Verifikasi Perusahaan Ditolak',
      approved
        ? 'Legalitas usaha Anda sudah diverifikasi. Seluruh fitur perusahaan kini terbuka.'
        : `Dokumen legalitas Anda belum bisa kami terima.${reason ? ` Alasan: ${reason}` : ''} Silakan perbaiki dan kirim ulang.`,
      '/settings',
    );

    return updated;
  }

  // --- Expanded Admin Features ---

  async getAllUsers(query?: AdminListQuery & { role?: Role }) {
    const { page, limit, skip } = this.paginate(query);

    // Penyaringan dulu seluruhnya di sisi klien, jadi halaman admin harus
    // memuat setiap baris pengguna lebih dulu sebelum bisa mencari satu orang.
    const search = query?.search?.trim();
    const where: Prisma.UserWhereInput = {
      ...(query?.role ? { role: query.role } : {}),
      ...(search
        ? {
            OR: [
              { email: { contains: search, mode: 'insensitive' as const } },
              { fullName: { contains: search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
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
        skip,
        take: limit,
      }),
      this.prisma.user.count({ where }),
    ]);

    return { data, total, page, limit };
  }

  async toggleBanUser(
    adminUserId: string,
    userId: string,
    isBanned: boolean,
    reason?: string,
  ) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    // Admin tidak boleh memblokir dirinya sendiri: `JwtAuthGuard` menolak akun
    // ber-status banned pada permintaan berikutnya, jadi satu klik keliru
    // mengunci pemiliknya keluar dari panelnya sendiri.
    if (userId === adminUserId) {
      throw new BadRequestException(
        'Anda tidak dapat memblokir akun Anda sendiri.',
      );
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { isBanned },
    });

    await this.createAuditLog(
      adminUserId,
      isBanned ? 'USER_BANNED' : 'USER_UNBANNED',
      'USER',
      userId,
      { reason: reason ?? null },
    );

    // Pemblokiran menutup akses lewat `JwtAuthGuard`, jadi kabar pencabutannya
    // yang paling penting: tanpa ini pengguna yang sudah dibuka blokirnya tidak
    // punya tanda apa pun bahwa akunnya bisa dipakai lagi.
    await this.notificationsService.sendNotification(
      userId,
      isBanned ? 'Akun Ditangguhkan' : 'Blokir Akun Dicabut',
      isBanned
        ? `Akun Anda ditangguhkan oleh admin.${reason ? ` Alasan: ${reason}` : ''} Hubungi dukungan bila Anda merasa ini keliru.`
        : 'Blokir akun Anda telah dicabut. Anda dapat masuk dan memakai layanan seperti biasa.',
      '/settings',
    );

    return updated;
  }

  async sendWarning(adminUserId: string, userId: string, message: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const notification = await this.prisma.notification.create({
      data: {
        userId,
        title: 'Peringatan Admin',
        content: message,
      },
    });

    await this.createAuditLog(adminUserId, 'USER_WARNED', 'USER', userId, {
      message,
    });

    return notification;
  }

  async getAllChallenges(query?: AdminListQuery) {
    const { page, limit, skip } = this.paginate(query);

    const search = query?.search?.trim();
    const where: Prisma.ChallengeWhereInput = search
      ? { title: { contains: search, mode: 'insensitive' } }
      : {};

    const [data, total] = await this.prisma.$transaction([
      this.prisma.challenge.findMany({
        where,
        include: {
          company: {
            select: { companyName: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.challenge.count({ where }),
    ]);

    return { data, total, page, limit };
  }

  /**
   * Menurunkan satu studi kasus dari peredaran.
   *
   * Dulu ini `prisma.challenge.delete`. Rantai cascade-nya berujung di
   * `Submission` lalu `Portfolio`, sehingga menghukum satu perusahaan berarti
   * menghapus permanen hasil kerja dan portofolio terverifikasi setiap talenta
   * yang pernah ikut — orang-orang yang tidak melakukan kesalahan apa pun.
   *
   * Studi kasusnya karena itu ditutup dan ditandai, bukan dibuang.
   */
  async takedownChallenge(
    adminUserId: string,
    challengeId: string,
    reason: string,
  ) {
    const challenge = await this.prisma.challenge.findUnique({
      where: { id: challengeId },
      select: {
        id: true,
        title: true,
        takenDownAt: true,
        company: { select: { userId: true } },
        creator: { select: { userId: true } },
      },
    });
    if (!challenge) throw new NotFoundException('Challenge not found');

    if (challenge.takenDownAt) {
      throw new BadRequestException('Studi kasus ini sudah diturunkan.');
    }

    const updated = await this.prisma.challenge.update({
      where: { id: challengeId },
      data: {
        status: ChallengeStatus.CLOSED,
        takenDownAt: new Date(),
        takenDownById: adminUserId,
        takedownReason: reason,
      },
    });

    await this.createAuditLog(
      adminUserId,
      'CHALLENGE_TAKEN_DOWN',
      'CHALLENGE',
      challengeId,
      { reason, title: challenge.title },
    );

    const ownerUserId =
      challenge.company?.userId ?? challenge.creator?.userId ?? null;
    if (ownerUserId) {
      await this.notificationsService.sendNotification(
        ownerUserId,
        'Studi Kasus Diturunkan Admin',
        `"${challenge.title}" diturunkan dari peredaran. Alasan: ${reason} Submisi yang sudah masuk tetap tersimpan.`,
        '/dashboard',
      );
    }

    return updated;
  }

  /** Mengembalikan studi kasus yang diturunkan ke status arsip biasa. */
  async restoreChallenge(adminUserId: string, challengeId: string) {
    const challenge = await this.prisma.challenge.findUnique({
      where: { id: challengeId },
      select: {
        id: true,
        title: true,
        takenDownAt: true,
        company: { select: { userId: true } },
        creator: { select: { userId: true } },
      },
    });
    if (!challenge) throw new NotFoundException('Challenge not found');

    if (!challenge.takenDownAt) {
      throw new BadRequestException('Studi kasus ini tidak sedang diturunkan.');
    }

    // Statusnya tetap CLOSED. Menerbitkan ulang adalah keputusan pemiliknya,
    // bukan efek samping pencabutan sanksi.
    const updated = await this.prisma.challenge.update({
      where: { id: challengeId },
      data: {
        takenDownAt: null,
        takenDownById: null,
        takedownReason: null,
      },
    });

    await this.createAuditLog(
      adminUserId,
      'CHALLENGE_RESTORED',
      'CHALLENGE',
      challengeId,
      { title: challenge.title },
    );

    const ownerUserId =
      challenge.company?.userId ?? challenge.creator?.userId ?? null;
    if (ownerUserId) {
      await this.notificationsService.sendNotification(
        ownerUserId,
        'Penurunan Studi Kasus Dicabut',
        `Penurunan "${challenge.title}" telah dicabut. Studi kasus kembali berstatus arsip dan dapat Anda kelola seperti biasa.`,
        '/dashboard',
      );
    }

    return updated;
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

    // Sebaran bidang pekerjaan.
    //
    // Dulu empat penghitungan terpisah untuk empat nilai enum yang ditulis
    // tangan. Bidang sekarang boleh ditambah perusahaan kapan saja, jadi daftar
    // tetap apa pun akan selalu ketinggalan — yang dihitung adalah bidang yang
    // benar-benar ada isinya.
    const grouped = await this.prisma.challenge.groupBy({
      by: ['categoryId'],
      where: { categoryId: { not: null } },
      _count: { categoryId: true },
      orderBy: { _count: { categoryId: 'desc' } },
      take: AdminService.TOP_CATEGORIES,
    });

    const categoryIds = grouped
      .map((row) => row.categoryId)
      .filter((id): id is string => id !== null);

    const categorySkills = categoryIds.length
      ? await this.prisma.skill.findMany({
          where: { id: { in: categoryIds } },
          select: { id: true, name: true },
        })
      : [];
    const nameById = new Map(categorySkills.map((s) => [s.id, s.name]));

    const challengeCategories = grouped
      .map((row) => ({
        name: row.categoryId ? nameById.get(row.categoryId) : undefined,
        value: row._count.categoryId,
      }))
      .filter((row): row is { name: string; value: number } => !!row.name);

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
  async getAnnouncements(query?: AdminListQuery) {
    const { page, limit, skip } = this.paginate(query);

    const [data, total] = await this.prisma.$transaction([
      this.prisma.announcement.findMany({
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.announcement.count(),
    ]);

    return { data, total, page, limit };
  }

  async createAnnouncement(adminUserId: string, dto: CreateAnnouncementDto) {
    const created = await this.prisma.announcement.create({
      data: {
        title: dto.title,
        content: dto.content,
        type: dto.type ?? AnnouncementType.INFO,
        isActive: dto.isActive ?? true,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
      },
    });

    await this.createAuditLog(
      adminUserId,
      'ANNOUNCEMENT_CREATED',
      'ANNOUNCEMENT',
      created.id,
      { title: created.title, type: created.type },
    );

    return created;
  }

  async deleteAnnouncement(adminUserId: string, id: string) {
    const existing = await this.prisma.announcement.findUnique({
      where: { id },
    });
    if (!existing) throw new NotFoundException('Pengumuman tidak ditemukan');

    const deleted = await this.prisma.announcement.delete({ where: { id } });

    await this.createAuditLog(
      adminUserId,
      'ANNOUNCEMENT_DELETED',
      'ANNOUNCEMENT',
      id,
      { title: existing.title },
    );

    return deleted;
  }

  // --- 5. Support Tickets ---
  async getTickets(query?: AdminListQuery & { status?: TicketStatus }) {
    const { page, limit, skip } = this.paginate(query);

    const search = query?.search?.trim();
    const where: Prisma.SupportTicketWhereInput = {
      ...(query?.status ? { status: query.status } : {}),
      ...(search
        ? {
            OR: [
              { subject: { contains: search, mode: 'insensitive' as const } },
              {
                user: {
                  email: { contains: search, mode: 'insensitive' as const },
                },
              },
            ],
          }
        : {}),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.supportTicket.findMany({
        where,
        include: {
          user: { select: { email: true, fullName: true, role: true } },
          _count: { select: { replies: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.supportTicket.count({ where }),
    ]);

    return { data, total, page, limit };
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

  /**
   * Membalas tiket sebagai admin.
   *
   * Penulis balasan diambil dari token, bukan dari badan permintaan. Versi
   * sebelumnya menerima `@Body('userId')`, sehingga admin mana pun bisa
   * menuliskan balasan atas nama pengguna lain — termasuk atas nama pelapor
   * tiket itu sendiri.
   */
  async replyToTicket(adminUserId: string, ticketId: string, message: string) {
    const ticket = await this.prisma.supportTicket.findUnique({
      where: { id: ticketId },
    });
    if (!ticket) throw new NotFoundException('Ticket not found');

    if (ticket.status === TicketStatus.CLOSED) {
      throw new BadRequestException(
        'Tiket sudah ditutup. Buka kembali lebih dulu untuk membalas.',
      );
    }

    if (ticket.status === TicketStatus.OPEN) {
      await this.prisma.supportTicket.update({
        where: { id: ticketId },
        data: { status: TicketStatus.IN_PROGRESS },
      });
    }

    const reply = await this.prisma.ticketReply.create({
      data: { ticketId, userId: adminUserId, message },
    });

    await this.createAuditLog(
      adminUserId,
      'TICKET_REPLIED',
      'SUPPORT_TICKET',
      ticketId,
    );

    await this.notificationsService.sendNotification(
      ticket.userId,
      'Balasan Tiket Bantuan',
      `Tim dukungan membalas tiket "${ticket.subject}".`,
      `/support/${ticketId}`,
    );

    return reply;
  }

  async closeTicket(adminUserId: string, ticketId: string) {
    const ticket = await this.prisma.supportTicket.findUnique({
      where: { id: ticketId },
    });
    if (!ticket) throw new NotFoundException('Ticket not found');

    const updated = await this.prisma.supportTicket.update({
      where: { id: ticketId },
      data: { status: TicketStatus.CLOSED },
    });

    await this.createAuditLog(
      adminUserId,
      'TICKET_CLOSED',
      'SUPPORT_TICKET',
      ticketId,
    );

    await this.notificationsService.sendNotification(
      ticket.userId,
      'Tiket Bantuan Ditutup',
      `Tiket "${ticket.subject}" telah ditutup. Buat tiket baru bila masalahnya belum selesai.`,
      `/support/${ticketId}`,
    );

    return updated;
  }
}
