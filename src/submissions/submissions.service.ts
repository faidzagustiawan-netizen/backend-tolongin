import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AiService } from '../ai/ai.service';
import { TokensService } from '../tokens/tokens.service';
import { NotificationsService } from '../notifications/notifications.service';
import { EnrollDto } from './dto/enroll.dto';
import { SubmitSolutionDto } from './dto/submit-solution.dto';
import { SaveDraftDto } from './dto/save-draft.dto';
import { GradeSubmissionDto } from './dto/grade-submission.dto';
import { UpdateHiringStatusDto } from './dto/update-hiring-status.dto';
import { CompaniesService } from '../companies/companies.service';
import { subscriptionLimitsEnforced } from '../common/dev-flags';
import { computePsychometricProfile } from './psychometric';
import { StageGateService } from '../stages/stage-gate.service';
import {
  CHALLENGE_CATEGORY_SELECT,
  flattenCategory,
} from '../common/selects/challenge-category.select';
import {
  ComponentType,
  EnrollmentStatus,
  SubmissionStatus,
  HiringStatus,
  ChallengeDifficulty,
  Role,
  Prisma,
  StageAttemptStatus,
} from '@prisma/client';

@Injectable()
export class SubmissionsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SubmissionsService.name);
  private cronInterval: any;

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiService: AiService,
    private readonly tokensService: TokensService,
    private readonly notificationsService: NotificationsService,
    private readonly companiesService: CompaniesService,
    private readonly stageGateService: StageGateService,
  ) {}

  onModuleInit() {
    // Jalankan pengecekan setiap jam (3600000 ms)
    this.cronInterval = setInterval(() => {
      this.runPunishmentCron().catch((err) =>
        console.error('Cron Error:', err),
      );
    }, 3600000);
  }

  onModuleDestroy() {
    if (this.cronInterval) clearInterval(this.cronInterval);
  }

  async runPunishmentCron() {
    console.log(
      '[Cron] Mengecek submisi yang melebihi batas waktu (7 hari)...',
    );
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const neglectedSubmissions = await this.prisma.submission.findMany({
      where: {
        status: {
          in: [SubmissionStatus.PENDING_AI, SubmissionStatus.UNDER_REVIEW],
        },
        createdAt: { lt: sevenDaysAgo },
        autoPassed: false,
      },
      include: {
        challenge: true,
        talent: true,
      },
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
            reviewerFeedback:
              'Sistem: Otomatis disetujui karena Perusahaan tidak merespons (SLA Timeout).',
          },
        });

        // Kurangi Trust Score Perusahaan
        await tx.companyProfile.update({
          where: { id: companyId },
          data: { trustScore: { decrement: 5 } },
        });

        // Hadiah dan portofolio hanya untuk pengumpulan yang mewakili seluruh
        // studi kasus. Submisi satu tahap yang lolos otomatis cukup membuka
        // jalan ke tahap berikutnya; memberinya XP, token, dan entri portofolio
        // berarti satu studi kasus berhadiah sebanyak jumlah tahapnya.
        if (!sub.sectionId) {
          // Hitung token & xp dinamis
          const finalScore = 75; // Asumsi nilai kelulusan auto-pass (default 75)
          const rewards = this.calculateRewards(
            sub.challenge.difficulty,
            finalScore,
          );

          // Berikan token ke talent
          await tx.talentProfile.update({
            where: { id: sub.talentId },
            data: { xp: { increment: rewards.xp } },
          });

          // Panggil tokenService (bukan di dalam tx untuk menghindari block)
          this.tokensService
            .earnTokens(
              sub.talent.userId,
              rewards.tokens,
              `Reward: Lulus Otomatis - ${sub.challenge.title}`,
            )
            .catch((err) =>
              console.error('Gagal memberi token auto-pass', err),
            );

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
        }

        // Notifikasi untuk Talent
        await tx.notification.create({
          data: {
            userId: sub.talent.userId,
            title: 'Submisi Lulus Otomatis',
            content: `Submisi Anda pada "${sub.challenge.title}" dinyatakan LULUS otomatis oleh sistem karena melebihi batas waktu evaluasi perusahaan.`,
            linkUrl: `/workspace/${sub.enrollmentId}`,
          },
        });

        // Notifikasi untuk Company
        const companyProfile = await tx.companyProfile.findUnique({
          where: { id: companyId },
        });
        if (companyProfile) {
          await tx.notification.create({
            data: {
              userId: companyProfile.userId,
              title: 'Peringatan: Pelanggaran SLA',
              content: `Peringatan! Trust Score Anda dikurangi 5 poin karena gagal mengevaluasi submisi pada "${sub.challenge.title}" dalam batas waktu 7 hari.`,
              linkUrl: '/workspace',
            },
          });
        }
      });

      // Nilai tahap dituliskan supaya tahap berikutnya bisa terbuka. Tanpa ini
      // submisi tahap yang lolos otomatis tetap tanpa nilai, dan gerbang
      // berbasis nilai menahan kandidat selamanya justru karena perusahaan
      // tidak pernah menilai.
      if (sub.stageAttemptId) {
        await this.stageGateService
          .settleStageScore(sub.stageAttemptId, 75)
          .catch((err) =>
            this.logger.warn(
              `Nilai tahap gagal dituliskan untuk submisi auto-pass ${sub.id}: ${err?.message}`,
            ),
          );
      }

      console.log(
        `[Cron] Submisi ${sub.id} di-auto-pass. Trust score company diturunkan.`,
      );
    }
  }

  async enroll(talentId: string, enrollDto: EnrollDto) {
    const challenge = await this.prisma.challenge.findUnique({
      where: { id: enrollDto.challengeId },
    });

    if (!challenge) {
      throw new NotFoundException('Challenge tidak ditemukan');
    }

    const existingEnrollment = await this.prisma.challengeEnrollment.findUnique(
      {
        where: {
          talentId_challengeId: {
            talentId,
            challengeId: enrollDto.challengeId,
          },
        },
      },
    );

    if (existingEnrollment) {
      throw new BadRequestException('Anda sudah terdaftar di challenge ini');
    }

    const enrollment = await this.prisma.challengeEnrollment.create({
      data: {
        talentId,
        challengeId: enrollDto.challengeId,
        status: EnrollmentStatus.IN_PROGRESS,
        ndaSignedAt: new Date(),
      },
    });

    const talentProfile = await this.prisma.talentProfile.findUnique({
      where: { id: talentId },
    });
    if (talentProfile) {
      await this.notificationsService.sendNotification(
        talentProfile.userId,
        'Studi Kasus Dimulai',
        `Anda telah memulai studi kasus "${challenge.title}". Tenggat waktu pengerjaan Anda telah berjalan.`,
        `/workspace/${enrollment.id}`,
      );
    }

    // Notify the creator of the challenge
    let creatorUserId: string | null = null;
    if (challenge.companyId) {
      const company = await this.prisma.companyProfile.findUnique({
        where: { id: challenge.companyId },
      });
      if (company) creatorUserId = company.userId;
    } else if (challenge.talentId) {
      const creatorTalent = await this.prisma.talentProfile.findUnique({
        where: { id: challenge.talentId },
      });
      if (creatorTalent) creatorUserId = creatorTalent.userId;
    }

    if (creatorUserId) {
      await this.notificationsService.sendNotification(
        creatorUserId,
        'Pendaftar Baru',
        `Seorang talenta baru saja mendaftar untuk mengerjakan studi kasus "${challenge.title}".`,
        `/challenges/${challenge.slug}`,
      );
    }

    return enrollment;
  }

  /**
   * Menilai bagian yang tidak butuh pertimbangan: pilihan ganda.
   *
   * Nilainya keluar seketika, dan itulah yang memungkinkan gerbang berbasis
   * nilai terbuka tanpa menunggu siapa pun. Sisanya — esai, unggahan, rekaman —
   * ditandai `hasSubjective` supaya tahapnya berhenti di AWAITING_GRADE alih-
   * alih dinilai dari separuh jawaban.
   *
   * Soal psikometrik dikeluarkan dari pembilang maupun pembagi: skala Likert
   * tidak punya jawaban benar, jadi memasukkannya mengubah "seberapa benar"
   * menjadi campuran yang tidak bisa ditafsirkan.
   */
  private scoreObjectiveResponses(
    components: any[],
    responses: { componentId: string; textValue?: string }[],
  ): {
    evaluations: { componentId: string; score: number; aiFeedback: string }[];
    score: number | null;
    hasSubjective: boolean;
  } {
    const evaluations: {
      componentId: string;
      score: number;
      aiFeedback: string;
    }[] = [];

    let earned = 0;
    let total = 0;
    let hasSubjective = false;

    for (const component of components) {
      if (component.type === ComponentType.PSYCHOMETRIC) continue;

      const points = Number(component.points) || 0;
      total += points;

      if (component.type !== ComponentType.MULTIPLE_CHOICE) {
        hasSubjective = true;
        continue;
      }

      const options = Array.isArray(component.options) ? component.options : [];
      const answer = responses.find((r) => r.componentId === component.id);
      // Jawaban disimpan sebagai id opsi, bukan teksnya — lihat komentar
      // `ComponentResponse.textValue` di schema.
      const chosen = options.find(
        (o: any) => String(o?.id) === String(answer?.textValue ?? ''),
      );
      const isCorrect = chosen?.isCorrect === true;

      earned += isCorrect ? points : 0;
      evaluations.push({
        componentId: component.id,
        score: isCorrect ? points : 0,
        aiFeedback: isCorrect ? 'Jawaban benar.' : 'Jawaban belum tepat.',
      });
    }

    return {
      evaluations,
      // Tanpa satu pun soal berpoin, tidak ada nilai yang bisa dihitung —
      // membiarkannya 0 akan membuat tahap tanpa soal objektif terbaca sebagai
      // kegagalan.
      score: total > 0 ? (earned / total) * 100 : null,
      hasSubjective,
    };
  }

  /**
   * Apakah tahap ini yang terakhir tersisa untuk dikerjakan.
   *
   * Yang dihitung adalah tahap yang masih mungkin dikerjakan, bukan jumlah
   * tahap seluruhnya: tahap yang tidak akan pernah terbuka bagi kandidat ini —
   * karena gerbangnya tidak terpenuhi — tidak boleh menahan pendaftaran dalam
   * keadaan menggantung selamanya.
   */
  private async isLastOpenStage(
    tx: Prisma.TransactionClient,
    enrollmentId: string,
    currentAttemptId: string,
  ): Promise<boolean> {
    const remaining = await tx.stageAttempt.count({
      where: {
        enrollmentId,
        id: { not: currentAttemptId },
        status: {
          in: [StageAttemptStatus.LOCKED, StageAttemptStatus.IN_PROGRESS],
        },
        // Tahap terkunci hanya dihitung bila masih punya harapan terbuka.
        // `unlockedAt` terisi berarti gerbangnya sudah lolos.
        OR: [
          { status: StageAttemptStatus.IN_PROGRESS },
          { unlockedAt: { not: null } },
        ],
      },
    });

    return remaining === 0;
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

    // Angka pengawasan datang dari peramban, jadi tidak boleh dipercaya apa
    // adanya. Nilai lama dipertahankan bila klien mengirim angka yang lebih
    // kecil, dan status terkunci tidak bisa dibatalkan dari sisi klien.
    // Ini tidak membuat pengawasan sisi klien menjadi anti-rusak, tetapi
    // menutup pengelakan sepele seperti memuat ulang halaman.
    const incoming = (dto.draftData ?? {}) as Record<string, any>;
    const previous = (enrollment.draftData ?? {}) as Record<string, any>;

    const previousCount = Number(previous.tabSwitchCount) || 0;
    const incomingCount = Number(incoming.tabSwitchCount) || 0;

    const previousEvents: string[] = Array.isArray(previous.proctoringEvents)
      ? previous.proctoringEvents.map(String)
      : [];
    const incomingEvents: string[] = Array.isArray(incoming.proctoringEvents)
      ? incoming.proctoringEvents.map(String)
      : [];

    const draftData: Prisma.InputJsonObject = {
      ...incoming,
      tabSwitchCount: Math.max(previousCount, incomingCount),
      proctoringEvents:
        incomingEvents.length >= previousEvents.length
          ? incomingEvents
          : previousEvents,
      isLockedOut: !!previous.isLockedOut || !!incoming.isLockedOut,
    };

    return this.prisma.challengeEnrollment.update({
      where: { id: enrollmentId },
      data: {
        draftData,
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
            sections: { include: { components: true } },
          },
        },
      },
    });

    if (!enrollment || enrollment.talentId !== talentId) {
      throw new ForbiddenException('Akses ditolak: Pendaftaran tidak valid');
    }

    // Penolakan "sudah dikumpulkan" hanya berlaku bagi pengumpulan menyeluruh.
    // Pada pengerjaan bertahap, satu pendaftaran memang mengumpulkan beberapa
    // kali — yang boleh ditolak adalah tahap yang sudah masuk, bukan seluruh
    // pendaftarannya.
    if (!dto.sectionId && enrollment.status === EnrollmentStatus.SUBMITTED) {
      throw new BadRequestException(
        'Solusi untuk challenge ini sudah dikumpulkan',
      );
    }

    // Batas waktu tahap diperiksa terhadap `expiresAt` di basis data, bukan
    // terhadap hitungan yang dikirim peramban.
    const stageAttempt = dto.sectionId
      ? await this.stageGateService.assertStageSubmittable(
          dto.enrollmentId,
          dto.sectionId,
        )
      : null;

    const aiScore: number | null = null;
    const aiPlagiarismScore: number | null = null;
    const aiCorrectionSummary: string | null = null;
    let initialStatus: SubmissionStatus = SubmissionStatus.UNDER_REVIEW;

    const isCompanyChallenge = enrollment.challenge.challengeType === 'COMPANY';
    const companyTier = enrollment.challenge.company?.subscriptionTier;
    // AI berjalan untuk challenge milik perusahaan. Penguncian paket Murah
    // hanya berlaku ketika batas langganan sedang ditegakkan — selama
    // pengembangan seluruh paket mendapat penilaian AI.
    const shouldRunAi =
      isCompanyChallenge &&
      (!subscriptionLimitsEnforced() || companyTier !== 'STARTUP');

    const candidateAnswers = '';
    const allComponents = new Map();
    if (enrollment.challenge.components) {
      enrollment.challenge.components.forEach((c: any) =>
        allComponents.set(c.id, c),
      );
    }
    if (enrollment.challenge.sections) {
      enrollment.challenge.sections.forEach((s: any) => {
        if (s.components) {
          s.components.forEach((c: any) => allComponents.set(c.id, c));
        }
      });
    }

    const hasComponents = allComponents.size > 0;

    // Soal yang menjadi cakupan pengumpulan ini: satu tahap saja bila bertahap,
    // seluruh studi kasus bila menyeluruh. Nilai tahap harus dihitung dari
    // pembagi tahap itu sendiri — memakai total poin seluruh challenge akan
    // membuat tahap pertama yang sempurna terbaca sebagai nilai 20.
    const scopedComponents = dto.sectionId
      ? (enrollment.challenge.sections ?? [])
          .filter((s: any) => s.id === dto.sectionId)
          .flatMap((s: any) => s.components ?? [])
      : [...allComponents.values()];

    const objective = this.scoreObjectiveResponses(
      scopedComponents,
      dto.responses ?? [],
    );

    // Profil psikometrik dihitung di sini, bukan menunggu antrean AI.
    // Perhitungannya murni aritmetika atas jawaban skala, jadi menundanya
    // hanya membuat hasil yang sudah pasti tertahan sampai cron berikutnya —
    // dan hilang sama sekali bila panggilan AI gagal.
    const psychometricProfile = computePsychometricProfile(
      (dto.responses ?? [])
        .map((r) => ({ component: allComponents.get(r.componentId), r }))
        .filter(
          ({ component }) => component?.type === ComponentType.PSYCHOMETRIC,
        )
        .map(({ component, r }) => ({
          metadata: component.metadata,
          value: r.textValue,
        })),
    );

    // AI tidak lagi dieksekusi secara sinkronus di sini karena akan memperlambat respon untuk talenta
    // dan menghabiskan token saat submit.
    // Jika perusahaan berhak menggunakan AI (bukan STARTUP), status diset ke PENDING_AI
    // yang mana akan diproses nanti oleh background job atau trigger manual.
    if (shouldRunAi) {
      initialStatus = SubmissionStatus.PENDING_AI;
    }

    return this.prisma.$transaction(async (tx) => {
      // Pada pengerjaan bertahap, pendaftaran baru dinyatakan selesai setelah
      // tidak ada lagi tahap yang bisa dikerjakan. Menandainya SUBMITTED di
      // tahap pertama akan menutup sisa tahapnya sendiri.
      const isFinalSubmission = stageAttempt
        ? await this.isLastOpenStage(tx, dto.enrollmentId, stageAttempt.id)
        : true;

      if (isFinalSubmission) {
        await tx.challengeEnrollment.update({
          where: { id: dto.enrollmentId },
          data: {
            status: EnrollmentStatus.SUBMITTED,
            completedAt: new Date(),
          },
        });
      }

      if (stageAttempt) {
        await this.stageGateService.closeStage(tx, stageAttempt.id, {
          score: objective.score,
          pendingGrade: objective.hasSubjective,
        });
      }

      const submission = await tx.submission.create({
        data: {
          enrollmentId: dto.enrollmentId,
          talentId,
          challengeId: enrollment.challengeId,
          sectionId: dto.sectionId ?? null,
          stageAttemptId: stageAttempt?.id ?? null,
          solutionFilesUrl: dto.solutionFilesUrl,
          repositoryUrl: dto.repositoryUrl,
          figmaUrl: dto.figmaUrl,
          liveDemoUrl: dto.liveDemoUrl,
          notes: dto.notes,
          aiPlagiarismScore,
          aiCorrectionSummary,
          aiScore,
          psychometricProfile: psychometricProfile ?? undefined,
          status: initialStatus,
          componentResponses:
            dto.responses && dto.responses.length > 0
              ? {
                  create: dto.responses.map((r) => {
                    const evalResult = objective.evaluations.find(
                      (e) => e.componentId === r.componentId,
                    );
                    return {
                      componentId: r.componentId,
                      textValue: r.textValue,
                      fileUrl: r.fileUrl,
                      score: evalResult ? evalResult.score : null,
                      aiFeedback: evalResult ? evalResult.aiFeedback : null,
                    };
                  }),
                }
              : undefined,
        },
      });

      const talentProfile = await tx.talentProfile.findUnique({
        where: { id: talentId },
      });
      if (talentProfile) {
        await tx.notification.create({
          data: {
            userId: talentProfile.userId,
            title: 'Solusi Berhasil Dikumpulkan',
            content: shouldRunAi
              ? `Solusi Anda untuk tantangan "${enrollment.challenge.title}" telah dikumpulkan dan dievaluasi oleh AI. Skor AI: ${aiScore}.`
              : `Solusi Anda untuk tantangan "${enrollment.challenge.title}" berhasil dikumpulkan dan sedang menunggu ulasan.`,
            linkUrl: `/workspace/${dto.enrollmentId}`,
          },
        });
      }

      // Kabar submisi baru dikirim ke seluruh orang yang berhak menilainya,
      // bukan hanya pemilik akun. Anggota tim yang diundang lewat kode
      // undangan sebelumnya tidak pernah menerima pemberitahuan apa pun,
      // sehingga fitur tim berhenti di penambahan anggota saja.
      const recipientUserIds = new Set<string>();

      if (enrollment.challenge.companyId) {
        const company = await tx.companyProfile.findUnique({
          where: { id: enrollment.challenge.companyId },
          select: { userId: true },
        });
        if (company) recipientUserIds.add(company.userId);

        const members = await tx.companyMember.findMany({
          where: { companyId: enrollment.challenge.companyId },
          select: { userId: true },
        });
        for (const member of members) recipientUserIds.add(member.userId);
      } else if (enrollment.challenge.talentId) {
        const creatorTalent = await tx.talentProfile.findUnique({
          where: { id: enrollment.challenge.talentId },
          select: { userId: true },
        });
        if (creatorTalent) recipientUserIds.add(creatorTalent.userId);
      }

      if (recipientUserIds.size > 0) {
        // Tautan lama menunjuk `/company/submissions` yang tidak pernah ada
        // sebagai rute, jadi pemberitahuan ini selalu berujung 404. Kini
        // menunjuk daftar kandidat challenge yang bersangkutan.
        const linkUrl = enrollment.challenge.companyId
          ? `/company/submissions/challenge/${enrollment.challengeId}`
          : `/challenges/${enrollment.challenge.slug}`;

        await tx.notification.createMany({
          data: [...recipientUserIds].map((userId) => ({
            userId,
            title: 'Submisi Baru Masuk',
            content: `Seseorang telah mengumpulkan solusi untuk studi kasus "${enrollment.challenge.title}". Segera lakukan peninjauan!`,
            linkUrl,
          })),
        });
      }

      return submission;
    });
  }

  async getChallengeStats(companyId: string) {
    const challenges = await this.prisma.challenge.findMany({
      where: { companyId },
      include: {
        submissions: {
          // `enrollmentId` ikut dibaca karena satu kandidat kini bisa punya
          // beberapa submisi — satu per tahap.
          select: { status: true, createdAt: true, enrollmentId: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return challenges.map((challenge) => {
      // Yang dihitung adalah jumlah kandidat, bukan jumlah baris submisi. Pada
      // pengerjaan bertahap satu orang mengumpulkan berkali-kali, dan menghitung
      // barisnya membuat angka "Total Pelamar" berlipat sebanyak jumlah tahap.
      const totalSubmissions = new Set(
        challenge.submissions.map((s) => s.enrollmentId),
      ).size;
      const unreviewedSubmissions = challenge.submissions.filter(
        (s) =>
          s.status === SubmissionStatus.PENDING_AI ||
          s.status === SubmissionStatus.UNDER_REVIEW,
      );

      let nearestSlaDate: Date | null = null;
      if (unreviewedSubmissions.length > 0) {
        const oldest = unreviewedSubmissions.reduce((a, b) =>
          a.createdAt < b.createdAt ? a : b,
        );
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

  async getSubmissionsForCompany(
    companyId: string,
    challengeId?: string,
    options: {
      page?: number;
      limit?: number;
      search?: string;
      status?: SubmissionStatus;
      hiringStatus?: HiringStatus;
      sort?: 'recent' | 'oldest' | 'score';
    } = {},
  ) {
    const where: Prisma.SubmissionWhereInput = {
      challenge: { companyId },
    };

    if (challengeId) {
      where.challengeId = challengeId;
    }

    // Penyaringan dikerjakan di basis data, bukan di peramban. Versi lama
    // menyaring larik yang sudah terpaginasi, sehingga mencari kandidat yang
    // ada di halaman tiga selalu memberi hasil nihil.
    const search = options.search?.trim();
    if (search) {
      where.talent = {
        fullName: { contains: search, mode: 'insensitive' },
      };
    }

    if (options.status) {
      where.status = options.status;
    }

    if (options.hiringStatus) {
      where.hiringStatus = options.hiringStatus;
    }

    // Setiap baris membawa seluruh jawaban kandidat beserta definisi soalnya.
    // Tanpa paginasi, satu challenge dengan ratusan pelamar menarik semuanya
    // sekaligus dalam satu permintaan.
    const page = Math.max(1, Number(options.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(options.limit) || 25));

    const orderBy: Prisma.SubmissionOrderByWithRelationInput =
      options.sort === 'score'
        ? { finalScore: { sort: 'desc', nulls: 'last' } }
        : options.sort === 'oldest'
          ? { createdAt: 'asc' }
          : { createdAt: 'desc' };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.submission.findMany({
        where,
        include: {
          talent: {
            select: {
              slug: true,
              fullName: true,
              headline: true,
              avatarUrl: true,
              skills: true,
              githubUrl: true,
            },
          },
          challenge: {
            select: {
              id: true,
              title: true,
              difficulty: true,
              category: CHALLENGE_CATEGORY_SELECT,
            },
          },
          // Tahap yang dikumpulkan. Tanpa ini daftar kandidat menampilkan
          // beberapa baris identik untuk satu orang pada studi kasus bertahap,
          // tanpa petunjuk apa pun tentang tahap mana yang mana. Null berarti
          // pengumpulan menyeluruh — bentuk lama.
          section: {
            select: { id: true, title: true, order: true },
          },
          componentResponses: {
            include: { component: true },
          },
        },
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.submission.count({ where }),
    ]);

    // Judul studi kasus dulu diambil dari `data[0].challenge`, sehingga
    // halaman kandidat kehilangan judulnya persis ketika paling dibutuhkan:
    // saat belum ada satu pun kandidat, atau saat penyaring tidak memberi
    // hasil.
    const challenge = challengeId
      ? await this.prisma.challenge.findFirst({
          where: { id: challengeId, companyId },
          select: {
            id: true,
            title: true,
            difficulty: true,
            category: CHALLENGE_CATEGORY_SELECT,
          },
        })
      : null;

    return {
      data: data.map((row) => ({
        ...row,
        challenge: flattenCategory(row.challenge),
      })),
      total,
      page,
      limit,
      challenge: challenge ? flattenCategory(challenge) : null,
    };
  }

  /**
   * Satu submisi untuk halaman penilaian.
   *
   * Halaman itu dulu mengambil seluruh daftar submisi perusahaan lalu mencari
   * satu id di dalamnya. Begitu daftarnya berpaginasi, submisi di halaman
   * kedua dan seterusnya menjadi tidak terjangkau.
   */
  async getSubmissionForCompany(companyId: string, submissionId: string) {
    const submission = await this.prisma.submission.findFirst({
      where: { id: submissionId, challenge: { companyId } },
      include: {
        talent: {
          select: {
            slug: true,
            fullName: true,
            headline: true,
            avatarUrl: true,
            skills: true,
            githubUrl: true,
            linkedinUrl: true,
            user: { select: { email: true } },
          },
        },
        challenge: {
          select: { id: true, title: true, difficulty: true, category: true },
        },
        componentResponses: {
          include: { component: true },
        },
      },
    });

    if (!submission) {
      throw new NotFoundException('Submisi tidak ditemukan');
    }

    // Email kandidat dibuka hanya setelah rekruter benar-benar melanjutkan
    // prosesnya. Sebelumnya rekruter sama sekali tidak punya cara menghubungi
    // orang yang baru saja ditandai HIRED; membukanya untuk semua pelamar
    // justru menjadikan setiap challenge alat panen alamat email. Sampai
    // kandidat masuk daftar pendek, yang tersedia adalah profil publiknya.
    const contactUnlockedStates: HiringStatus[] = [
      HiringStatus.SHORTLISTED,
      HiringStatus.INTERVIEW_INVITED,
      HiringStatus.HIRED,
    ];
    const isContactUnlocked = contactUnlockedStates.includes(
      submission.hiringStatus,
    );

    const { user, ...talentRest } = submission.talent;

    return {
      ...submission,
      challenge: flattenCategory(submission.challenge),
      talent: {
        ...talentRest,
        email: isContactUnlocked ? user?.email : null,
      },
      isContactUnlocked,
    };
  }

  async getTalentEnrollments(talentId: string) {
    const enrollments = await this.prisma.challengeEnrollment.findMany({
      where: { talentId },
      include: {
        challenge: {
          include: {
            category: CHALLENGE_CATEGORY_SELECT,
            company: { select: { companyName: true, logoUrl: true } },
            components: { orderBy: { order: 'asc' } },
            sections: {
              orderBy: { order: 'asc' },
              include: {
                components: { orderBy: { order: 'asc' } },
              },
            },
          },
        },
        submissions: {
          include: {
            componentResponses: {
              include: { component: true },
            },
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    return enrollments.map((enrollment) => ({
      ...enrollment,
      challenge: flattenCategory(enrollment.challenge),
    }));
  }

  async gradeSubmission(
    profileId: string,
    submissionId: string,
    dto: GradeSubmissionDto,
    userId?: string,
    role?: string,
  ) {
    const submission = await this.prisma.submission.findUnique({
      where: { id: submissionId },
      include: {
        challenge: { include: { company: true } },
        enrollment: true,
        talent: true,
      },
    });

    if (!submission) {
      throw new ForbiddenException('Submisi tidak ditemukan');
    }

    // Admin diizinkan oleh @Roles tapi tokennya tidak membawa profileId,
    // sehingga pemeriksaan kepemilikan di bawah selalu menolaknya. Aksesnya
    // sekarang dinyatakan terang-terangan.
    const isAdmin = role === Role.ADMIN;
    const isCompanyOwner =
      !!profileId && submission.challenge.companyId === profileId;
    const isTalentOwner =
      !!profileId && submission.challenge.talentId === profileId;

    if (!isAdmin && !isCompanyOwner && !isTalentOwner) {
      throw new ForbiddenException(
        'Akses ditolak: Hanya pembuat Challenge yang dapat menilai submisi',
      );
    }

    // Penilaian memberi XP dan token. Tanpa penjagaan ini setiap pemanggilan
    // ulang — termasuk klik ganda pada formulir — menambah hadiah lagi, tanpa
    // batas.
    if (submission.evaluatedAt) {
      throw new ForbiddenException(
        'Submisi ini sudah dinilai dan tidak dapat dinilai ulang. Hubungi admin bila ada koreksi.',
      );
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

      // Pada pengerjaan bertahap, menilai tahap pertama tidak berarti seluruh
      // pendaftaran sudah dievaluasi. Pendaftaran baru dinyatakan EVALUATED
      // setelah semua tahapnya masuk — yang ditandai `submitSolution` dengan
      // menyetel status SUBMITTED.
      const isStageGrading = !!submission.sectionId;

      /**
       * Apakah penilaian ini menutup seluruh studi kasus, bukan satu tahap.
       *
       * Hadiah, portofolio, dan status EVALUATED semuanya melekat pada studi
       * kasus yang selesai. Tanpa pembedaan ini, kandidat yang melewati lima
       * tahap menerima XP dan token lima kali untuk satu studi kasus — dan
       * mendapat lima entri portofolio, yang keempat di antaranya berbunyi
       * "berhasil menyelesaikan" padahal pengerjaannya belum tuntas.
       */
      const isWholeChallengeGrading =
        !isStageGrading ||
        submission.enrollment.status === EnrollmentStatus.SUBMITTED;

      if (isWholeChallengeGrading) {
        await tx.challengeEnrollment.update({
          where: { id: submission.enrollmentId },
          data: { status: EnrollmentStatus.EVALUATED },
        });
      }

      if (dto.status === SubmissionStatus.PASSED && isWholeChallengeGrading) {
        // `|| 60` memperlakukan nilai 0 sebagai 60 dan diam-diam memberi
        // hadiah untuk pekerjaan yang tidak bernilai.
        const finalScore = dto.finalScore ?? 60;
        const rewards = this.calculateRewards(
          submission.challenge.difficulty,
          finalScore,
        );

        await tx.talentProfile.update({
          where: { id: submission.talentId },
          data: { xp: { increment: rewards.xp } },
        });

        // Token dulu diberikan setelah transaksi selesai dan kegagalannya
        // hanya dicatat ke konsol: talenta lulus, XP masuk, token hilang, dan
        // tidak ada yang tahu. Kini sehidup-semati dengan penilaiannya.
        await this.tokensService.earnTokensWithin(
          tx,
          submission.talent.userId,
          rewards.tokens,
          `Reward: Menyelesaikan ${submission.challenge.title}`,
        );

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

      await tx.notification.create({
        data: {
          userId: submission.talent.userId,
          title: 'Hasil Evaluasi Studi Kasus',
          content: `Solusi Anda untuk studi kasus "${submission.challenge.title}" telah dinilai oleh perusahaan. Status: ${dto.status}. Nilai Akhir: ${dto.finalScore || 0}/100.`,
          linkUrl: `/workspace/${submission.enrollmentId}`,
        },
      });

      return updatedSubmission;
    });

    // Nilai tahap dituliskan setelah transaksi penilaian berhasil, dan itulah
    // yang membuka tahap berikutnya. Dijalankan di luar transaksi karena
    // langkahnya termasuk mengirim notifikasi — pekerjaan yang tidak boleh
    // menahan kunci baris.
    if (submission.stageAttemptId) {
      await this.stageGateService
        .settleStageScore(submission.stageAttemptId, dto.finalScore ?? 0)
        .catch((err) =>
          this.logger.warn(
            `Nilai tahap gagal dituliskan untuk submisi ${submissionId}: ${err?.message}`,
          ),
        );
    }

    if (role === Role.COMPANY && userId && submission.challenge.companyId) {
      await this.companiesService.logAction(
        submission.challenge.companyId,
        userId,
        'GRADE_SUBMISSION',
        'SUBMISSION',
        submissionId,
        { finalScore: dto.finalScore, talentId: submission.talentId },
      );
    }

    return result;
  }

  /**
   * Memindahkan kandidat antar-tahap rekrutmen.
   *
   * Terpisah dari `gradeSubmission` karena sifatnya berbeda: penilaian sekali
   * jalan dan berhadiah, tahap rekrutmen berpindah berkali-kali dan tidak
   * memberi apa pun. Sebelum ini `hiringStatus` hanya bisa diisi di dalam
   * formulir penilaian, sehingga corong SHORTLISTED -> INTERVIEW_INVITED ->
   * HIRED tidak pernah bisa dijalankan.
   */
  async updateHiringStatus(
    profileId: string,
    submissionId: string,
    dto: UpdateHiringStatusDto,
    userId?: string,
    role?: string,
  ) {
    const submission = await this.prisma.submission.findUnique({
      where: { id: submissionId },
      include: {
        challenge: { include: { company: true } },
        talent: true,
      },
    });

    if (!submission) {
      throw new NotFoundException('Submisi tidak ditemukan');
    }

    const isAdmin = role === Role.ADMIN;
    const isCompanyOwner =
      !!profileId && submission.challenge.companyId === profileId;
    const isTalentOwner =
      !!profileId && submission.challenge.talentId === profileId;

    if (!isAdmin && !isCompanyOwner && !isTalentOwner) {
      throw new ForbiddenException(
        'Akses ditolak: Hanya pembuat Challenge yang dapat mengubah tahap rekrutmen',
      );
    }

    if (submission.hiringStatus === dto.hiringStatus) {
      return submission;
    }

    const updated = await this.prisma.submission.update({
      where: { id: submissionId },
      data: { hiringStatus: dto.hiringStatus },
    });

    // Hanya tahap yang menuntut tindakan kandidat yang dikabarkan. SHORTLISTED
    // dan NONE adalah pembukuan internal rekruter — mengirimkannya akan
    // memberi harapan atas keputusan yang belum diambil.
    const talentFacingMessage: Partial<Record<HiringStatus, string>> = {
      [HiringStatus.INTERVIEW_INVITED]: `Perusahaan mengundang Anda ke tahap wawancara untuk studi kasus "${submission.challenge.title}".`,
      [HiringStatus.HIRED]: `Selamat! Anda diterima untuk posisi terkait studi kasus "${submission.challenge.title}".`,
      [HiringStatus.REJECTED]: `Proses rekrutmen Anda untuk studi kasus "${submission.challenge.title}" dinyatakan selesai. Terima kasih sudah berpartisipasi.`,
    };

    const message = talentFacingMessage[dto.hiringStatus];
    if (message) {
      await this.prisma.notification.create({
        data: {
          userId: submission.talent.userId,
          title: 'Kabar Proses Rekrutmen',
          content: message,
          linkUrl: `/workspace/${submission.enrollmentId}`,
        },
      });
    }

    if (role === Role.COMPANY && userId && submission.challenge.companyId) {
      await this.companiesService.logAction(
        submission.challenge.companyId,
        userId,
        'UPDATE_HIRING_STATUS',
        'SUBMISSION',
        submissionId,
        {
          from: submission.hiringStatus,
          to: dto.hiringStatus,
          talentId: submission.talentId,
          note: dto.note,
        },
      );
    }

    return updated;
  }

  /**
   * Menghitung potensi Token dan XP berdasarkan tingkat kesulitan dan nilai.
   * @param difficulty BEGINNER | INTERMEDIATE | ADVANCED
   * @param finalScore 0 - 100
   */
  public calculateRewards(
    difficulty: ChallengeDifficulty,
    finalScore: number,
  ): { xp: number; tokens: number } {
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
