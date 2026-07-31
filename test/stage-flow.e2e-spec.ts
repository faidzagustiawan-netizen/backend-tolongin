import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { StageGateService } from '../src/stages/stage-gate.service';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * Alur tahap terhadap basis data sungguhan.
 *
 * Seluruh uji lain memakai tiruan, dan tiruan tidak pernah menegakkan indeks
 * unik, batasan kunci asing, maupun urutan penulisan di dalam transaksi. Justru
 * di situ kejutan biasanya muncul — jadi bagian ini butuh basis data nyata.
 *
 * ## Menjalankannya
 *
 * ```bash
 * TEST_DATABASE_URL="postgresql://...localhost:5432/tolongin_test" npx jest --config ./test/jest-e2e.json stage-flow
 * ```
 *
 * Tanpa `TEST_DATABASE_URL`, seluruh blok ini dilewati — bukan gagal. Uji yang
 * menulis tidak boleh menjadi alasan pipeline merah di lingkungan yang memang
 * tidak menyediakan basis data.
 *
 * Basis datanya harus khusus untuk pengujian: setiap uji membuat perusahaan,
 * talenta, dan studi kasus sendiri lalu menghapusnya. `DATABASE_URL` biasa
 * SENGAJA tidak dipakai sebagai cadangan — di repositori ini nilainya menunjuk
 * basis data produksi, dan uji ini menulis.
 */
const TEST_URL = process.env.TEST_DATABASE_URL;

// `describe.skip` bukan `it.skip`: tanpa basis data, bahkan menyiapkan klien
// Prisma pun tidak mungkin.
const describeWithDb = TEST_URL ? describe : describe.skip;

