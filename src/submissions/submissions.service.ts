import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AiService } from '../ai/ai.service';
import { TokensService } from '../tokens/tokens.service';
import { EnrollDto } from './dto/enroll.dto';
import { SubmitSolutionDto } from './dto/submit-solution.dto';
import { GradeSubmissionDto } from './dto/grade-submission.dto';
import {
  EnrollmentStatus,
  SubmissionStatus,
  HiringStatus,
} from '@prisma/client';

@Injectable()
export class SubmissionsService implements OnModuleInit, OnModuleDestroy {
  private cronInterval: any;

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiService: AiService,
    private readonly tokensService: TokensService,
  ) {}

  onModuleInit() {
    // Jalankan pengecekan setiap jam (3600000 ms)
    this.cronInterval = setInterval(() => {
      this.runPunishmentCron().catch((err) => console.error('Cron Error:', err));
    }, 3600000);
  }

  onModuleDestroy() {
    if (this.cronInterval) clearInterval(this.cronInterval);
  }

  async runPunishmentCron() {
    console.log('[Cron] Mengecek submisi yang melebihi batas waktu (7 hari)...');
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const neglectedSubmissions = await this.prisma.submission.findMany({
      where: {
        status: { in: [SubmissionStatus.PENDING_AI, SubmissionStatus.UNDER_REVIEW] },
        createdAt: { lt: sevenDaysAgo },
        autoPassed: false,
      },
      include: {
        challenge: true,
        talent: true,
      }
    });

    for (const sub of neglectedSubmissions) {
      const companyId = sub.challenge.companyId;
      if (!companyId) continue;

      await this.prisma.$transaction(async (tx) => {
        // Auto-pass submission
        await tx.submission.update({
          where: { id: sub.id },
          data: {
            status: SubmissionStatus.PASSED,
            autoPassed: true,
            evaluatedAt: new Date(),
            reviewerFeedback: 'Sistem: Otomatis disetujui karena Perusahaan tidak merespons (SLA Timeout).',
          },
        });

        // Kurangi Trust Score Perusahaan
        await tx.companyProfile.update({
          where: { id: companyId },
          data: { trustScore: { decrement: 5 } },
        });

        // Berikan token ke talent
        await tx.talentProfile.update({
          where: { id: sub.talentId },
          data: { tokenBalance: { increment: 50 }, xp: { increment: 150 } },
        });

        // Tambah ke portfolio
        await tx.portfolio.upsert({
          where: { submissionId: sub.id },
          create: {
            talentId: sub.talentId,
            submissionId: sub.id,
            showcaseSummary: `Berhasil menyelesaikan studi kasus otomatis (Auto-Passed) dari challenge ${sub.challenge.title}.`,
          },
          update: {
            showcaseSummary: `Berhasil menyelesaikan studi kasus otomatis (Auto-Passed) dari challenge ${sub.challenge.title}.`,
          },
        });
      });
      console.log(`[Cron] Submisi ${sub.id} di-auto-pass. Trust score company diturunkan.`);
    }
  }

  async enroll(talentId: string, enrollDto: EnrollDto) {
    const challenge = await this.prisma.challenge.findUnique({
      where: { id: enrollDto.challengeId },
    });

    if (!challenge) {
      throw new NotFoundException('Challenge tidak ditemukan');
    }

    const existingEnrollment =
      await this.prisma.challengeEnrollment.findUnique({
        where: {
          talentId_challengeId: {
            talentId,
            challengeId: enrollDto.challengeId,
          },
        },
      });

    if (existingEnrollment) {
      throw new BadRequestException('Anda sudah terdaftar di challenge ini');
    }

    return this.prisma.challengeEnrollment.create({
      data: {
        talentId,
        challengeId: enrollDto.challengeId,
        status: EnrollmentStatus.IN_PROGRESS,
        ndaSignedAt: new Date(),
      },
    });
  }

  async submitSolution(talentId: string, dto: SubmitSolutionDto) {
    const enrollment = await this.prisma.challengeEnrollment.findUnique({
      where: { id: dto.enrollmentId },
      include: { challenge: { include: { company: true } } },
    });

    if (!enrollment || enrollment.talentId !== talentId) {
      throw new ForbiddenException('Akses ditolak: Pendaftaran tidak valid');
    }

    if (enrollment.status === EnrollmentStatus.SUBMITTED) {
      throw new BadRequestException(
        'Solusi untuk challenge ini sudah dikumpulkan',
      );
    }

    let aiScore: number | null = null;
    let aiPlagiarismScore: number | null = null;
    let aiCorrectionSummary: string | null = null;
    let initialStatus: SubmissionStatus = SubmissionStatus.UNDER_REVIEW;

    const isCompanyChallenge = enrollment.challenge.challengeType === 'COMPANY';
    const companyTier = enrollment.challenge.company?.subscriptionTier;
    const shouldRunAi = !isCompanyChallenge || (isCompanyChallenge && companyTier !== 'STARTUP');

    if (shouldRunAi) {
      const evaluation = await this.aiService.evaluateSubmission(
        enrollment.challenge.title,
        enrollment.challenge.category,
        dto.repositoryUrl,
        dto.notes,
      );
      aiScore = evaluation.aiScore;
      aiPlagiarismScore = evaluation.aiPlagiarismScore;
      aiCorrectionSummary = evaluation.aiCorrectionSummary;
      initialStatus = SubmissionStatus.PENDING_AI; // Although we already awaited it, keep status flow if needed or just UNDER_REVIEW
      initialStatus = SubmissionStatus.UNDER_REVIEW; // Set to UNDER_REVIEW since we run it synchronously here
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.challengeEnrollment.update({
        where: { id: dto.enrollmentId },
        data: {
          status: EnrollmentStatus.SUBMITTED,
          completedAt: new Date(),
        },
      });

      const submission = await tx.submission.create({
        data: {
          enrollmentId: dto.enrollmentId,
          talentId,
          challengeId: enrollment.challengeId,
          solutionFilesUrl: dto.solutionFilesUrl,
          repositoryUrl: dto.repositoryUrl,
          figmaUrl: dto.figmaUrl,
          liveDemoUrl: dto.liveDemoUrl,
          notes: dto.notes,
          aiPlagiarismScore,
          aiCorrectionSummary,
          aiScore,
          status: initialStatus,
          componentResponses: dto.responses?.length > 0 ? {
            create: dto.responses.map(r => ({
              componentId: r.componentId,
              textValue: r.textValue,
              fileUrl: r.fileUrl,
            }))
          } : undefined,
        },
      });

      return submission;
    });
  }

  async getChallengeStats(companyId: string) {
    const challenges = await this.prisma.challenge.findMany({
      where: { companyId },
      include: {
        submissions: {
          select: { status: true, createdAt: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return challenges.map((challenge) => {
      const totalSubmissions = challenge.submissions.length;
      const unreviewedSubmissions = challenge.submissions.filter(
        (s) => s.status === SubmissionStatus.PENDING_AI || s.status === SubmissionStatus.UNDER_REVIEW
      );
      
      let nearestSlaDate: Date | null = null;
      if (unreviewedSubmissions.length > 0) {
        const oldest = unreviewedSubmissions.reduce((a, b) => (a.createdAt < b.createdAt ? a : b));
        const deadline = new Date(oldest.createdAt);
        deadline.setDate(deadline.getDate() + 7);
        nearestSlaDate = deadline;
      }

      const { submissions, ...challengeData } = challenge;
      return {
        ...challengeData,
        stats: {
          totalSubmissions,
          unreviewedCount: unreviewedSubmissions.length,
          nearestSlaDate,
        },
      };
    });
  }

  async getSubmissionsForCompany(companyId: string, challengeId?: string) {
    const where: any = {
      challenge: { companyId },
    };

    if (challengeId) {
      where.challengeId = challengeId;
    }

    return this.prisma.submission.findMany({
      where,
      include: {
        talent: {
          select: {
            fullName: true,
            avatarUrl: true,
            skills: true,
            githubUrl: true,
          },
        },
        challenge: {
          select: { title: true, difficulty: true, category: true },
        },
        componentResponses: {
          include: { component: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getTalentEnrollments(talentId: string) {
    return this.prisma.challengeEnrollment.findMany({
      where: { talentId },
      include: {
        challenge: {
          include: {
            company: { select: { companyName: true, logoUrl: true } },
            components: { orderBy: { order: 'asc' } },
          },
        },
        submissions: {
          include: { componentResponses: true },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async gradeSubmission(
    companyId: string,
    submissionId: string,
    dto: GradeSubmissionDto,
  ) {
    const submission = await this.prisma.submission.findUnique({
      where: { id: submissionId },
      include: {
        challenge: { include: { company: true } },
        enrollment: true,
        talent: true,
      },
    });

    if (!submission || (submission.challenge.companyId && submission.challenge.companyId !== companyId)) {
      throw new ForbiddenException('Akses ditolak: Solusi tidak valid');
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const updatedSubmission = await tx.submission.update({
        where: { id: submissionId },
        data: {
          finalScore: dto.finalScore,
          reviewerFeedback: dto.reviewerFeedback,
          status: dto.status,
          hiringStatus: dto.hiringStatus ?? HiringStatus.NONE,
          evaluatedAt: new Date(),
        },
      });

      await tx.challengeEnrollment.update({
        where: { id: submission.enrollmentId },
        data: { status: EnrollmentStatus.EVALUATED },
      });

      if (dto.status === SubmissionStatus.PASSED) {
        const xpGain = 150;
        await tx.talentProfile.update({
          where: { id: submission.talentId },
          data: { xp: { increment: xpGain } },
        });

        await tx.portfolio.upsert({
          where: { submissionId },
          create: {
            talentId: submission.talentId,
            submissionId,
            verifiedBadgeUrl:
              'https://storage.tolongin.co/badges/verified-case-badge.png',
            showcaseSummary: `Berhasil menyelesaikan studi kasus ${submission.challenge.title} dari ${submission.challenge.company?.companyName || 'Komunitas'} dengan nilai ${dto.finalScore}/100.`,
          },
          update: {
            showcaseSummary: `Berhasil menyelesaikan studi kasus ${submission.challenge.title} dengan nilai ${dto.finalScore}/100.`,
          },
        });
      }

      return updatedSubmission;
    });

    if (dto.status === SubmissionStatus.PASSED) {
       // Grant tokens outside the transaction to avoid tying it up, or call tokensService.earnTokens which creates its own transaction.
       // Since the submission transaction succeeded, we can safely grant tokens.
       try {
         await this.tokensService.earnTokens(
           submission.talent.userId,
           50,
           `Reward: Menyelesaikan ${submission.challenge.title}`
         );
       } catch (err) {
         console.error('Failed to grant tokens', err);
       }
    }

    return result;
  }
}
