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
import { SaveDraftDto } from './dto/save-draft.dto';
import { GradeSubmissionDto } from './dto/grade-submission.dto';
import {
  EnrollmentStatus,
  SubmissionStatus,
  HiringStatus,
  ChallengeDifficulty,
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

          // Hitung token & xp dinamis
          const finalScore = 75; // Asumsi nilai kelulusan auto-pass (default 75)
          const rewards = this.calculateRewards(
            sub.challenge.difficulty,
            finalScore
          );

          // Berikan token ke talent
          await tx.talentProfile.update({
            where: { id: sub.talentId },
            data: { xp: { increment: rewards.xp } },
          });

          // Panggil tokenService (bukan di dalam tx untuk menghindari block)
          this.tokensService.earnTokens(
            sub.talent.userId,
            rewards.tokens,
            `Reward: Lulus Otomatis - ${sub.challenge.title}`
          ).catch(err => console.error('Gagal memberi token auto-pass', err));

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

  async saveDraft(talentId: string, enrollmentId: string, dto: SaveDraftDto) {
    const enrollment = await this.prisma.challengeEnrollment.findUnique({
      where: { id: enrollmentId },
    });

    if (!enrollment) {
      throw new NotFoundException('Enrollment tidak ditemukan');
    }

    if (enrollment.talentId !== talentId) {
      throw new BadRequestException('Bukan pemilik enrollment ini');
    }

    return this.prisma.challengeEnrollment.update({
      where: { id: enrollmentId },
      data: {
        draftData: dto.draftData,
      },
    });
  }

  async submitSolution(talentId: string, dto: SubmitSolutionDto) {
    const enrollment = await this.prisma.challengeEnrollment.findUnique({
      where: { id: dto.enrollmentId },
      include: { 
        challenge: { 
          include: { 
            company: true,
            components: true,
            sections: { include: { components: true } }
          } 
        } 
      },
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
    // AI HANYA BERJALAN JIKA: Dibuat oleh perusahaan DAN perusahaan BUKAN paket gratis (STARTUP)
    const shouldRunAi = isCompanyChallenge && companyTier !== 'STARTUP';

    let candidateAnswers = '';
    let componentEvaluations: { componentId: string, score: number, aiFeedback: string }[] = [];
    const allComponents = new Map();
    if (enrollment.challenge.components) {
      enrollment.challenge.components.forEach((c: any) => allComponents.set(c.id, c));
    }
    if (enrollment.challenge.sections) {
      enrollment.challenge.sections.forEach((s: any) => {
        if (s.components) {
          s.components.forEach((c: any) => allComponents.set(c.id, c));
        }
      });
    }

    const hasComponents = allComponents.size > 0;

    if (shouldRunAi) {
      let rubric: Record<string, number> | undefined;
      if (enrollment.challenge.gradingRubric && typeof enrollment.challenge.gradingRubric === 'object') {
        const tempRubric = enrollment.challenge.gradingRubric as Record<string, any>;
        rubric = {};
        for (const key in tempRubric) {
           if (typeof tempRubric[key] === 'number') {
              rubric[key] = tempRubric[key];
           }
        }
      }

      if (hasComponents && dto.responses && dto.responses.length > 0) {
        // Mode 1: Component-Based Evaluation
        const componentsData = dto.responses.map(r => {
           const comp = allComponents.get(r.componentId);
           return {
             id: r.componentId,
             question: comp ? comp.question : 'Soal tidak ditemukan',
             maxPoints: comp ? comp.points : 0,
             candidateAnswer: r.textValue || r.fileUrl || 'Tidak diserahkan'
           };
        });

        const evaluation = await this.aiService.evaluateComponents(
           enrollment.challenge.title,
           enrollment.challenge.category,
           componentsData,
           rubric
        );
        
        aiScore = evaluation.aiScore;
        aiPlagiarismScore = evaluation.aiPlagiarismScore;
        aiCorrectionSummary = evaluation.aiCorrectionSummary;
        componentEvaluations = evaluation.components || [];
        initialStatus = SubmissionStatus.UNDER_REVIEW;
      } else {
        // Mode 2: Holistic Evaluation
        if (dto.responses && dto.responses.length > 0) {
           const parts = dto.responses.map((r, i) => {
             const comp = allComponents.get(r.componentId);
             const questionText = comp ? comp.question : 'Soal tidak ditemukan';
             return `Soal ${i + 1}: ${questionText}\nJawaban: ${r.textValue || r.fileUrl || 'Tidak diserahkan'}\n`;
           });
           candidateAnswers = parts.join('\n');
        }

        const evaluation = await this.aiService.evaluateHolistic(
          enrollment.challenge.title,
          enrollment.challenge.category,
          dto.repositoryUrl,
          dto.notes,
          rubric,
          candidateAnswers
        );
        aiScore = evaluation.aiScore;
        aiPlagiarismScore = evaluation.aiPlagiarismScore;
        aiCorrectionSummary = evaluation.aiCorrectionSummary;
        initialStatus = SubmissionStatus.UNDER_REVIEW; 
      }
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
          componentResponses: dto.responses && dto.responses.length > 0 ? {
            create: dto.responses.map(r => {
              const evalResult = componentEvaluations.find(e => e.componentId === r.componentId);
              return {
                componentId: r.componentId,
                textValue: r.textValue,
                fileUrl: r.fileUrl,
                score: evalResult ? evalResult.score : null,
                aiFeedback: evalResult ? evalResult.aiFeedback : null,
              };
            })
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
        const finalScore = dto.finalScore || 60;
        const rewards = this.calculateRewards(submission.challenge.difficulty, finalScore);
        
        await tx.talentProfile.update({
          where: { id: submission.talentId },
          data: { xp: { increment: rewards.xp } },
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
       const finalScore = dto.finalScore || 60;
       const rewards = this.calculateRewards(submission.challenge.difficulty, finalScore);

       try {
         await this.tokensService.earnTokens(
           submission.talent.userId,
           rewards.tokens,
           `Reward: Menyelesaikan ${submission.challenge.title}`
         );
       } catch (err) {
         console.error('Failed to grant tokens', err);
       }
    }

    return result;
  }

  /**
   * Menghitung potensi Token dan XP berdasarkan tingkat kesulitan dan nilai.
   * @param difficulty BEGINNER | INTERMEDIATE | ADVANCED
   * @param finalScore 0 - 100
   */
  public calculateRewards(difficulty: ChallengeDifficulty, finalScore: number): { xp: number; tokens: number } {
    let baseXP = 100;
    let baseToken = 10;

    switch (difficulty) {
      case ChallengeDifficulty.BEGINNER:
        baseXP = 100;
        baseToken = 10;
        break;
      case ChallengeDifficulty.INTERMEDIATE:
        baseXP = 200;
        baseToken = 30;
        break;
      case ChallengeDifficulty.ADVANCED:
        baseXP = 400;
        baseToken = 75;
        break;
    }

    // XP didapatkan sebanding dengan nilai (maksimal = Base XP jika nilai 100)
    // Minimal nilai kelulusan adalah 0 (jika memang PASSED)
    const normalizedScore = Math.min(Math.max(finalScore, 0), 100);
    const xp = Math.floor(baseXP * (normalizedScore / 100));

    // Token didapatkan FULL jika Passed. Diberikan bonus +50% jika Perfect Score (>= 90).
    let tokens = baseToken;
    if (normalizedScore >= 90) {
      tokens += Math.floor(baseToken * 0.5); // +50% bonus
    }

    return { xp, tokens };
  }
}
