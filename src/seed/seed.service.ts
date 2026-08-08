import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import {
  Role,
  VerificationStatus,
  SubscriptionTier,
  ChallengeStatus,
  ChallengeType,
  EnrollmentStatus,
  SubmissionStatus,
  HiringStatus,
  BadgeCriteria,
  ChallengeDifficulty,
  Prisma,
} from '@prisma/client';
import { realChallenges, publicChallenges } from './real-data';
import { BadgesService } from '../badges/badges.service';
import {
  LEGACY_JOB_CATEGORY_NAMES,
  LegacyJobCategoryCode,
} from '../common/job-categories';

@Injectable()
export class SeedService {
  private readonly logger = new Logger(SeedService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly badgesService: BadgesService,
  ) {}

  /**
   * Kode bidang di `real-data.ts` masih memakai kosakata enum yang lama; di
   * basis data bidang sudah menjadi baris direktori `skills`.
   */
  private async resolveCategoryId(
    code: LegacyJobCategoryCode,
  ): Promise<string> {
    const skill = await this.prisma.skill.upsert({
      where: { name: LEGACY_JOB_CATEGORY_NAMES[code] },
      update: {},
      create: { name: LEGACY_JOB_CATEGORY_NAMES[code] },
      select: { id: true },
    });
    return skill.id;
  }

