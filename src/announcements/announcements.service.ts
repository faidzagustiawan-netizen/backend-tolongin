import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Sisi baca pengumuman.
 *
 * `Announcement` sebelumnya hanya ditulis: admin membuat dan menghapusnya di
 * CMS, dan tidak ada satu pun pembaca — tidak ada endpoint publik dan tidak
 * ada komponen di frontend yang pernah menampilkannya. Kolom `isActive` dan
 * `expiresAt` sudah lama ada di skema tanpa pernah dipakai menyaring apa pun.
 */
@Injectable()
export class AnnouncementsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Berapa pengumuman yang boleh tampil sekaligus di satu layar. */
  private static readonly MAX_ACTIVE = 5;

  async listActive() {
    const now = new Date();

    return this.prisma.announcement.findMany({
      where: {
        isActive: true,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      select: {
        id: true,
        title: true,
        content: true,
        type: true,
        createdAt: true,
        expiresAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: AnnouncementsService.MAX_ACTIVE,
    });
  }
}