describeWithDb('Alur tahap (integrasi)', () => {
  let prisma: PrismaClient;
  let pool: Pool;
  let service: StageGateService;
  let notifications: { sendNotification: jest.Mock };

  /** Penanda baris milik uji ini, supaya pembersihannya bisa tepat sasaran. */
  const TAG = `e2e-stage-${Date.now()}`;

  let companyUserId: string;
  let talentUserId: string;
  let challengeId: string;
  let enrollmentId: string;
  let stageOneId: string;
  let stageTwoId: string;

  beforeAll(async () => {
    // Klien dibangun lewat adapter pg, sama seperti `PrismaService` di runtime.
    // Itu satu-satunya cara menentukan URL di sini: sejak Prisma 7 klien ini
    // memakai driver adapter, dan opsi `datasources`/`datasourceUrl` tidak lagi
    // berlaku bersamanya.
    pool = new Pool({ connectionString: TEST_URL });
    prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
    await prisma.$connect();

    notifications = {
      sendNotification: jest.fn().mockResolvedValue(undefined),
    };
    service = new StageGateService(
      prisma as unknown as PrismaService,
      notifications as any,
    );
  });

  afterAll(async () => {
    // Penghapusan mengalir lewat onDelete: Cascade dari User dan Challenge.
    await prisma.challenge
      .deleteMany({ where: { slug: { startsWith: TAG } } })
      .catch(() => undefined);
    await prisma.user
      .deleteMany({ where: { email: { endsWith: `${TAG}.test` } } })
      .catch(() => undefined);
    await prisma.$disconnect();
    await pool.end();
  });

  beforeAll(async () => {
    const company = await prisma.user.create({
      data: {
        email: `company-${TAG}.test`,
        passwordHash: 'x',
        role: 'COMPANY',
        companyProfile: {
          create: { companyName: `PT ${TAG}`, industry: 'Teknologi' },
        },
      },
      include: { companyProfile: true },
    });
    companyUserId = company.id;

    const talent = await prisma.user.create({
      data: {
        email: `talent-${TAG}.test`,
        passwordHash: 'x',
        role: 'TALENT',
        talentProfile: { create: { fullName: `Kandidat ${TAG}` } },
      },
      include: { talentProfile: true },
    });
    talentUserId = talent.talentProfile!.id;

    // Bidang pekerjaan kini baris direktori `skills`, bukan nilai enum.
    const category = await prisma.skill.upsert({
      where: { name: 'Backend Development' },
      update: {},
      create: { name: 'Backend Development' },
      select: { id: true },
    });

    // Tahap 1 berbatas 30 menit; Tahap 2 butuh nilai minimal 70 dari Tahap 1.
    const challenge = await prisma.challenge.create({
      data: {
        companyId: company.companyProfile!.id,
        title: `Studi Kasus ${TAG}`,
        slug: `${TAG}-studi-kasus`,
        summary: 'Ringkas',
        description: 'Deskripsi',
        categoryId: category.id,
        difficulty: 'INTERMEDIATE',
        gradingRubric: {},
        status: 'PUBLISHED',
        sections: {
          create: [
            { title: 'Tahap 1', order: 0, timeLimit: 30, gateMode: 'OPEN' },
            {
              title: 'Tahap 2',
              order: 1,
              gateMode: 'MIN_SCORE',
              minScore: 70,
              scoreBasis: 'PREVIOUS_STAGE',
            },
          ],
        },
      },
      include: { sections: { orderBy: { order: 'asc' } } },
    });

    challengeId = challenge.id;
    stageOneId = challenge.sections[0].id;
    stageTwoId = challenge.sections[1].id;

    const enrollment = await prisma.challengeEnrollment.create({
      data: {
        talentId: talentUserId,
        challengeId,
        status: 'IN_PROGRESS',
      },
    });
    enrollmentId = enrollment.id;
  });

  it('membuat baris attempt saat keadaan tahap pertama kali dibaca', async () => {
    const stages = await service.getStages(talentUserId, enrollmentId);

    expect(stages).toHaveLength(2);
    // Tahap pertama terbuka, tahap kedua menunggu nilai yang belum ada.
    expect(stages[0].unlocked).toBe(true);
    expect(stages[1].unlocked).toBe(false);
    expect(stages[1].lockReason).toMatch(/Menunggu nilai/);
  });

  it('tidak membuat attempt ganda saat dibaca berulang kali', async () => {
    // Indeks unik (enrollmentId, sectionId) inilah yang tidak pernah diuji oleh
    // tiruan. Dua pembacaan bersamaan dari tab berbeda adalah kejadian biasa.
    await Promise.all([
      service.getStages(talentUserId, enrollmentId),
      service.getStages(talentUserId, enrollmentId),
      service.getStages(talentUserId, enrollmentId),
    ]);

    const count = await prisma.stageAttempt.count({ where: { enrollmentId } });
    expect(count).toBe(2);
  });

  it('mencap batas waktu dari timeLimit saat tahap dimulai', async () => {
    const before = Date.now();
    const stage = await service.startStage(
      talentUserId,
      enrollmentId,
      stageOneId,
    );

    expect(stage.status).toBe('IN_PROGRESS');
    expect(stage.expiresAt).not.toBeNull();

    // 30 menit dari sekarang, dengan kelonggaran untuk waktu tempuh query.
    const expiresAt = new Date(stage.expiresAt!).getTime();
    expect(expiresAt - before).toBeGreaterThan(29 * 60_000);
    expect(expiresAt - before).toBeLessThan(31 * 60_000);
  });

  it('tidak memperpanjang waktu ketika tahap dimulai ulang', async () => {
    // Kalau tidak, memuat ulang halaman menjadi cara memperpanjang waktu.
    const first = await prisma.stageAttempt.findUniqueOrThrow({
      where: {
        enrollmentId_sectionId: { enrollmentId, sectionId: stageOneId },
      },
    });

    await service.startStage(talentUserId, enrollmentId, stageOneId);

    const second = await prisma.stageAttempt.findUniqueOrThrow({
      where: {
        enrollmentId_sectionId: { enrollmentId, sectionId: stageOneId },
      },
    });

    expect(second.expiresAt?.getTime()).toBe(first.expiresAt?.getTime());
    expect(second.startedAt?.getTime()).toBe(first.startedAt?.getTime());
  });

  it('menolak memulai tahap yang gerbangnya belum terpenuhi', async () => {
    await expect(
      service.startStage(talentUserId, enrollmentId, stageTwoId),
    ).rejects.toThrow(/Menunggu nilai/);
  });

  it('menolak pengumpulan setelah batas waktu terlampaui', async () => {
    // Batas digeser ke masa lalu, jauh melewati toleransi jam 30 detik.
    await prisma.stageAttempt.update({
      where: {
        enrollmentId_sectionId: { enrollmentId, sectionId: stageOneId },
      },
      data: { expiresAt: new Date(Date.now() - 5 * 60_000) },
    });

    await expect(
      service.assertStageSubmittable(enrollmentId, stageOneId),
    ).rejects.toThrow(/sudah habis/);

    const after = await prisma.stageAttempt.findUniqueOrThrow({
      where: {
        enrollmentId_sectionId: { enrollmentId, sectionId: stageOneId },
      },
    });
    // Penolakan sekaligus menutup tahapnya; tidak menunggu cron.
    expect(after.status).toBe('EXPIRED');
  });

  it('membuka tahap berikutnya setelah nilai memenuhi ambang', async () => {
    const attemptOne = await prisma.stageAttempt.update({
      where: {
        enrollmentId_sectionId: { enrollmentId, sectionId: stageOneId },
      },
      data: { status: 'AWAITING_GRADE', submittedAt: new Date(), score: null },
    });

    // Sebelum nilai keluar, tahap kedua masih tertutup.
    let stages = await service.getStages(talentUserId, enrollmentId);
    expect(stages[1].unlocked).toBe(false);

    await service.settleStageScore(attemptOne.id, 85);

    stages = await service.getStages(talentUserId, enrollmentId);
    expect(stages[1].unlocked).toBe(true);
    expect(stages[1].lockReason).toBeNull();
  });

  it('menutup kembali tidak terjadi: tahap yang sudah terbuka tetap terbuka', async () => {
    // Nilai diturunkan di bawah ambang setelah tahapnya terbuka. Kandidat yang
    // sudah dipersilakan masuk tidak boleh dikeluarkan lagi — `unlockedAt` yang
    // sudah tercap adalah janji yang sudah diberikan.
    const attemptOne = await prisma.stageAttempt.findUniqueOrThrow({
      where: {
        enrollmentId_sectionId: { enrollmentId, sectionId: stageOneId },
      },
    });
    await prisma.stageAttempt.update({
      where: { id: attemptOne.id },
      data: { score: 10 },
    });

    const stages = await service.getStages(talentUserId, enrollmentId);
    const stageTwo = stages.find((s) => s.sectionId === stageTwoId)!;

    expect(stageTwo.unlocked).toBe(true);
  });

  it('memberi kabar kepada kandidat saat tahap terbuka', async () => {
    expect(notifications.sendNotification).toHaveBeenCalled();
    const judul = notifications.sendNotification.mock.calls.map((c) => c[1]);
    expect(judul).toContain('Tahap Berikutnya Terbuka');
  });

  it('menolak pembacaan oleh talenta lain', async () => {
    await expect(
      service.getStages('talenta-yang-bukan-pemilik', enrollmentId),
    ).rejects.toThrow(/Akses ditolak/);
  });
});