  async seed() {
    // `@faker-js/faker` dimuat di sini, bukan di puncak berkas, karena dua
    // alasan yang keduanya berakar pada satu fakta: paket itu `devDependencies`
    // dan sejak v10 murni ESM tanpa jalur CommonJS sama sekali.
    //
    // 1. Impor tingkat-modul menariknya masuk ke graf boot AppModule
    //    (app.module -> seed.module -> seed.controller -> seed.service). Instalasi
    //    tanpa dependensi pengembangan (`pnpm install --prod`, `npm ci
    //    --omit=dev`, atau tahap runtime pada build Docker berlapis) membuat
    //    `node dist/src/main.js` mati MODULE_NOT_FOUND saat memuat modul — bukan
    //    saat endpoint ini dipanggil, melainkan seluruh API gagal menyala.
    //    Alur penyebaran sekarang memakai `pnpm install --frozen-lockfile`
    //    sehingga belum terkena, tetapi jaraknya ke bencana cuma satu flag.
    //
    // 2. Registry modul Jest berjalan CommonJS dan tidak mengenal `require(esm)`
    //    milik Node 20.19+, sehingga impor tingkat-modul membuat AppModule tidak
    //    bisa dimuat satu pun uji. Lihat komentar di `guards-di.spec.ts`.
    //
    // Sebagai impor dinamis di dalam badan fungsi, biayanya hanya dibayar saat
    // seeding betul-betul dijalankan. Itu memang perilaku yang benar untuk
    // endpoint khusus pengembangan.
    const { faker } = await import('@faker-js/faker');

    this.logger.log(
      'Memulai proses seeding data MASSAL (30 Challenges, 30 Talents)...',
    );

    try {
      await this.prisma.$executeRawUnsafe(`TRUNCATE TABLE "users" CASCADE;`);
      await this.prisma.$executeRawUnsafe(`TRUNCATE TABLE "badges" CASCADE;`);
      await this.prisma.$executeRawUnsafe(
        `TRUNCATE TABLE "challenges" CASCADE;`,
      );
    } catch (_error) {
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
    //
    // Sepuluh pencapaian dengan kriteria yang benar-benar berbeda, bukan satu
    // angka pada tiga ambang. Judulnya menyebut apa yang diukur — versi lama
    // berbunyi "Bug Hunter — Squashed 100 bugs" untuk sesuatu yang sebenarnya
    // berarti "XP >= 300", dan tidak ada penghitung bug di mana pun.
    //
    // Ambangnya juga direnggangkan. XP talenta teratas menyentuh 4995 sementara
    // ambang lama tertinggi cuma 500, sehingga 83 dari maksimal 90 lencana
    // terbagi pada 30 talenta semaian — 92% jenuh. Sesuatu yang dimiliki
    // hampir semua orang tidak menyampaikan informasi apa pun.
    const badges: Prisma.BadgeCreateInput[] = [
      {
        title: 'Langkah Pertama',
        description: 'Menyelesaikan studi kasus pertama.',
        iconUrl: 'https://placehold.co/100/64748b/fff?text=1',
        criteria: BadgeCriteria.CHALLENGES_PASSED,
        threshold: 1,
      },
      {
        title: 'Pekerja Tetap',
        description: 'Menyelesaikan tiga studi kasus.',
        iconUrl: 'https://placehold.co/100/0ea5e9/fff?text=3',
        criteria: BadgeCriteria.CHALLENGES_PASSED,
        threshold: 3,
      },
      {
        title: 'Nilai Sempurna',
        description: 'Lulus dengan nilai 90 ke atas.',
        iconUrl: 'https://placehold.co/100/f59e0b/fff?text=90',
        criteria: BadgeCriteria.HIGH_SCORES,
        threshold: 1,
      },
      {
        title: 'Penakluk Tingkat Lanjut',
        description: 'Lulus dua studi kasus tingkat ADVANCED.',
        iconUrl: 'https://placehold.co/100/dc2626/fff?text=ADV',
        criteria: BadgeCriteria.DIFFICULTY_PASSED,
        threshold: 2,
        param: ChallengeDifficulty.ADVANCED,
      },
      {
        title: 'Lintas Bidang',
        description: 'Lulus di dua bidang pekerjaan yang berbeda.',
        iconUrl: 'https://placehold.co/100/8b5cf6/fff?text=2x',
        criteria: BadgeCriteria.CATEGORY_BREADTH,
        threshold: 2,
      },
      {
        title: 'Identitas Terverifikasi',
        description: 'Wajah dan KTP sudah dicocokkan sistem.',
        iconUrl: 'https://placehold.co/100/10b981/fff?text=KYC',
        criteria: BadgeCriteria.IDENTITY_VERIFIED,
      },
      {
        title: 'Etalase Terisi',
        description: 'Tiga karya tampil di portofolio publik.',
        iconUrl: 'https://placehold.co/100/14b8a6/fff?text=P3',
        criteria: BadgeCriteria.PORTFOLIO_ENTRIES,
        threshold: 3,
      },
      {
        title: 'Suara Komunitas',
        description: 'Enam tulisan di diskusi studi kasus.',
        iconUrl: 'https://placehold.co/100/ec4899/fff?text=6',
        criteria: BadgeCriteria.DISCUSSION_POSTS,
        threshold: 6,
      },
      {
        title: 'Direkrut',
        description: 'Sebuah submisi berakhir dengan status HIRED.',
        iconUrl: 'https://placehold.co/100/16a34a/fff?text=HIRE',
        criteria: BadgeCriteria.HIRED,
        threshold: 1,
      },
      {
        title: 'Veteran',
        description: 'Mengumpulkan 4.500 XP.',
        iconUrl: 'https://placehold.co/100/eab308/fff?text=4K5',
        criteria: BadgeCriteria.TOTAL_XP,
        threshold: 4500,
      },
    ];
    for (const b of badges) {
      await this.prisma.badge.create({ data: b });
    }

    // 1b. Akun admin.
    //
    // Sebelumnya seeder tidak pernah membuatnya, padahal tombol "Dev Auto Login
    // → Admin" di halaman masuk mengisikan `admin@tolongin.co`. Akibatnya panel
    // admin tidak pernah bisa dibuka di lingkungan pengembangan, dan seluruh
    // halaman di bawah `/admin` hanya bisa diuji dari sisi penolakan akses.
    // Kredensialnya sengaja sama dengan yang diisikan tombol itu.
    //
    // Kata sandinya bisa ditimpa lewat `SEED_ADMIN_PASSWORD`. Di NODE_ENV
    // produksi, tanpa variabel itu adminnya **tidak dibuat sama sekali**:
    // seeder ini bisa terdaftar di produksi bila `ENABLE_SEED_ENDPOINT` disetel
    // (lihat peringatan di DeploymentGuide), dan akun admin bersandi tetap yang
    // diketahui publik mengubah kecelakaan konfigurasi menjadi pengambilalihan
    // platform.
    const adminPasswordPlain =
      process.env.SEED_ADMIN_PASSWORD ||
      (process.env.NODE_ENV === 'production' ? null : 'AdminPassword123');

    if (adminPasswordPlain) {
      await this.prisma.user.create({
        data: {
          email: 'admin@tolongin.co',
          passwordHash: await bcrypt.hash(adminPasswordPlain, saltRounds),
          fullName: 'Admin Tolongin',
          role: Role.ADMIN,
          isVerified: true,
        },
      });
      this.logger.log('Akun admin dibuat: admin@tolongin.co');
    } else {
      this.logger.warn(
        'NODE_ENV=production tanpa SEED_ADMIN_PASSWORD — akun admin dilewati.',
      );
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
          data: { userId: memUser.id, companyId: profile.id },
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
          // Keduanya dulu tidak pernah diisi, jadi seluruh talenta semaian
          // punya roleCategory dan location null — dan penyaring bidang serta
          // wilayah di papan peringkat tidak punya apa pun untuk disaring
          // walau daftar pilihannya sudah benar.
          //
          // Nilainya diambil dari nama bidang yang sama dengan yang dipakai
          // direktori keahlian, bukan daftar baru: itulah yang dikembalikan
          // GET /skills/categories ke antarmuka.
          roleCategory: faker.helpers.arrayElement(
            Object.values(LEGACY_JOB_CATEGORY_NAMES),
          ),
          location: faker.helpers.arrayElement([
            'Jakarta',
            'Bandung',
            'Surabaya',
            'Yogyakarta',
            'Medan',
            'Malang',
          ]),
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
          categoryId: await this.resolveCategoryId(data.category),
          difficulty: data.difficulty as any,
          status: ChallengeStatus.PUBLISHED,
          challengeType: ChallengeType.COMPANY,
          rewardDescription: `Sistem Reward: Hingga 75 Token & 400 XP`,
          gradingRubric: {
            requireProctoring: faker.datatype.boolean(),
          },
          proctoringSettings: {
            continuousTracking: true,
            maxTabSwitches: 3,
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
          categoryId: await this.resolveCategoryId(data.category),
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

          // Tiga hal berikut dulu tidak pernah disemai sama sekali, dan itu
          // membuat basis data pengembangan berbohong tentang keadaan aplikasi:
          //
          //   portofolio  0 baris  -> GET /portfolios selalu kosong
          //   diskusi     0 baris  -> utas di setiap studi kasus selalu kosong
          //   hiringStatus semua NONE -> corong rekrutmen tidak pernah terlihat
          //
          // Ketiganya juga kriteria lencana, jadi tanpa ini tiga lencana
          // mustahil menyala dan fiturnya tampak mati padahal sudah hidup.
          if (isPassed) {
            // Di aplikasi sungguhan baris ini dibuat `gradeSubmission`.
            // Penyemai menulis submisi langsung ke basis data, jadi jalur itu
            // tidak pernah dilewati.
            await this.prisma.portfolio.create({
              data: {
                talentId: talent.profile.id,
                submissionId: submission.id,
                showcaseSummary: `Menyelesaikan ${challenge.title} dengan nilai ${finalScore}/100.`,
              },
            });

            // Corong rekrutmen: sebagian kecil berakhir diterima, sebagian
            // berhenti di tahap sebelumnya. Bukan semua, supaya lencana
            // "Direkrut" tetap berarti sesuatu.
            const hiringStatus = faker.helpers.weightedArrayElement([
              { weight: 6, value: HiringStatus.NONE },
              { weight: 2, value: HiringStatus.SHORTLISTED },
              { weight: 1, value: HiringStatus.INTERVIEW_INVITED },
              { weight: 1, value: HiringStatus.HIRED },
            ]);
            if (hiringStatus !== HiringStatus.NONE) {
              await this.prisma.submission.update({
                where: { id: submission.id },
                data: { hiringStatus },
              });
            }
          }

          // Diskusi tidak bergantung pada kelulusan — orang bertanya justru
          // ketika sedang kesulitan.
          for (let d = 0; d < faker.number.int({ min: 0, max: 4 }); d++) {
            await this.prisma.discussion.create({
              data: {
                challengeId: challenge.id,
                userId: talent.user.id,
                message: faker.helpers.arrayElement([
                  'Apakah dataset yang dilampirkan sudah final?',
                  'Saya menemukan cara lain untuk bagian integrasi, boleh?',
                  'Terima kasih, penjelasan di brief-nya sangat membantu.',
                  'Ada yang sudah mencoba pendekatan caching di sini?',
                  'Batas waktunya masih bisa diperpanjang tidak ya?',
                ]),
              },
            });
          }
        }
      }
    }

    // Lencana disusulkan di akhir, sesudah seluruh XP selesai ditulis.
    //
    // XP semaian diacak 100–5000 sementara ambang lencananya 300/400/500,
    // jadi tanpa langkah ini tab lencana tetap kosong persis seperti sebelum
    // pemberian otomatis ada — dan fiturnya tampak masih mati padahal sudah
    // hidup.
    const lencanaDiberikan = await this.badgesService.backfillAll();

    this.logger.log(
      `✅ Mass Seeding Selesai! Berhasil membuat 1 Admin, 30+ Talent, 5 Company, 30 Challenge, ratusan data Enrollment/Submission, dan ${lencanaDiberikan} lencana.`,
    );
    return {
      success: true,
      message: 'Database telah diisi dengan konsep permainan masif.',
    };
  }
}
