import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import { faker } from '@faker-js/faker';
import {
  Role,
  VerificationStatus,
  SubscriptionTier,
  ChallengeCategory,
  ChallengeDifficulty,
  ChallengeStatus,
  ChallengeType,
  EnrollmentStatus,
  SubmissionStatus,
} from '@prisma/client';
import { realChallenges, publicChallenges } from './real-data';

@Injectable()
export class SeedService {
  private readonly logger = new Logger(SeedService.name);

  constructor(private readonly prisma: PrismaService) {}

  async seed() {
    this.logger.log(
      'Memulai proses seeding data MASSAL (30 Challenges, 30 Talents)...',
    );

    try {
      await this.prisma.$executeRawUnsafe(`TRUNCATE TABLE "users" CASCADE;`);
      await this.prisma.$executeRawUnsafe(`TRUNCATE TABLE "badges" CASCADE;`);
      await this.prisma.$executeRawUnsafe(
        `TRUNCATE TABLE "challenges" CASCADE;`,
      );
    } catch (error) {
      this.logger.warn(
        'Gagal melakukan truncate, mencoba deleteMany fallback...',
      );
      await this.prisma.user.deleteMany();
      await this.prisma.badge.deleteMany();
      await this.prisma.challenge.deleteMany();
    }

    const saltRounds = 10;
    const defaultPassword = await bcrypt.hash('password123', saltRounds);

    // 1. Create Badges
    const badges = [
      {
        title: 'Top Coder',
        description: 'Master of algorithms',
        iconUrl: 'https://placehold.co/100/10b981/fff?text=Code',
        requiredXp: 500,
      },
      {
        title: 'UI Wizard',
        description: 'Design perfectionist',
        iconUrl: 'https://placehold.co/100/ec4899/fff?text=UI',
        requiredXp: 400,
      },
      {
        title: 'Bug Hunter',
        description: 'Squashed 100 bugs',
        iconUrl: 'https://placehold.co/100/ef4444/fff?text=Bug',
        requiredXp: 300,
      },
    ];
    for (const b of badges) {
      await this.prisma.badge.create({ data: b });
    }

    // 2. Create 5 Companies
    const companies: any[] = [];
    for (let i = 0; i < 5; i++) {
      const email = `company${i + 1}@test.com`;
      const user = await this.prisma.user.create({
        data: {
          email,
          passwordHash: defaultPassword,
          role: Role.COMPANY,
          isVerified: true,
        },
      });
      const profile = await this.prisma.companyProfile.create({
        data: {
          userId: user.id,
          companyName: faker.company.name(),
          industry: faker.helpers.arrayElement([
            'Fintech',
            'E-Commerce',
            'SaaS',
            'EdTech',
            'HealthTech',
          ]),
          subscriptionTier: faker.helpers.arrayElement([
            SubscriptionTier.CUSTOM,
            SubscriptionTier.STARTUP,
            SubscriptionTier.KONGLOMERAT,
          ]),
          kybStatus: VerificationStatus.VERIFIED,
          logoUrl: `https://api.dicebear.com/7.x/initials/svg?seed=${email}`,
          companySize: '100-500',
          trustScore: faker.number.int({ min: 80, max: 100 }),
        },
      });

      // Create extra team members & logs
      for (let j = 0; j < 3; j++) {
        const memEmail = `member${j + 1}_${email}`;
        const memUser = await this.prisma.user.create({
          data: {
            email: memEmail,
            passwordHash: defaultPassword,
            role: Role.COMPANY,
            isVerified: true,
          },
        });
        await this.prisma.companyMember.create({
          data: { userId: memUser.id, companyId: profile.id, role: 'MEMBER' },
        });
        await this.prisma.companyActivityLog.create({
          data: {
            companyId: profile.id,
            userId: memUser.id,
            action: 'MEMBER_JOINED',
            entityType: 'USER',
            entityId: memUser.id,
            details: { email: memEmail },
          },
        });
      }

      // Activity Log for Profile creation
      await this.prisma.companyActivityLog.create({
        data: {
          companyId: profile.id,
          userId: user.id,
          action: 'PROFILE_UPDATED',
          entityType: 'COMPANY_PROFILE',
          entityId: profile.id,
          details: {
            updatedFields: ['companyName', 'industry', 'subscriptionTier'],
          },
        },
      });

      // Notification
      await this.prisma.notification.create({
        data: {
          userId: user.id,
          title: 'Selamat Datang',
          content: 'Selamat datang di platform Tolongin!',
        },
      });

      companies.push(profile);
    }

    // 3. Create 30 Talents
    const talents: any[] = [];
    for (let i = 0; i < 30; i++) {
      const email = `talent${i + 1}@test.com`;
      const user = await this.prisma.user.create({
        data: {
          email,
          passwordHash: defaultPassword,
          role: Role.TALENT,
          isVerified: true,
        },
      });
      const profile = await this.prisma.talentProfile.create({
        data: {
          userId: user.id,
          fullName: faker.person.fullName(),
          headline: faker.person.jobTitle(),
          skills: faker.helpers.arrayElements(
            ['React', 'Node.js', 'Python', 'Figma', 'AWS', 'SQL', 'TypeScript'],
            3,
          ),
          faceVerificationStatus: faker.helpers.arrayElement([
            VerificationStatus.VERIFIED,
            VerificationStatus.VERIFIED,
            VerificationStatus.UNVERIFIED,
          ]),
          xp: faker.number.int({ min: 100, max: 5000 }),
          level: faker.number.int({ min: 1, max: 20 }),
          avatarUrl: `https://api.dicebear.com/7.x/avataaars/svg?seed=${email}`,
          tokenBalance: faker.number.int({ min: 100, max: 1000 }),
        },
      });

      // Notification
      await this.prisma.notification.create({
        data: {
          userId: user.id,
          title: 'Selamat Datang',
          content: 'Profil talenta Anda berhasil dibuat!',
        },
      });

      talents.push({ user, profile });
    }

    // 4. Create Challenges from real-data.ts
    const challenges: any[] = [];

    // 4A. Seed Company Challenges
    for (let i = 0; i < realChallenges.length; i++) {
      const company = faker.helpers.arrayElement(companies);
      const data = realChallenges[i];

      const challenge = await this.prisma.challenge.create({
        data: {
          companyId: company.id,
          talentId: null,
          title: data.title,
          slug: faker.helpers
            .slugify(`${company.companyName}-${data.category}-${i}`)
            .toLowerCase(),
          summary: data.summary,
          description: data.description,
          category: data.category as any,
          difficulty: data.difficulty as any,
          status: ChallengeStatus.PUBLISHED,
          challengeType: ChallengeType.COMPANY,
          rewardDescription: `Sistem Reward: Hingga 75 Token & 400 XP`,
          gradingRubric: {
            requireProctoring: faker.datatype.boolean(),
            proctoringSettings: {
              continuousTracking: true,
              maxTabSwitches: 3,
            },
          },
        },
      });

      for (let secIdx = 0; secIdx < data.sections.length; secIdx++) {
        const secData = data.sections[secIdx];
        await this.prisma.challengeSection.create({
          data: {
            challengeId: challenge.id,
            title: secData.title,
            description: secData.description,
            order: secIdx + 1,
            components: {
              create: secData.components.map((comp, compIdx) => ({
                challengeId: challenge.id,
                type: comp.type as any,
                order: compIdx + 1,
                points: Math.floor(100 / secData.components.length),
                question: comp.question,
                options: comp.options || undefined,
              })),
            },
          },
        });
      }

      const completeChallenge = await this.prisma.challenge.findUnique({
        where: { id: challenge.id },
        include: { components: { orderBy: { order: 'asc' } } },
      });
      challenges.push(completeChallenge);
    }

    // 4B. Seed Talent (Public) Challenges
    for (let i = 0; i < publicChallenges.length; i++) {
      const talent = faker.helpers.arrayElement(talents);
      const data = publicChallenges[i];

      const challenge = await this.prisma.challenge.create({
        data: {
          companyId: null,
          talentId: talent.profile.id,
          title: data.title,
          slug: faker.helpers
            .slugify(`${talent.profile.fullName}-${data.category}-${i}`)
            .toLowerCase(),
          summary: data.summary,
          description: data.description,
          category: data.category as any,
          difficulty: data.difficulty as any,
          status: ChallengeStatus.PUBLISHED,
          challengeType: ChallengeType.PUBLIC,
          rewardDescription: `Bounty: 50 Token & 100 XP`,
          gradingRubric: {
            requireProctoring: false,
          },
        },
      });

      for (let secIdx = 0; secIdx < data.sections.length; secIdx++) {
        const secData = data.sections[secIdx];
        await this.prisma.challengeSection.create({
          data: {
            challengeId: challenge.id,
            title: secData.title,
            description: secData.description,
            order: secIdx + 1,
            components: {
              create: secData.components.map((comp, compIdx) => ({
                challengeId: challenge.id,
                type: comp.type as any,
                order: compIdx + 1,
                points: Math.floor(100 / secData.components.length),
                question: comp.question,
                options: comp.options || undefined,
              })),
            },
          },
        });
      }

      const completeChallenge = await this.prisma.challenge.findUnique({
        where: { id: challenge.id },
        include: { components: { orderBy: { order: 'asc' } } },
      });
      challenges.push(completeChallenge);
    }

    // 5. Create Enrollments and Submissions (Randomly 3-5 per Talent)
    for (const talent of talents) {
      const selectedChallenges = faker.helpers.arrayElements(
        challenges,
        faker.number.int({ min: 3, max: 5 }),
      );

      for (const challenge of selectedChallenges) {
        const isCompleted = faker.datatype.boolean(); // 50% chance completed
        const status = isCompleted
          ? EnrollmentStatus.SUBMITTED
          : EnrollmentStatus.ENROLLED;

        const enrollment = await this.prisma.challengeEnrollment.create({
          data: {
            talentId: talent.profile.id,
            challengeId: challenge.id,
            status: status,
            startedAt: faker.date.recent({ days: 10 }),
            completedAt: isCompleted ? faker.date.recent({ days: 2 }) : null,
            draftData: !isCompleted
              ? ({ notes: 'Draft in progress...' } as any)
              : undefined,
          },
        });

        if (isCompleted) {
          const isPassed = faker.datatype.boolean(); // 50% Passed, 50% Failed
          const subStatus = isPassed
            ? SubmissionStatus.PASSED
            : SubmissionStatus.FAILED;
          const finalScore = isPassed
            ? faker.number.int({ min: 70, max: 100 })
            : faker.number.int({ min: 10, max: 50 });

          // Map realistic component responses based on pass/fail
          const realDataRef = realChallenges.find(
            (rc) => rc.title === challenge.title,
          );
          const componentResponses: any[] = [];

          if (realDataRef) {
            for (const section of realDataRef.sections) {
              for (const comp of section.components) {
                const dbComp = challenge.components.find(
                  (c: any) => c.question === comp.question,
                );
                if (!dbComp) continue;

                let textValue = '';
                if (comp.type === 'MULTIPLE_CHOICE' && comp.options) {
                  // Find correct or wrong option
                  const opt = isPassed
                    ? comp.options.find((o) => o.isCorrect)
                    : comp.options.find((o) => !o.isCorrect);
                  textValue = opt ? opt.text : comp.options[0].text;
                } else {
                  textValue = isPassed
                    ? comp.correctAnswerText ||
                      'Solusi berhasil diimplementasikan.'
                    : comp.wrongAnswerText ||
                      'Saya bingung cara mengerjakannya.';
                }

                componentResponses.push({
                  componentId: dbComp.id,
                  textValue: textValue,
                  score: isPassed ? dbComp.points : 0,
                });
              }
            }
          }

          const submission = await this.prisma.submission.create({
            data: {
              enrollmentId: enrollment.id,
              talentId: talent.profile.id,
              challengeId: challenge.id,
              notes: isPassed
                ? 'Tugas selesai, silakan direview!'
                : 'Maaf saya kesulitan di bagian integrasi API.',
              solutionFilesUrl: 'https://github.com/talent/solution',
              aiScore: finalScore,
              aiCorrectionSummary: isPassed
                ? 'Logika kode sangat bersih.'
                : 'Terdapat banyak error saat kompilasi.',
              status: subStatus,
              finalScore: finalScore,
              reviewerFeedback: isPassed
                ? 'Bagus sekali, kodenya rapi!'
                : 'Sayang sekali, masih banyak requirement yang belum terpenuhi.',
              componentResponses: {
                create: componentResponses,
              },
            },
          });

          // Add to showcased submissions if passed
          if (isPassed && faker.datatype.boolean()) {
            await this.prisma.talentProfile.update({
              where: { id: talent.profile.id },
              data: { showcasedSubmissionIds: { push: submission.id } },
            });
          }
        }
      }
    }

    this.logger.log(
      '✅ Mass Seeding Selesai! Berhasil membuat 30+ Talent, 5 Company, 30 Challenge, dan ratusan data Enrollment/Submission.',
    );
    return {
      success: true,
      message: 'Database telah diisi dengan konsep permainan masif.',
    };
  }
}
