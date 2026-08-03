import { Test } from '@nestjs/testing';
import { BadgesService } from './badges.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

/**
 * Transaksi tiruan. Hanya tiga panggilan yang dipakai `awardForXpWithin`.
 */
function buatTx(xp: number | null, badges: any[]) {
  return {
    talentProfile: {
      findUnique: jest.fn().mockResolvedValue(xp === null ? null : { xp }),
    },
    badge: { findMany: jest.fn().mockResolvedValue(badges) },
    talentBadge: {
      createMany: jest.fn().mockResolvedValue({ count: badges.length }),
    },
  } as any;
}

describe('BadgesService', () => {
  let service: BadgesService;
  let notifications: { sendNotification: jest.Mock };

  beforeEach(async () => {
    notifications = {
      sendNotification: jest.fn().mockResolvedValue(undefined),
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        BadgesService,
        {
          provide: PrismaService,
          useValue: {
            talentProfile: { findMany: jest.fn() },
            $transaction: jest.fn(),
          },
        },
        { provide: NotificationsService, useValue: notifications },
      ],
    }).compile();
    service = moduleRef.get(BadgesService);
  });

  it('memberikan lencana yang ambang XP-nya terlampaui', async () => {
    const tx = buatTx(600, [
      { id: 'b1', title: 'Top Coder', description: 'Master of algorithms' },
    ]);

    const hasil = await service.awardForXpWithin(tx, 'talent-1');

    expect(hasil).toHaveLength(1);
    expect(tx.talentBadge.createMany).toHaveBeenCalledWith({
      data: [{ talentId: 'talent-1', badgeId: 'b1' }],
      skipDuplicates: true,
    });
  });

  /**
   * Penyaringnya harus menyertakan `earnedBy: { none: ... }`. Tanpa itu setiap
   * penilaian mencoba menulis ulang lencana yang sama; `skipDuplicates`
   * menyelamatkan basis data, tetapi pemanggil menerima daftar "baru" yang
   * sebenarnya lama dan mengirim notifikasi berulang setiap kali.
   */
  it('hanya mencari lencana yang belum dimiliki, dan tidak menulis apa pun bila nihil', async () => {
    const tx = buatTx(600, []);

    const hasil = await service.awardForXpWithin(tx, 'talent-1');

    expect(hasil).toEqual([]);
    expect(tx.talentBadge.createMany).not.toHaveBeenCalled();
    expect(tx.badge.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          requiredXp: { lte: 600 },
          earnedBy: { none: { talentId: 'talent-1' } },
        }),
      }),
    );
  });

  it('tidak melempar ketika profil talenta tidak ada', async () => {
    const tx = buatTx(null, []);
    await expect(service.awardForXpWithin(tx, 'hilang')).resolves.toEqual([]);
    expect(tx.badge.findMany).not.toHaveBeenCalled();
  });

  /**
   * Lencananya sudah tersimpan sebelum notifikasi dikirim. Email yang gagal
   * tidak boleh menggagalkan penilaian yang sudah selesai.
   */
  it('menelan kegagalan notifikasi', async () => {
    notifications.sendNotification.mockRejectedValue(new Error('SMTP mati'));

    await expect(
      service.notifyAwarded('user-1', [
        { id: 'b1', title: 'Top Coder', description: 'Master of algorithms' },
      ]),
    ).resolves.toBeUndefined();

    expect(notifications.sendNotification).toHaveBeenCalledTimes(1);
  });
});
