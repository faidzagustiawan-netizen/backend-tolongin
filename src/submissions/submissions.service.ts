import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AiService } from '../ai/ai.service';
import { EnrollDto } from './dto/enroll.dto';
import { SubmitSolutionDto } from './dto/submit-solution.dto';
import { GradeSubmissionDto } from './dto/grade-submission.dto';
import {
  EnrollmentStatus,
  SubmissionStatus,
  HiringStatus,
} from '@prisma/client';

@Injectable()
export class SubmissionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly aiService: AiService,
  ) {}

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
      include: { challenge: true },
    });

    if (!enrollment || enrollment.talentId !== talentId) {
      throw new ForbiddenException('Akses ditolak: Pendaftaran tidak valid');
    }

    if (enrollment.status === EnrollmentStatus.SUBMITTED) {
      throw new BadRequestException(
        'Solusi untuk challenge ini sudah dikumpulkan',
      );
    }

    const { aiScore, aiPlagiarismScore, aiCorrectionSummary } =
      await this.aiService.evaluateSubmission(
        enrollment.challenge.title,
        enrollment.challenge.category,
        dto.repositoryUrl,
        dto.notes,
      );

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
          status: SubmissionStatus.UNDER_REVIEW,
        },
      });

      return submission;
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
          },
        },
        submissions: true,
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

    if (!submission || submission.challenge.companyId !== companyId) {
      throw new ForbiddenException('Akses ditolak: Solusi tidak valid');
    }

    return this.prisma.$transaction(async (tx) => {
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
            showcaseSummary: `Berhasil menyelesaikan studi kasus ${submission.challenge.title} dari ${submission.challenge.company.companyName} dengan nilai ${dto.finalScore}/100.`,
          },
          update: {
            showcaseSummary: `Berhasil menyelesaikan studi kasus ${submission.challenge.title} dengan nilai ${dto.finalScore}/100.`,
          },
        });
      }

      return updatedSubmission;
    });
  }
}
