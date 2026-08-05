import { Test } from '@nestjs/testing';
import {
  BadgeCriteria,
  ChallengeDifficulty,
  VerificationStatus,
} from '@prisma/client';
import { BadgesService } from './badges.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

type Lencana = Partial<{
  id: string;
  title: string;
  description: string;
  criteria: BadgeCriteria;
  threshold: number;
  param: string | null;
}>;

function badge(over: Lencana = {}) {
  return {
    id: 'b1',
    title: 'Uji',
    description: 'Lencana uji',
    criteria: BadgeCriteria.TOTAL_XP,
    threshold: 0,
    param: null,
    ...over,
  };
}

/** Transaksi tiruan; setiap penghitung bisa disetel per pengujian. */
function buatTx(
  kandidat: ReturnType<typeof badge>[],
  keadaan: {
    profile?: any;
    submissionCount?: number;
    submissionRows?: any[];
    portfolioCount?: number;
    discussionCount?: number;
  } = {},
) {
  return {
    badge: { findMany: jest.fn().mockResolvedValue(kandidat) },
    talentProfile: {
      findUnique: jest.fn().mockResolvedValue(keadaan.profile ?? null),
    },
    submission: {
      count: jest.fn().mockResolvedValue(keadaan.submissionCount ?? 0),
      findMany: jest.fn().mockResolvedValue(keadaan.submissionRows ?? []),
    },
    portfolio: {
      count: jest.fn().mockResolvedValue(keadaan.portfolioCount ?? 0),
    },
    discussion: {
      count: jest.fn().mockResolvedValue(keadaan.discussionCount ?? 0),
    },
    talentBadge: { createMany: jest.fn().mockResolvedValue({ count: 1 }) },
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

  it('hanya menilai lencana yang belum dimiliki', async () => {
    const tx = buatTx([]);
    await service.awardWithin(tx, 'talent-1');

    expect(tx.badge.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { earnedBy: { none: { talentId: 'talent-1' } } },
      }),
    );
    expect(tx.talentBadge.createMany).not.toHaveBeenCalled();
  });

  it('TOTAL_XP tetap bekerja seperti sebelum kriteria lain ada', async () => {
    const tx = buatTx(
      [badge({ criteria: BadgeCriteria.TOTAL_XP, threshold: 5000 })],
      { profile: { xp: 5000 } },
    );
    await expect(service.awardWithin(tx, 't')).resolves.toHaveLength(1);
  });

  it('TOTAL_XP menolak ketika XP kurang satu pun', async () => {
    const tx = buatTx(
      [badge({ criteria: BadgeCriteria.TOTAL_XP, threshold: 5000 })],
      { profile: { xp: 4999 } },
    );
    await expect(service.awardWithin(tx, 't')).resolves.toEqual([]);
  });

  /**
   * `sectionId: null` adalah inti kriteria ini. Tanpa penyaring itu satu studi
   * kasus bertahap terhitung sebanyak jumlah tahapnya, dan "sepuluh studi
   * kasus" bisa diraih dengan menyelesaikan dua saja.
   */
  it('CHALLENGES_PASSED hanya menghitung submisi studi kasus utuh', async () => {
    const tx = buatTx(
      [badge({ criteria: BadgeCriteria.CHALLENGES_PASSED, threshold: 10 })],
      { submissionCount: 10 },
    );
    await service.awardWithin(tx, 'talent-1');

    expect(tx.submission.count).toHaveBeenCalledWith({
      where: expect.objectContaining({ talentId: 'talent-1', sectionId: null }),
    });
  });

  it('HIGH_SCORES menyaring dengan ambang nilai, bukan sekadar kelulusan', async () => {
    const tx = buatTx(
      [badge({ criteria: BadgeCriteria.HIGH_SCORES, threshold: 3 })],
      { submissionCount: 3 },
    );
    await service.awardWithin(tx, 't');

    expect(tx.submission.count).toHaveBeenCalledWith({
      where: expect.objectContaining({ finalScore: { gte: 90 } }),
    });
  });

  it('DIFFICULTY_PASSED menolak diam-diam bila param kosong', async () => {
    const tx = buatTx(
      [
        badge({
          criteria: BadgeCriteria.DIFFICULTY_PASSED,
          threshold: 1,
          param: null,
        }),
      ],
      { submissionCount: 99 },
    );
    await expect(service.awardWithin(tx, 't')).resolves.toEqual([]);
    expect(tx.submission.count).not.toHaveBeenCalled();
  });

  /**
   * `param` kolom String bebas, jadi salah ketik mungkin. Dulu di-cast paksa
   * `as never` dan diteruskan ke Prisma, yang melempar validation error — di
   * dalam transaksi penilaian, sehingga kelulusan talenta ikut batal. Lencana
   * yang salah pasang tidak boleh menggagalkan penilaian yang sudah selesai.
   */
  it('DIFFICULTY_PASSED menolak param yang bukan nilai enum, tanpa menyentuh basis data', async () => {
    const tx = buatTx(
      [
        badge({
          criteria: BadgeCriteria.DIFFICULTY_PASSED,
          threshold: 1,
          param: 'ADVANCE', // ADVANCED, salah ketik satu huruf
        }),
      ],
      { submissionCount: 99 },
    );
    await expect(service.awardWithin(tx, 't')).resolves.toEqual([]);
    expect(tx.submission.count).not.toHaveBeenCalled();
  });

  it('DIFFICULTY_PASSED menghitung pada param yang sah', async () => {
    const tx = buatTx(
      [
        badge({
          criteria: BadgeCriteria.DIFFICULTY_PASSED,
          threshold: 2,
          param: ChallengeDifficulty.ADVANCED,
        }),
      ],
      { submissionCount: 2 },
    );
    await expect(service.awardWithin(tx, 't')).resolves.toHaveLength(1);
    expect(tx.submission.count).toHaveBeenCalledWith({
      where: expect.objectContaining({
        challenge: { difficulty: ChallengeDifficulty.ADVANCED },
      }),
    });
  });

  /**
   * Yang dihitung bidang BERBEDA, bukan jumlah kelulusan. Sepuluh kemenangan
   * di satu bidang tidak membuat seseorang berwawasan luas.
   */
  it('CATEGORY_BREADTH menghitung bidang unik, bukan banyaknya submisi', async () => {
    const satuBidangEmpatKali = Array.from({ length: 4 }, () => ({
      challenge: { categoryId: 'kat-a' },
    }));
    const tx = buatTx(
      [badge({ criteria: BadgeCriteria.CATEGORY_BREADTH, threshold: 3 })],
      { submissionRows: satuBidangEmpatKali },
    );
    await expect(service.awardWithin(tx, 't')).resolves.toEqual([]);

    const tigaBidang = buatTx(
      [badge({ criteria: BadgeCriteria.CATEGORY_BREADTH, threshold: 3 })],
      {
        submissionRows: [
          { challenge: { categoryId: 'kat-a' } },
          { challenge: { categoryId: 'kat-b' } },
          { challenge: { categoryId: 'kat-c' } },
        ],
      },
    );
    await expect(service.awardWithin(tigaBidang, 't')).resolves.toHaveLength(1);
  });

  it('IDENTITY_VERIFIED mengabaikan threshold', async () => {
    const tx = buatTx(
      [
        badge({
          criteria: BadgeCriteria.IDENTITY_VERIFIED,
          threshold: 999999,
        }),
      ],
      { profile: { faceVerificationStatus: VerificationStatus.VERIFIED } },
    );
    await expect(service.awardWithin(tx, 't')).resolves.toHaveLength(1);
  });

  it('IDENTITY_VERIFIED menolak status selain VERIFIED', async () => {
    const tx = buatTx([badge({ criteria: BadgeCriteria.IDENTITY_VERIFIED })], {
      profile: { faceVerificationStatus: VerificationStatus.PENDING },
    });
    await expect(service.awardWithin(tx, 't')).resolves.toEqual([]);
  });

  it('DISCUSSION_POSTS menghitung lewat userId, bukan talentId', async () => {
    const tx = buatTx(
      [badge({ criteria: BadgeCriteria.DISCUSSION_POSTS, threshold: 20 })],
      { profile: { userId: 'user-9' }, discussionCount: 20 },
    );
    await service.awardWithin(tx, 'talent-1');

    expect(tx.discussion.count).toHaveBeenCalledWith({
      where: { userId: 'user-9' },
    });
  });

  it('memberikan beberapa lencana sekaligus dalam satu penulisan', async () => {
    const tx = buatTx(
      [
        badge({ id: 'a', criteria: BadgeCriteria.TOTAL_XP, threshold: 100 }),
        badge({
          id: 'b',
          criteria: BadgeCriteria.PORTFOLIO_ENTRIES,
          threshold: 5,
        }),
      ],
      { profile: { xp: 500 }, portfolioCount: 5 },
    );

    await expect(service.awardWithin(tx, 't')).resolves.toHaveLength(2);
    expect(tx.talentBadge.createMany).toHaveBeenCalledWith({
      data: [
        { talentId: 't', badgeId: 'a' },
        { talentId: 't', badgeId: 'b' },
      ],
      skipDuplicates: true,
    });
  });

  /**
   * Lencana yang salah pasang tidak boleh menggagalkan penilaian submisi yang
   * sudah selesai.
   */
  it('kriteria tak dikenal ditolak tanpa melempar', async () => {
    const tx = buatTx([badge({ criteria: 'ENTAH_APA' as BadgeCriteria })]);
    await expect(service.awardWithin(tx, 't')).resolves.toEqual([]);
  });

  it('menelan kegagalan notifikasi', async () => {
    notifications.sendNotification.mockRejectedValue(new Error('SMTP mati'));
    await expect(
      service.notifyAwarded('user-1', [
        { id: 'b1', title: 'Uji', description: 'Lencana uji' },
      ]),
    ).resolves.toBeUndefined();
    expect(notifications.sendNotification).toHaveBeenCalledTimes(1);
  });
});
