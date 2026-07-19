import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { AiService } from '../ai/ai.service';
import {
  SubmissionStatus,
  EnrollmentStatus,
  ChallengeType,
  HiringStatus,
} from '@prisma/client';

@Injectable()
export class SubmissionsCronService {
  private readonly logger = new Logger(SubmissionsCronService.name);
  private isProcessing = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiService: AiService,
  ) {}

  @Cron(CronExpression.EVERY_30_SECONDS)
  async handleAiEvaluations() {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      // Cari submission yang masih berstatus PENDING_AI, ambil maksimal 5 untuk di-batch
      const pendingSubmissions = await this.prisma.submission.findMany({
        where: {
          status: SubmissionStatus.PENDING_AI,
        },
        include: {
          enrollment: {
            include: {
              challenge: {
                include: {
                  components: true,
                  sections: { include: { components: true } },
                },
              },
            },
          },
          talent: true,
          componentResponses: true,
        },
        take: 5,
        orderBy: { createdAt: 'asc' },
      });

      if (pendingSubmissions.length === 0) {
        this.isProcessing = false;
        return;
      }

      this.logger.log(`Memproses ${pendingSubmissions.length} antrean AI...`);

      for (const submission of pendingSubmissions) {
        try {
          const { challenge } = submission.enrollment;

          const componentsData: any[] = [];

          if (submission.componentResponses) {
            for (const r of submission.componentResponses) {
              const compData =
                challenge.components.find((c: any) => c.id === r.componentId) ||
                challenge.sections
                  .flatMap((s: any) => s.components)
                  .find((c: any) => c.id === r.componentId);

              if (compData) {
                componentsData.push({
                  id: compData.id,
                  question: compData.question,
                  maxPoints: compData.points || 10,
                  candidateAnswer: r.textValue || r.fileUrl || '',
                });
              }
            }
          }

          if (componentsData.length === 0) {
            // Jika tidak ada komponen, setel ke manual review saja
            await this.markAsManualReview(
              submission.id,
              submission.enrollmentId,
            );
            continue;
          }

          // Panggil AI (jika gagal, akan melempar AI_EVALUATION_FAILED)
          const evaluation = await this.aiService.evaluateComponents(
            challenge.title,
            challenge.category,
            componentsData,
            challenge.gradingRubric as Record<string, number>,
          );

          // Update hasil AI
          await this.prisma.$transaction(async (tx) => {
            await tx.submission.update({
              where: { id: submission.id },
              data: {
                aiPlagiarismScore: evaluation.aiPlagiarismScore,
                aiCorrectionSummary: evaluation.aiCorrectionSummary,
                aiScore: evaluation.aiScore,
                status: SubmissionStatus.UNDER_REVIEW, // AI berhasil, tinggal review manual final
              },
            });

            // Update respons komponen individual
            if (evaluation.components) {
              for (const ec of evaluation.components) {
                await tx.componentResponse.updateMany({
                  where: {
                    submissionId: submission.id,
                    componentId: ec.componentId,
                  },
                  data: {
                    score: ec.score,
                    aiFeedback: ec.aiFeedback,
                  },
                });
              }
            }
          });

          this.logger.log(
            `Sukses mengevaluasi submission ${submission.id} via AI`,
          );
        } catch (error) {
          this.logger.error(
            `Gagal mengevaluasi AI untuk submission ${submission.id}:`,
            error,
          );
          await this.markAsManualReview(submission.id, submission.enrollmentId);
        }
      }
    } catch (error) {
      this.logger.error('Error saat menjalankan antrean AI:', error);
    } finally {
      this.isProcessing = false;
    }
  }

  private async markAsManualReview(submissionId: string, enrollmentId: string) {
    try {
      await this.prisma.submission.update({
        where: { id: submissionId },
        data: {
          status: SubmissionStatus.UNDER_REVIEW,
        },
      });
      // Beritahu sistem bahwa ini butuh manual review
      this.logger.log(
        `Submission ${submissionId} dialihkan ke peninjauan manual (UNDER_REVIEW)`,
      );
    } catch (e) {
      this.logger.error(`Gagal mengubah status fallback ke UNDER_REVIEW:`, e);
    }
  }
}
