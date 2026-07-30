import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { SubmissionsService } from './submissions.service';
import { PrismaService } from '../prisma/prisma.service';
import { AiService } from '../ai/ai.service';
import { TokensService } from '../tokens/tokens.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CompaniesService } from '../companies/companies.service';
import { StageGateService } from '../stages/stage-gate.service';
import { GradeSubmissionDto } from './dto/grade-submission.dto';

describe('SubmissionsService — penilaian', () => {
  let service: SubmissionsService;
  let prisma: any;
  let tx: any;
  let tokens: any;
  let stageGate: any;

  const baseSubmission = {
    id: 'sub-1',
    talentId: 'talent-1',
    enrollmentId: 'enr-1',
    evaluatedAt: null,
    challenge: {
      id: 'ch-1',
      companyId: 'co-1',
      talentId: null,
      difficulty: 'INTERMEDIATE',
      title: 'Studi Kasus',
      company: { companyName: 'PT Uji' },
    },
    enrollment: { id: 'enr-1' },
    talent: { id: 'talent-1', userId: 'user-talent' },
  };

  const dto = (over: Partial<GradeSubmissionDto> = {}): GradeSubmissionDto => ({
    finalScore: 80,
    status: 'PASSED',
    ...over,
  });

  beforeEach(async () => {
    tx = {
      submission: { update: jest.fn().mockResolvedValue({ id: 'sub-1' }) },
      challengeEnrollment: { update: jest.fn() },
      talentProfile: { update: jest.fn() },
      portfolio: { upsert: jest.fn() },
      notification: { create: jest.fn() },
    };

    prisma = {
      submission: { findUnique: jest.fn().mockResolvedValue(baseSubmission) },
      $transaction: jest.fn((fn: any) => fn(tx)),
    };

    tokens = {
      earnTokensWithin: jest.fn().mockResolvedValue({ success: true }),
    };

    stageGate = {
      assertStageSubmittable: jest.fn(),
      closeStage: jest.fn(),
      settleStageScore: jest.fn().mockResolvedValue(null),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SubmissionsService,
        { provide: PrismaService, useValue: prisma },
        { provide: AiService, useValue: {} },
        { provide: TokensService, useValue: tokens },
        { provide: NotificationsService, useValue: {} },
        { provide: CompaniesService, useValue: { logAction: jest.fn() } },
        { provide: StageGateService, useValue: stageGate },
      ],
    }).compile();

    service = module.get<SubmissionsService>(SubmissionsService);
  });

  it('menolak penilaian ulang supaya hadiah tidak berlipat', async () => {
    prisma.submission.findUnique.mockResolvedValue({
      ...baseSubmission,
      evaluatedAt: new Date('2026-07-01'),
    });

    await expect(
      service.gradeSubmission('co-1', 'sub-1', dto(), 'user-1', 'COMPANY'),
    ).rejects.toThrow(ForbiddenException);

    expect(tx.talentProfile.update).not.toHaveBeenCalled();
    expect(tokens.earnTokensWithin).not.toHaveBeenCalled();
  });

  it('memberi token di dalam transaksi yang sama dengan XP', async () => {
    await service.gradeSubmission('co-1', 'sub-1', dto(), 'user-1', 'COMPANY');

    expect(tokens.earnTokensWithin).toHaveBeenCalledTimes(1);
    // Argumen pertama harus klien transaksi: token dan XP harus hidup-mati
    // bersama, bukan diberikan belakangan lalu kegagalannya ditelan.
    expect(tokens.earnTokensWithin.mock.calls[0][0]).toBe(tx);
  });

  it('tidak memperlakukan nilai 0 sebagai 60', async () => {
    await service.gradeSubmission(
      'co-1',
      'sub-1',
      dto({ finalScore: 0 }),
      'user-1',
      'COMPANY',
    );

    const xpArg = tx.talentProfile.update.mock.calls[0][0].data.xp.increment;
    expect(xpArg).toBe(0);
  });

  it('menolak pemanggil yang bukan pemilik challenge', async () => {
    await expect(
      service.gradeSubmission('co-lain', 'sub-1', dto(), 'user-1', 'COMPANY'),
    ).rejects.toThrow(/Hanya pembuat Challenge/);
  });

  it('mengizinkan admin menilai meski tanpa profileId', async () => {
    await expect(
      service.gradeSubmission(
        undefined as any,
        'sub-1',
        dto(),
        'admin-1',
        'ADMIN',
      ),
    ).resolves.toBeDefined();
  });

  describe('penilaian per tahap', () => {
    /** Submisi satu tahap dari pendaftaran yang masih berjalan. */
    const stageSubmission = {
      ...baseSubmission,
      sectionId: 'sec-1',
      stageAttemptId: 'att-1',
      enrollment: { id: 'enr-1', status: 'IN_PROGRESS' },
    };

    it('tidak memberi XP, token, maupun portofolio saat menilai satu tahap', async () => {
      // Kalau tidak, satu studi kasus berhadiah sebanyak jumlah tahapnya, dan
      // kandidat mendapat entri portofolio "berhasil menyelesaikan" untuk
      // pengerjaan yang belum tuntas.
      prisma.submission.findUnique.mockResolvedValue(stageSubmission);

      await service.gradeSubmission('co-1', 'sub-1', dto(), 'user-1', 'COMPANY');

      expect(tx.talentProfile.update).not.toHaveBeenCalled();
      expect(tokens.earnTokensWithin).not.toHaveBeenCalled();
      expect(tx.portfolio.upsert).not.toHaveBeenCalled();
    });

    it('tidak menyatakan pendaftaran EVALUATED saat masih ada tahap berjalan', async () => {
      prisma.submission.findUnique.mockResolvedValue(stageSubmission);

      await service.gradeSubmission('co-1', 'sub-1', dto(), 'user-1', 'COMPANY');

      expect(tx.challengeEnrollment.update).not.toHaveBeenCalled();
    });

    it('memberi hadiah pada tahap terakhir, ketika seluruh tahap sudah masuk', async () => {
      // `submitSolution` menyetel pendaftaran menjadi SUBMITTED begitu tidak ada
      // lagi tahap yang bisa dikerjakan — itulah penanda pengerjaan tuntas.
      prisma.submission.findUnique.mockResolvedValue({
        ...stageSubmission,
        enrollment: { id: 'enr-1', status: 'SUBMITTED' },
      });

      await service.gradeSubmission('co-1', 'sub-1', dto(), 'user-1', 'COMPANY');

      expect(tokens.earnTokensWithin).toHaveBeenCalledTimes(1);
      expect(tx.portfolio.upsert).toHaveBeenCalledTimes(1);
      expect(tx.challengeEnrollment.update).toHaveBeenCalledTimes(1);
    });

    it('menuliskan nilai tahap supaya tahap berikutnya bisa terbuka', async () => {
      prisma.submission.findUnique.mockResolvedValue(stageSubmission);

      await service.gradeSubmission(
        'co-1',
        'sub-1',
        dto({ finalScore: 72 }),
        'user-1',
        'COMPANY',
      );

      expect(stageGate.settleStageScore).toHaveBeenCalledWith('att-1', 72);
    });
  });
});
