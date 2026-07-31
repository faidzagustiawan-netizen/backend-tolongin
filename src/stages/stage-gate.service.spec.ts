import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { StageGateService } from './stage-gate.service';
import { StageAttemptStatus } from '@prisma/client';

/**
 * Aturan pintu masuk, diuji lewat `getStages` — satu-satunya jalan klien
 * mengetahui keadaan tahap. Sengaja tidak menguji fungsi privat satu-satu:
 * yang harus benar adalah jawaban yang sampai ke kandidat.
 */
describe('StageGateService', () => {
  let service: StageGateService;
  let prisma: any;
  let attempts: any[];
  let notifications: any;

  const section = (over: Record<string, unknown> = {}) => ({
    id: 'sec-1',
    title: 'Tahap 1',
    order: 0,
    timeLimit: null,
    opensAt: null,
    closesAt: null,
    gateMode: 'OPEN',
    minScore: null,
    maxAdvancing: null,
    scoreBasis: 'PREVIOUS_STAGE',
    gateSourceIds: [],
    pendingPolicy: 'WAIT_FOR_SCORE',
    graceDays: null,
    components: [{ type: 'MULTIPLE_CHOICE', points: 10 }],
    ...over,
  });

  // `sectionId` disebut terpisah dari sisanya karena ikut menyusun id attempt:
  // dengan `Record<string, unknown>` polos, nilainya bertipe unknown dan tidak
  // sah dipakai di dalam template literal.
  const attempt = (
    over: { sectionId?: string } & Record<string, unknown> = {},
  ) => ({
    id: `att-${over.sectionId ?? 'sec-1'}`,
    enrollmentId: 'enr-1',
    sectionId: 'sec-1',
    status: StageAttemptStatus.LOCKED,
    startedAt: null,
    expiresAt: null,
    submittedAt: null,
    score: null,
    gradedAt: null,
    unlockedAt: null,
    lockReason: null,
    approvedAt: null,
    approvedById: null,
    ...over,
  });

  /** Menyiapkan satu pendaftaran dengan daftar tahap dan attempt tertentu. */
  const setup = (sections: any[], seeded: any[]) => {
    attempts = seeded;

    prisma.challengeEnrollment.findUnique.mockResolvedValue({
      id: 'enr-1',
      talentId: 'tal-1',
      challenge: { sections },
    });
  };

  beforeEach(async () => {
    prisma = {
      challengeEnrollment: { findUnique: jest.fn() },
      stageAttempt: {
        findMany: jest.fn(() => Promise.resolve(attempts)),
        createMany: jest.fn(() => Promise.resolve({ count: 0 })),
        // Penulisan diterapkan ke tiruan in-memory supaya perubahan yang
        // diputuskan mesin gerbang terlihat pada pembacaan berikutnya.
        update: jest.fn(({ where, data }: any) => {
          const target = attempts?.find((a) => a.id === where.id);
          // Tidak setiap pengujian menyiapkan attempt in-memory — yang menguji
          // persetujuan manual, misalnya, hanya memeriksa argumen penulisannya.
          if (!target) return Promise.resolve({ id: where.id, ...data });
          Object.assign(target, data);
          return Promise.resolve(target);
        }),
      },
      talentProfile: { findUnique: jest.fn().mockResolvedValue(null) },
      challenge: { findFirst: jest.fn() },
    };

    // Mengembalikan promise, bukan undefined: pemanggilnya merangkai `.catch()`
    // supaya satu notifikasi yang gagal tidak menggagalkan seluruh putaran.
    notifications = {
      sendNotification: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StageGateService,
        { provide: PrismaService, useValue: prisma },
        { provide: NotificationsService, useValue: notifications },
      ],
    }).compile();

    service = module.get<StageGateService>(StageGateService);
  });

  it('membuka tahap pertama yang tidak bergerbang', async () => {
    setup([section()], [attempt()]);

    const [stage] = await service.getStages('tal-1', 'enr-1');

    expect(stage.unlocked).toBe(true);
    expect(stage.lockReason).toBeNull();
  });

  it('menolak pemilik pendaftaran yang berbeda', async () => {
    setup([section()], [attempt()]);

    await expect(service.getStages('tal-lain', 'enr-1')).rejects.toThrow(
      /Akses ditolak/,
    );
  });

  it('mengunci tahap ketika nilai di bawah ambang, dengan angkanya disebut', async () => {
    setup(
      [
        section(),
        section({
          id: 'sec-2',
          title: 'Tahap 2',
          order: 1,
          gateMode: 'MIN_SCORE',
          minScore: 70,
        }),
      ],
      [
        attempt({ status: StageAttemptStatus.SUBMITTED, score: 62 }),
        attempt({ sectionId: 'sec-2' }),
      ],
    );

    const stages = await service.getStages('tal-1', 'enr-1');
    const second = stages.find((s) => s.sectionId === 'sec-2')!;

    expect(second.unlocked).toBe(false);
    // Alasannya harus menyebut ambang dan nilai kandidat: tanpa angka, kandidat
    // tidak tahu sejauh apa dia kurang.
    expect(second.lockReason).toContain('70');
    expect(second.lockReason).toContain('62');
  });

  it('membuka tahap ketika nilai mencapai ambang', async () => {
    setup(
      [
        section(),
        section({
          id: 'sec-2',
          order: 1,
          gateMode: 'MIN_SCORE',
          minScore: 70,
        }),
      ],
      [
        attempt({ status: StageAttemptStatus.SUBMITTED, score: 70 }),
        attempt({ sectionId: 'sec-2' }),
      ],
    );

    const stages = await service.getStages('tal-1', 'enr-1');
    expect(stages.find((s) => s.sectionId === 'sec-2')!.unlocked).toBe(true);
  });

  it('menahan tahap selama nilai tahap sebelumnya belum keluar', async () => {
    setup(
      [
        section(),
        section({
          id: 'sec-2',
          order: 1,
          gateMode: 'MIN_SCORE',
          minScore: 70,
        }),
      ],
      [
        // AWAITING_GRADE: jawaban sudah masuk, nilainya belum ada.
        attempt({ status: StageAttemptStatus.AWAITING_GRADE, score: null }),
        attempt({ sectionId: 'sec-2' }),
      ],
    );

    const stages = await service.getStages('tal-1', 'enr-1');
    const second = stages.find((s) => s.sectionId === 'sec-2')!;

    expect(second.unlocked).toBe(false);
    expect(second.lockReason).toMatch(/Menunggu nilai/);
  });

  it('memperlakukan tahap yang kedaluwarsa tanpa nilai sebagai nol', async () => {
    // Tanpa ini kandidat bisa menghindari gerbang dengan cara sederhana: tidak
    // mengumpulkan apa pun, sehingga nilainya tetap null dan gerbang menggantung.
    setup(
      [
        section(),
        section({
          id: 'sec-2',
          order: 1,
          gateMode: 'MIN_SCORE',
          minScore: 70,
        }),
      ],
      [
        attempt({ status: StageAttemptStatus.EXPIRED, score: null }),
        attempt({ sectionId: 'sec-2' }),
      ],
    );

    const stages = await service.getStages('tal-1', 'enr-1');
    const second = stages.find((s) => s.sectionId === 'sec-2')!;

    expect(second.unlocked).toBe(false);
    expect(second.lockReason).toContain('nilai Anda 0');
  });

  it('menutup tahap yang batas waktunya sudah lewat, tanpa menunggu cron', async () => {
    const lewat = new Date(Date.now() - 60_000);
    setup(
      [section({ timeLimit: 30 })],
      [
        attempt({
          status: StageAttemptStatus.IN_PROGRESS,
          startedAt: new Date(Date.now() - 3_600_000),
          expiresAt: lewat,
        }),
      ],
    );

    const [stage] = await service.getStages('tal-1', 'enr-1');

    expect(stage.status).toBe(StageAttemptStatus.EXPIRED);
    expect(stage.remainingSeconds).toBeNull();
  });

  it('melaporkan sisa waktu menurut jam server', async () => {
    setup(
      [section({ timeLimit: 30 })],
      [
        attempt({
          status: StageAttemptStatus.IN_PROGRESS,
          startedAt: new Date(),
          expiresAt: new Date(Date.now() + 600_000),
        }),
      ],
    );

    const [stage] = await service.getStages('tal-1', 'enr-1');

    expect(stage.remainingSeconds).toBeGreaterThan(590);
    expect(stage.remainingSeconds).toBeLessThanOrEqual(600);
  });

  it('mengunci tahap yang belum tiba waktu bukanya', async () => {
    setup(
      [section({ opensAt: new Date(Date.now() + 86_400_000) })],
      [attempt()],
    );

    const [stage] = await service.getStages('tal-1', 'enr-1');

    expect(stage.unlocked).toBe(false);
    expect(stage.lockReason).toMatch(/baru dibuka/);
  });

  it('mengunci tahap yang sudah lewat waktu tutupnya', async () => {
    setup(
      [section({ closesAt: new Date(Date.now() - 86_400_000) })],
      [attempt()],
    );

    const [stage] = await service.getStages('tal-1', 'enr-1');

    expect(stage.unlocked).toBe(false);
    expect(stage.lockReason).toMatch(/sudah ditutup/);
  });

  it('menahan tahap MANUAL_APPROVAL sampai perusahaan meloloskan', async () => {
    setup(
      [
        section(),
        section({ id: 'sec-2', order: 1, gateMode: 'MANUAL_APPROVAL' }),
      ],
      [
        attempt({ status: StageAttemptStatus.SUBMITTED, score: 90 }),
        attempt({ sectionId: 'sec-2' }),
      ],
    );

    const stages = await service.getStages('tal-1', 'enr-1');
    const second = stages.find((s) => s.sectionId === 'sec-2')!;

    // Nilai tinggi pun tidak membuka: yang dibutuhkan keputusan manusia.
    expect(second.unlocked).toBe(false);
    expect(second.lockReason).toMatch(/manual/);
  });

  it('membobot nilai kumulatif dengan poin tiap tahap', async () => {
    // Tahap 1 bernilai 100 dengan 10 poin, tahap 2 bernilai 0 dengan 90 poin.
    // Rata-rata polos menghasilkan 50 dan meloloskan; pembobotan poin
    // menghasilkan 10 dan menahan.
    setup(
      [
        section({
          id: 'sec-1',
          components: [{ type: 'MULTIPLE_CHOICE', points: 10 }],
        }),
        section({
          id: 'sec-2',
          order: 1,
          components: [{ type: 'MULTIPLE_CHOICE', points: 90 }],
        }),
        section({
          id: 'sec-3',
          order: 2,
          gateMode: 'MIN_SCORE',
          scoreBasis: 'CUMULATIVE',
          minScore: 50,
        }),
      ],
      [
        attempt({
          sectionId: 'sec-1',
          status: StageAttemptStatus.SUBMITTED,
          score: 100,
        }),
        attempt({
          sectionId: 'sec-2',
          status: StageAttemptStatus.SUBMITTED,
          score: 0,
        }),
        attempt({ sectionId: 'sec-3' }),
      ],
    );

    const stages = await service.getStages('tal-1', 'enr-1');
    expect(stages.find((s) => s.sectionId === 'sec-3')!.unlocked).toBe(false);
  });

  it('membuka tahap otomatis setelah masa tunggu penilaian terlampaui', async () => {
    setup(
      [
        section(),
        section({
          id: 'sec-2',
          order: 1,
          gateMode: 'MIN_SCORE',
          minScore: 70,
          pendingPolicy: 'AUTO_ADVANCE_AFTER',
          graceDays: 3,
        }),
      ],
      [
        attempt({
          status: StageAttemptStatus.AWAITING_GRADE,
          score: null,
          // Dikumpulkan sepuluh hari lalu dan belum dinilai.
          submittedAt: new Date(Date.now() - 10 * 86_400_000),
        }),
        attempt({ sectionId: 'sec-2' }),
      ],
    );

    const stages = await service.getStages('tal-1', 'enr-1');
    expect(stages.find((s) => s.sectionId === 'sec-2')!.unlocked).toBe(true);
  });

  it('masih menahan tahap bila masa tunggu penilaian belum terlampaui', async () => {
    setup(
      [
        section(),
        section({
          id: 'sec-2',
          order: 1,
          gateMode: 'MIN_SCORE',
          minScore: 70,
          pendingPolicy: 'AUTO_ADVANCE_AFTER',
          graceDays: 3,
        }),
      ],
      [
        attempt({
          status: StageAttemptStatus.AWAITING_GRADE,
          score: null,
          submittedAt: new Date(Date.now() - 86_400_000),
        }),
        attempt({ sectionId: 'sec-2' }),
      ],
    );

    const stages = await service.getStages('tal-1', 'enr-1');
    const second = stages.find((s) => s.sectionId === 'sec-2')!;

    expect(second.unlocked).toBe(false);
    // Kandidat diberi tahu kapan tahapnya terbuka sendiri, bukan hanya bahwa
    // dia harus menunggu.
    expect(second.lockReason).toMatch(/terbuka otomatis/);
  });

  describe('persetujuan manual', () => {
    const ownedAttempt = {
      id: 'att-1',
      enrollmentId: 'enr-1',
      approvedAt: null,
      enrollment: {
        talentId: 'tal-1',
        challenge: { companyId: 'co-1', talentId: null },
        talent: { id: 'tal-1', userId: 'user-tal' },
      },
      section: { title: 'Tahap 2' },
    };

    beforeEach(() => {
      prisma.stageAttempt.findUnique = jest
        .fn()
        .mockResolvedValue(ownedAttempt);
    });

    it('menolak pemanggil yang bukan pemilik studi kasus', async () => {
      await expect(
        service.approveStage('user-lain', 'co-lain', 'att-1'),
      ).rejects.toThrow(/Hanya pemilik studi kasus/);

      expect(prisma.stageAttempt.update).not.toHaveBeenCalled();
    });

    it('meloloskan kandidat dan mengirim kabar', async () => {
      const result = await service.approveStage('user-1', 'co-1', 'att-1');

      expect(result.alreadyApproved).toBe(false);
      // Gerbang dibuka lewat `unlockedAt`; `lockReason` dibersihkan supaya
      // kandidat tidak melihat alasan terkunci pada tahap yang sudah terbuka.
      const data = prisma.stageAttempt.update.mock.calls[0][0].data;
      expect(data.approvedById).toBe('user-1');
      expect(data.unlockedAt).toBeInstanceOf(Date);
      expect(data.lockReason).toBeNull();
      expect(notifications.sendNotification).toHaveBeenCalledTimes(1);
    });

    it('tidak mengirim kabar dua kali saat tombol diklik ganda', async () => {
      prisma.stageAttempt.findUnique = jest.fn().mockResolvedValue({
        ...ownedAttempt,
        approvedAt: new Date('2026-07-30'),
      });

      const result = await service.approveStage('user-1', 'co-1', 'att-1');

      expect(result.alreadyApproved).toBe(true);
      expect(prisma.stageAttempt.update).not.toHaveBeenCalled();
      expect(notifications.sendNotification).not.toHaveBeenCalled();
    });

    it('menolak membaca daftar persetujuan milik studi kasus orang lain', async () => {
      prisma.challenge.findFirst.mockResolvedValue(null);

      await expect(
        service.listPendingApprovals('co-lain', 'ch-1'),
      ).rejects.toThrow(/Akses ditolak/);
    });

    it('menyertakan nilai tahap sebelumnya sebagai dasar keputusan', async () => {
      prisma.challenge.findFirst.mockResolvedValue({ id: 'ch-1' });
      prisma.stageAttempt.findMany = jest
        .fn()
        // Panggilan pertama: attempt yang menunggu persetujuan.
        .mockResolvedValueOnce([
          {
            id: 'att-2',
            lockReason: 'Menunggu perusahaan meloloskan Anda.',
            enrollmentId: 'enr-1',
            section: { id: 'sec-2', title: 'Tahap 2', order: 1 },
            enrollment: {
              talent: {
                slug: 'budi',
                fullName: 'Budi',
                headline: null,
                avatarUrl: null,
              },
            },
          },
        ])
        // Panggilan kedua: nilai yang sudah ada di pendaftaran itu.
        .mockResolvedValueOnce([
          {
            enrollmentId: 'enr-1',
            score: 82,
            section: { title: 'Tahap 1', order: 0 },
          },
          // Tahap sesudahnya tidak boleh ikut: bukan dasar keputusan ini.
          {
            enrollmentId: 'enr-1',
            score: 90,
            section: { title: 'Tahap 3', order: 2 },
          },
        ]);

      const [item] = await service.listPendingApprovals('co-1', 'ch-1');

      expect(item.attemptId).toBe('att-2');
      expect(item.previousScores).toEqual([{ title: 'Tahap 1', score: 82 }]);
    });
  });

  describe('kuota TOP_N', () => {
    /** Tahap 1 bernilai, Tahap 2 bergerbang kuota 1 orang. */
    const quotaSections = [
      section({ id: 'sec-1', title: 'Tahap 1', order: 0 }),
      section({
        id: 'sec-2',
        title: 'Tahap 2',
        order: 1,
        gateMode: 'TOP_N',
        maxAdvancing: 1,
        closesAt: new Date(Date.now() - 86_400_000),
      }),
    ];

    /** Dua kandidat: enr-1 bernilai 90, enr-2 bernilai 40. */
    const scoredAttempts = [
      { ...attempt({ sectionId: 'sec-1' }), enrollmentId: 'enr-1', score: 90 },
      { ...attempt({ sectionId: 'sec-1' }), enrollmentId: 'enr-2', score: 40 },
      { ...attempt({ sectionId: 'sec-2' }), enrollmentId: 'enr-1' },
      { ...attempt({ sectionId: 'sec-2' }), enrollmentId: 'enr-2' },
    ];

    const undecided = [
      {
        id: 'att-menang',
        enrollmentId: 'enr-1',
        enrollment: { talent: { userId: 'user-1' } },
      },
      {
        id: 'att-kalah',
        enrollmentId: 'enr-2',
        enrollment: { talent: { userId: 'user-2' } },
      },
    ];

    beforeEach(() => {
      prisma.challengeSection = {
        findUnique: jest.fn().mockResolvedValue({
          ...quotaSections[1],
          challenge: { sections: quotaSections },
        }),
      };
      prisma.stageAttempt.updateMany = jest
        .fn()
        .mockResolvedValue({ count: 1 });
      prisma.stageAttempt.findMany = jest
        .fn()
        // Panggilan pertama: nilai tahap sumber beserta attempt tahap ini.
        .mockResolvedValueOnce(scoredAttempts)
        // Panggilan kedua: attempt yang belum diputuskan.
        .mockResolvedValueOnce(undecided);
    });

    it('membuka yang teratas dan menutup sisanya', async () => {
      const opened = await service.applyQuota('sec-2');

      expect(opened).toBe(1);

      const calls = prisma.stageAttempt.updateMany.mock.calls;
      const pemenang = calls.find((c: any) => c[0].data.unlockedAt);
      const bukanPemenang = calls.find(
        (c: any) => c[0].data.status === 'FAILED',
      );

      expect(pemenang[0].where.id.in).toEqual(['att-menang']);
      expect(bukanPemenang[0].where.id.in).toEqual(['att-kalah']);
    });

    it('memberi kabar kepada yang lolos maupun yang tidak', async () => {
      // Gerbang kuota yang membuka diam-diam menjadi ruang tunggu tanpa pintu:
      // yang lolos tidak tahu boleh masuk, yang tidak lolos menunggu sesuatu
      // yang tidak akan datang.
      await service.applyQuota('sec-2');

      const penerima = notifications.sendNotification.mock.calls.map(
        (c: any) => c[0],
      );
      expect(penerima).toEqual(['user-1', 'user-2']);
    });

    it('tidak mengirim kabar dua kali pada putaran cron berikutnya', async () => {
      prisma.stageAttempt.findMany = jest
        .fn()
        .mockResolvedValueOnce(scoredAttempts)
        // Semuanya sudah diputuskan di putaran sebelumnya.
        .mockResolvedValueOnce([]);

      const opened = await service.applyQuota('sec-2');

      expect(opened).toBe(0);
      expect(notifications.sendNotification).not.toHaveBeenCalled();
      expect(prisma.stageAttempt.updateMany).not.toHaveBeenCalled();
    });
  });
});
