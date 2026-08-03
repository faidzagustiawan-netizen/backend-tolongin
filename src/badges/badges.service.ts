import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

/** Lencana yang baru saja diperoleh, untuk dikabarkan setelah transaksi. */
export interface AwardedBadge {
  id: string;
  title: string;
  description: string;
}

/**
 * Pemberian lencana kepada talenta.
 *
 * Sebelum ini tabel `talent_badges` tidak pernah ditulis satu baris pun di
 * luar penyemai: `TalentBadgesTab` dirender di dua halaman, `earnedBadges`
 * di-select oleh UsersService, dan hasilnya selalu kosong di pemasangan
 * sungguhan. Lencananya ada, syaratnya ada, yang tidak ada adalah yang
 * memberikannya.
 *
 * Syaratnya hanya satu karena hanya satu yang bisa diperiksa mesin:
 * `Badge.requiredXp`. Kolom itu satu-satunya kriteria di model `Badge` —
 * judul seperti "Squashed 100 bugs" tidak punya penghitung apa pun di balik
 * layar, dan menambahkannya berarti kolom baru, bukan kode baru.
 */
@Injectable()
export class BadgesService {
  private readonly logger = new Logger(BadgesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * Memberikan setiap lencana yang ambang XP-nya sudah terlampaui.
   *
   * Dijalankan DI DALAM transaksi pemanggil, sehingga XP dibaca sesudah
   * penambahannya pada transaksi yang sama — kalau penilaiannya batal,
   * lencananya ikut batal.
   *
   * Idempoten: `@@unique([talentId, badgeId])` ditegakkan basis data dan
   * `skipDuplicates` membuat pemanggilan berulang tidak melempar. Jadi aman
   * dipanggil pada setiap perubahan XP tanpa perlu tahu apa yang sudah pernah
   * diberikan.
   */
  async awardForXpWithin(
    tx: Prisma.TransactionClient,
    talentId: string,
  ): Promise<AwardedBadge[]> {
    const talent = await tx.talentProfile.findUnique({
      where: { id: talentId },
      select: { xp: true },
    });
    if (!talent) return [];

    const layak = await tx.badge.findMany({
      where: {
        requiredXp: { lte: talent.xp },
        earnedBy: { none: { talentId } },
      },
      select: { id: true, title: true, description: true },
    });
    if (layak.length === 0) return [];

    await tx.talentBadge.createMany({
      data: layak.map((b) => ({ talentId, badgeId: b.id })),
      skipDuplicates: true,
    });

    return layak;
  }

  /**
   * Mengabarkan lencana yang baru diperoleh. Dipanggil SESUDAH transaksi.
   *
   * `sendNotification` ikut mengirim email, dan itu panggilan jaringan ke
   * layanan luar. Menaruhnya di dalam transaksi penilaian berarti kunci baris
   * submisi ditahan selama SMTP berpikir.
   *
   * Kegagalannya sengaja tidak dilempar: lencananya sudah tersimpan dan
   * tampil di profil, jadi email yang gagal bukan alasan menggagalkan
   * penilaian yang sudah selesai.
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
   * Menyusulkan lencana untuk talenta yang XP-nya sudah melewati ambang
   * sebelum pemberian otomatis ada.
   *
   * Dipakai penyemai; tanpa ini seluruh data semaian lahir dengan XP tinggi
   * dan nol lencana, dan tab lencananya tetap kosong seperti sebelumnya.
   */
  async backfillAll(): Promise<number> {
    const talents = await this.prisma.talentProfile.findMany({
      select: { id: true },
    });

    let total = 0;
    for (const { id } of talents) {
      const diberikan = await this.prisma.$transaction((tx) =>
        this.awardForXpWithin(tx, id),
      );
      total += diberikan.length;
    }
    return total;
  }
}
