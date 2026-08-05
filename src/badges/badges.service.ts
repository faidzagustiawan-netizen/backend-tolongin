import { Injectable, Logger } from '@nestjs/common';
import {
  BadgeCriteria,
  ChallengeDifficulty,
  Prisma,
  SubmissionStatus,
  HiringStatus,
  VerificationStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

/** Lencana yang baru saja diperoleh, untuk dikabarkan setelah transaksi. */
export interface AwardedBadge {
  id: string;
  title: string;
  description: string;
}

/** Bentuk minimal yang dibutuhkan penilai. */
type BadgeRule = {
  id: string;
  title: string;
  description: string;
  criteria: BadgeCriteria;
  threshold: number;
  param: string | null;
};

/** Nilai `finalScore` minimum yang dianggap "tinggi" oleh HIGH_SCORES. */
const AMBANG_NILAI_TINGGI = 90;

/**
 * Pemberian lencana kepada talenta.
 *
 * Sebelum ini tabel `talent_badges` tidak pernah ditulis satu baris pun di
 * luar penyemai: `TalentBadgesTab` dirender di dua halaman, `earnedBadges`
 * di-select UsersService, dan hasilnya selalu kosong di pemasangan sungguhan.
 *
 * Kriterianya kini bermacam-macam, bukan hanya XP. Perbedaannya penting:
 * dengan satu kriteria, tiga lencana pada ambang 300/400/500 sementara XP
 * talenta mencapai 4995 berarti hampir semua orang memperoleh semuanya —
 * 83 dari maksimal 90 pada data semaian. Sesuatu yang dimiliki hampir semua
 * orang tidak menyampaikan informasi apa pun.
 */
@Injectable()
export class BadgesService {
  private readonly logger = new Logger(BadgesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * Memberikan setiap lencana yang syaratnya sudah terpenuhi.
   *
   * Dijalankan DI DALAM transaksi pemanggil, sehingga keadaan dibaca sesudah
   * perubahan pada transaksi yang sama — kalau penilaiannya batal, lencananya
   * ikut batal.
   *
   * Idempoten: `@@unique([talentId, badgeId])` ditegakkan basis data dan
   * `skipDuplicates` membuat pemanggilan berulang tidak melempar. Aman
   * dipanggil pada setiap peristiwa tanpa perlu tahu apa yang sudah diberikan.
   *
   * Hanya lencana yang BELUM dimiliki yang dinilai, jadi biayanya menyusut
   * seiring talenta mengumpulkan lencana, dan menjadi nol setelah lengkap.
   */
  async awardWithin(
    tx: Prisma.TransactionClient,
    talentId: string,
  ): Promise<AwardedBadge[]> {
    const kandidat: BadgeRule[] = await tx.badge.findMany({
      where: { earnedBy: { none: { talentId } } },
      select: {
        id: true,
        title: true,
        description: true,
        criteria: true,
        threshold: true,
        param: true,
      },
    });
    if (kandidat.length === 0) return [];

    const layak: AwardedBadge[] = [];
    for (const badge of kandidat) {
      if (await this.terpenuhi(tx, talentId, badge)) {
        layak.push({
          id: badge.id,
          title: badge.title,
          description: badge.description,
        });
      }
    }
    if (layak.length === 0) return [];

    await tx.talentBadge.createMany({
      data: layak.map((b) => ({ talentId, badgeId: b.id })),
      skipDuplicates: true,
    });

    return layak;
  }

  /**
   * Satu penilai per kriteria.
   *
   * Kriteria yang tidak dikenal mengembalikan false, bukan melempar: lencana
   * yang salah pasang tidak boleh menggagalkan penilaian submisi yang sudah
   * selesai. Kasus itu dicatat supaya tetap terlihat.
   */
  private async terpenuhi(
    tx: Prisma.TransactionClient,
    talentId: string,
    badge: BadgeRule,
  ): Promise<boolean> {
    const { criteria, threshold, param } = badge;

    // Submisi yang mewakili SELURUH studi kasus. `sectionId: null` penting:
    // tanpa itu satu studi kasus bertahap terhitung sebanyak jumlah tahapnya.
    const lulusUtuh = {
      talentId,
      sectionId: null,
      status: SubmissionStatus.PASSED,
    };

    switch (criteria) {
      case BadgeCriteria.TOTAL_XP: {
        const t = await tx.talentProfile.findUnique({
          where: { id: talentId },
          select: { xp: true },
        });
        return (t?.xp ?? 0) >= threshold;
      }

      case BadgeCriteria.CHALLENGES_PASSED:
        return (await tx.submission.count({ where: lulusUtuh })) >= threshold;

      case BadgeCriteria.HIGH_SCORES:
        return (
          (await tx.submission.count({
            where: { ...lulusUtuh, finalScore: { gte: AMBANG_NILAI_TINGGI } },
          })) >= threshold
        );

      case BadgeCriteria.DIFFICULTY_PASSED: {
        if (!param) return false;
        // `param` kolom String bebas, jadi isinya belum tentu nilai enum yang
        // sah. Dicocokkan dulu, bukan di-cast: param salah ketik membuat
        // Prisma melempar validation error DI DALAM transaksi penilaian, dan
        // kelulusan talenta ikut batal. Lencana yang salah pasang tidak boleh
        // menggagalkan penilaian yang sudah selesai — sama seperti `default:`
        // di bawah.
        const tingkat = Object.values(ChallengeDifficulty).find(
          (d) => d === param,
        );
        if (!tingkat) {
          this.logger.warn(
            `DIFFICULTY_PASSED pada "${badge.title}" punya param tidak sah: "${param}"`,
          );
          return false;
        }
        return (
          (await tx.submission.count({
            where: { ...lulusUtuh, challenge: { difficulty: tingkat } },
          })) >= threshold
        );
      }

      case BadgeCriteria.CATEGORY_BREADTH: {
        // Bidang BERBEDA, bukan jumlah kelulusan. Sepuluh kemenangan di satu
        // bidang tidak membuat seseorang berwawasan luas.
        const baris = await tx.submission.findMany({
          where: { ...lulusUtuh, challenge: { categoryId: { not: null } } },
          select: { challenge: { select: { categoryId: true } } },
          distinct: ['challengeId'],
        });
        const bidang = new Set(baris.map((b) => b.challenge.categoryId));
        return bidang.size >= threshold;
      }

      case BadgeCriteria.IDENTITY_VERIFIED: {
        const t = await tx.talentProfile.findUnique({
          where: { id: talentId },
          select: { faceVerificationStatus: true },
        });
        return t?.faceVerificationStatus === VerificationStatus.VERIFIED;
      }

      case BadgeCriteria.PORTFOLIO_ENTRIES:
        return (
          (await tx.portfolio.count({ where: { talentId, isPublic: true } })) >=
          threshold
        );

      case BadgeCriteria.DISCUSSION_POSTS: {
        // Diskusi dimiliki User, bukan TalentProfile.
        const t = await tx.talentProfile.findUnique({
          where: { id: talentId },
          select: { userId: true },
        });
        if (!t) return false;
        return (
          (await tx.discussion.count({ where: { userId: t.userId } })) >=
          threshold
        );
      }

      case BadgeCriteria.HIRED:
        return (
          (await tx.submission.count({
            where: { talentId, hiringStatus: HiringStatus.HIRED },
          })) >= threshold
        );

      case BadgeCriteria.SKILLS_LISTED: {
        const t = await tx.talentProfile.findUnique({
          where: { id: talentId },
          select: { skills: true },
        });
        return (t?.skills.length ?? 0) >= threshold;
      }

      default:
        this.logger.warn(
          `Kriteria lencana tidak dikenal pada "${badge.title}": ${String(criteria)}`,
        );
        return false;
    }
  }

  /**
   * Menilai ulang di luar transaksi berjalan, lalu mengabarkan hasilnya.
   *
   * Dipakai peristiwa yang bukan penilaian submisi — verifikasi identitas,
   * penyuntingan keahlian, tulisan diskusi baru. Kegagalannya ditelan: tidak
   * ada satu pun pemanggilnya yang pantas gagal hanya karena lencana.
   */
  async syncForTalent(talentId: string, userId: string): Promise<void> {
    try {
      const diberikan = await this.prisma.$transaction((tx) =>
        this.awardWithin(tx, talentId),
      );
      await this.notifyAwarded(userId, diberikan);
    } catch (error) {
      this.logger.error(
        `Gagal menyelaraskan lencana untuk talenta ${talentId}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  /**
   * Mengabarkan lencana yang baru diperoleh. Dipanggil SESUDAH transaksi.
   *
   * `sendNotification` ikut mengirim email, dan itu panggilan jaringan ke
   * layanan luar. Menaruhnya di dalam transaksi penilaian berarti kunci baris
   * submisi ditahan selama SMTP berpikir.
   */
  async notifyAwarded(userId: string, badges: AwardedBadge[]): Promise<void> {
    for (const badge of badges) {
      try {
        await this.notifications.sendNotification(
          userId,
          `Lencana baru: ${badge.title}`,
          badge.description,
          '/settings',
        );
      } catch (error) {
        this.logger.error(
          `Gagal mengabarkan lencana "${badge.title}" ke ${userId}`,
          error instanceof Error ? error.stack : String(error),
        );
      }
    }
  }

  /**
   * Menyusulkan lencana untuk talenta yang syaratnya sudah terpenuhi sebelum
   * pemberian otomatis ada. Dipakai penyemai.
   */
  async backfillAll(): Promise<number> {
    const talents = await this.prisma.talentProfile.findMany({
      select: { id: true },
    });

    let total = 0;
    for (const { id } of talents) {
      const diberikan = await this.prisma.$transaction((tx) =>
        this.awardWithin(tx, id),
      );
      total += diberikan.length;
    }
    return total;
  }
}
