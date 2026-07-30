import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  ComponentType,
  GateScoreBasis,
  Prisma,
  StageAttemptStatus,
  StageGateMode,
  StagePendingPolicy,
} from '@prisma/client';

/** Keadaan satu tahap sebagaimana dilihat kandidat. */
export type StageView = {
  sectionId: string;
  title: string;
  order: number;
  stageType: string;
  status: StageAttemptStatus;
  unlocked: boolean;
  /** Alasan terkunci, sudah berbentuk kalimat siap tampil. */
  lockReason: string | null;
  timeLimit: number | null;
  opensAt: Date | null;
  closesAt: Date | null;
  startedAt: Date | null;
  expiresAt: Date | null;
  submittedAt: Date | null;
  /** Sisa waktu menurut jam server. null bila tahap tak berbatas waktu. */
  remainingSeconds: number | null;
  score: number | null;
};

/** Bentuk section yang dibutuhkan mesin gerbang. */
type GateSection = Prisma.ChallengeSectionGetPayload<{
  include: { components: { select: { type: true; points: true } } };
}>;

type GateAttempt = Prisma.StageAttemptGetPayload<object>;

/**
 * Satu-satunya tempat yang memutuskan sebuah tahap terbuka atau tidak.
 *
 * Keputusannya sengaja tidak dibagi dengan peramban. Batas waktu yang dihitung
 * di klien bisa dihentikan dengan menutup tab, dan syarat nilai yang diperiksa
 * di klien bisa dilewati dengan memanggil endpoint langsung — jadi klien hanya
 * menampilkan apa yang dikatakan `evaluate`.
 */
@Injectable()
export class StageGateService {
  private readonly logger = new Logger(StageGateService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {}

  /**
   * Toleransi jam antara peramban dan server saat memeriksa kedaluwarsa.
   *
   * Tanpa ini kandidat yang menekan "Kumpulkan" tepat di detik terakhir kalah
   * oleh selisih jam dan perjalanan jaringan — pekerjaannya ditolak karena
   * alasan yang bukan kesalahannya.
   */
  private static readonly CLOCK_SKEW_MS = 30_000;

  private static readonly TERMINAL_STATUSES: StageAttemptStatus[] = [
    StageAttemptStatus.SUBMITTED,
    StageAttemptStatus.AWAITING_GRADE,
    StageAttemptStatus.PASSED,
    StageAttemptStatus.FAILED,
    StageAttemptStatus.EXPIRED,
  ];

  /**
   * Membaca keadaan seluruh tahap satu pendaftaran, sekaligus menyelaraskan
   * baris `StageAttempt`-nya.
   *
   * Pembacaan dan penulisan disatukan dengan sengaja: gerbang bergantung pada
   * waktu dan pada nilai yang baru masuk, jadi keadaan yang benar hanya bisa
   * diketahui dengan mengevaluasinya sekarang. Memisahkannya berarti ada jendela
   * ketika kandidat melihat tahap terkunci padahal syaratnya sudah terpenuhi.
   */
  async getStages(
    talentId: string,
    enrollmentId: string,
  ): Promise<StageView[]> {
    const enrollment = await this.prisma.challengeEnrollment.findUnique({
      where: { id: enrollmentId },
      include: {
        challenge: {
          include: {
            sections: {
              orderBy: { order: 'asc' },
              include: { components: { select: { type: true, points: true } } },
            },
          },
        },
      },
    });

    if (!enrollment) throw new NotFoundException('Pendaftaran tidak ditemukan');
    if (enrollment.talentId !== talentId) {
      throw new ForbiddenException('Akses ditolak: Pendaftaran tidak valid');
    }

    const sections = enrollment.challenge.sections;
    if (sections.length === 0) return [];

    const attempts = await this.ensureAttempts(enrollmentId, sections);
    return this.evaluate(sections, attempts, new Date());
  }

  /**
   * Membuat baris attempt yang belum ada.
   *
   * `createMany` dengan `skipDuplicates` dipakai supaya dua permintaan bersamaan
   * dari tab berbeda tidak saling menabrak pada indeks unik.
   */
  private async ensureAttempts(
    enrollmentId: string,
    sections: GateSection[],
  ): Promise<GateAttempt[]> {
    const existing = await this.prisma.stageAttempt.findMany({
      where: { enrollmentId },
    });

    const missing = sections.filter(
      (s) => !existing.some((a) => a.sectionId === s.id),
    );

    if (missing.length === 0) return existing;

    await this.prisma.stageAttempt.createMany({
      data: missing.map((s) => ({ enrollmentId, sectionId: s.id })),
      skipDuplicates: true,
    });

    return this.prisma.stageAttempt.findMany({ where: { enrollmentId } });
  }

  /**
   * Menghitung keadaan setiap tahap dan menuliskan perubahannya.
   *
   * Dijalankan berurutan dari tahap pertama karena gerbang tahap berikutnya
   * membaca hasil tahap sebelumnya — termasuk perubahan yang baru saja
   * diputuskan di iterasi ini, misalnya tahap yang kedaluwarsa detik ini.
   */
  private async evaluate(
    sections: GateSection[],
    attempts: GateAttempt[],
    now: Date,
  ): Promise<StageView[]> {
    const attemptBySection = new Map(attempts.map((a) => [a.sectionId, a]));
    const views: StageView[] = [];

    for (const [idx, section] of sections.entries()) {
      let attempt = attemptBySection.get(section.id);
      if (!attempt) continue;

      // Waktu habis dinyatakan di sini, bukan hanya oleh cron: kandidat yang
      // membuka halaman satu detik setelah batasnya tidak boleh menemukan
      // tahapnya masih bisa dikerjakan hanya karena cron belum berjalan.
      if (
        attempt.status === StageAttemptStatus.IN_PROGRESS &&
        attempt.expiresAt &&
        attempt.expiresAt.getTime() <= now.getTime()
      ) {
        attempt = await this.prisma.stageAttempt.update({
          where: { id: attempt.id },
          data: {
            status: StageAttemptStatus.EXPIRED,
            lockReason: 'Waktu pengerjaan tahap ini sudah habis.',
          },
        });
        attemptBySection.set(section.id, attempt);
      }

      const decision = this.decide(
        section,
        idx,
        sections,
        attemptBySection,
        now,
      );

      // Yang sudah selesai tidak dinilai ulang oleh gerbang. Gerbang hanya
      // mengatur pintu masuk; sesudah kandidat masuk, statusnya milik alur
      // pengerjaan dan penilaian.
      const isTerminal = StageGateService.TERMINAL_STATUSES.includes(
        attempt.status,
      );

      // Status tetap LOCKED sampai kandidat menekan "Mulai" — terbuka bukan
      // berarti sedang dikerjakan, dan jam baru boleh berjalan atas kehendak
      // kandidat. Yang disimpan di sini hanya hasil keputusannya.
      const shouldPersist =
        !isTerminal &&
        attempt.status !== StageAttemptStatus.IN_PROGRESS &&
        (attempt.lockReason !== (decision.unlocked ? null : decision.reason) ||
          (decision.unlocked && !attempt.unlockedAt));

      if (shouldPersist) {
        attempt = await this.prisma.stageAttempt.update({
          where: { id: attempt.id },
          data: {
            lockReason: decision.unlocked ? null : decision.reason,
            unlockedAt: decision.unlocked ? (attempt.unlockedAt ?? now) : null,
          },
        });
        attemptBySection.set(section.id, attempt);
      }

      views.push(this.toView(section, attempt, decision, now));
    }

    return views;
  }

  private toView(
    section: GateSection,
    attempt: GateAttempt,
    decision: { unlocked: boolean; reason: string | null },
    now: Date,
  ): StageView {
    const remainingSeconds =
      attempt.status === StageAttemptStatus.IN_PROGRESS && attempt.expiresAt
        ? Math.max(
            0,
            Math.floor((attempt.expiresAt.getTime() - now.getTime()) / 1000),
          )
        : null;

    return {
      sectionId: section.id,
      title: section.title,
      order: section.order,
      stageType: section.stageType,
      status: attempt.status,
      // Tahap yang sedang dikerjakan jelas sudah terbuka; keputusan gerbang
      // hanya berlaku sebelum kandidat masuk.
      unlocked:
        attempt.status === StageAttemptStatus.IN_PROGRESS || decision.unlocked,
      lockReason: decision.unlocked ? null : decision.reason,
      timeLimit: section.timeLimit,
      opensAt: section.opensAt,
      closesAt: section.closesAt,
      startedAt: attempt.startedAt,
      expiresAt: attempt.expiresAt,
      submittedAt: attempt.submittedAt,
      remainingSeconds,
      score: attempt.score,
    };
  }

  /**
   * Aturan gerbang satu tahap. Murni: tidak menulis apa pun.
   *
   * Urutan pemeriksaan mengikuti urutan sebab: jadwal lebih dulu, karena tahap
   * yang belum waktunya buka tidak perlu dinilai syarat nilainya; baru kemudian
   * syarat masuk.
   */
  private decide(
    section: GateSection,
    idx: number,
    sections: GateSection[],
    attemptBySection: Map<string, GateAttempt>,
    now: Date,
  ): { unlocked: boolean; reason: string | null } {
    if (section.opensAt && now < section.opensAt) {
      return {
        unlocked: false,
        reason: `Tahap ini baru dibuka pada ${this.formatDate(section.opensAt)}.`,
      };
    }
    if (section.closesAt && now > section.closesAt) {
      return {
        unlocked: false,
        reason: `Tahap ini sudah ditutup pada ${this.formatDate(section.closesAt)}.`,
      };
    }

    const attempt = attemptBySection.get(section.id);

    // Sekali terbuka, tetap terbuka.
    //
    // Gerbang dinilai ulang setiap pembacaan, dan nilai bisa turun sesudahnya:
    // AI memberi 85 dan tahap terbuka, lalu perusahaan menilai ulang menjadi 40.
    // Tanpa penjagaan ini kandidat yang sudah dipersilakan masuk dikeluarkan
    // kembali — janji yang sudah diberikan ditarik. `unlockedAt` adalah jejak
    // janji itu; yang bisa mengakhirinya hanya waktu tutup di atas.
    if (attempt?.unlockedAt) return { unlocked: true, reason: null };

    switch (section.gateMode) {
      case StageGateMode.OPEN:
        return { unlocked: true, reason: null };

      case StageGateMode.MANUAL_APPROVAL:
        return attempt?.approvedAt
          ? { unlocked: true, reason: null }
          : {
              unlocked: false,
              reason:
                'Menunggu perusahaan meloloskan Anda ke tahap ini secara manual.',
            };

      case StageGateMode.MIN_SCORE:
        return this.decideByScore(
          section,
          idx,
          sections,
          attemptBySection,
          now,
        );

      case StageGateMode.TOP_N:
        return this.decideByQuota(
          section,
          idx,
          sections,
          attemptBySection,
          now,
        );

      default:
        return { unlocked: true, reason: null };
    }
  }

  private decideByScore(
    section: GateSection,
    idx: number,
    sections: GateSection[],
    attemptBySection: Map<string, GateAttempt>,
    now: Date,
  ): { unlocked: boolean; reason: string | null } {
    const sources = this.resolveSourceSections(section, idx, sections);
    if (sources.length === 0) {
      // Tidak ada tahap sumber sama sekali. Membiarkannya terkunci akan
      // menjebak kandidat pada gerbang yang tidak mungkin dipenuhi, jadi
      // gerbang tanpa sumber diperlakukan terbuka.
      return { unlocked: true, reason: null };
    }

    const score = this.aggregateScore(sources, attemptBySection);

    if (score === null) {
      return this.decidePending(section, sources, attemptBySection, now);
    }

    const threshold = section.minScore ?? 0;
    if (score >= threshold) return { unlocked: true, reason: null };

    return {
      unlocked: false,
      reason: `Butuh nilai minimal ${this.formatScore(threshold)} pada ${this.sourceLabel(sources)}; nilai Anda ${this.formatScore(score)}.`,
    };
  }

  private decideByQuota(
    section: GateSection,
    idx: number,
    sections: GateSection[],
    attemptBySection: Map<string, GateAttempt>,
    now: Date,
  ): { unlocked: boolean; reason: string | null } {
    // Kuota tidak bisa diputuskan sebelum tahap sumbernya ditutup: peringkat
    // baru bermakna setelah semua kandidat selesai. Validasi penerbitan
    // mewajibkan `closesAt` untuk mode ini, jadi ketiadaannya di sini hanya
    // mungkin pada data lama.
    if (!section.closesAt) {
      return { unlocked: true, reason: null };
    }
    if (now <= section.closesAt) {
      return {
        unlocked: false,
        reason: `Kuota diumumkan setelah tahap ditutup pada ${this.formatDate(section.closesAt)}.`,
      };
    }

    const sources = this.resolveSourceSections(section, idx, sections);
    if (sources.length === 0) return { unlocked: true, reason: null };

    const score = this.aggregateScore(sources, attemptBySection);
    if (score === null) {
      return this.decidePending(section, sources, attemptBySection, now);
    }

    // Peringkat dihitung terhadap kandidat lain, jadi tidak bisa disimpulkan
    // dari data pendaftaran ini saja. Penentuannya dilakukan `applyQuota`, yang
    // menandai attempt yang lolos; di sini cukup dibaca hasilnya.
    const attempt = attemptBySection.get(section.id);
    if (attempt?.unlockedAt) return { unlocked: true, reason: null };

    return {
      unlocked: false,
      reason: `Hanya ${section.maxAdvancing} kandidat teratas yang lanjut ke tahap ini.`,
    };
  }

  /**
   * Perlakuan ketika nilai tahap sumber belum ada.
   *
   * Ini bagian yang tidak bisa dihindari: tahap berisi esai atau tugas tidak
   * punya nilai sampai AI atau manusia menilainya. Yang bisa diatur perusahaan
   * hanyalah apa yang terjadi selama jeda itu.
   */
  private decidePending(
    section: GateSection,
    sources: GateSection[],
    attemptBySection: Map<string, GateAttempt>,
    now: Date,
  ): { unlocked: boolean; reason: string | null } {
    const label = this.sourceLabel(sources);

    if (section.pendingPolicy === StagePendingPolicy.MANUAL_ONLY) {
      const attempt = attemptBySection.get(section.id);
      return attempt?.approvedAt
        ? { unlocked: true, reason: null }
        : {
            unlocked: false,
            reason: `Menunggu perusahaan meloloskan Anda ke tahap ini setelah menilai ${label}.`,
          };
    }

    if (section.pendingPolicy === StagePendingPolicy.AUTO_ADVANCE_AFTER) {
      const graceDays = section.graceDays ?? 0;
      // Hitungan mulai dari pengumpulan terakhir di antara tahap sumber:
      // itulah saat bola berpindah ke penilai.
      const submittedAt = sources
        .map((s) => attemptBySection.get(s.id)?.submittedAt)
        .filter((d): d is Date => !!d)
        .sort((a, b) => b.getTime() - a.getTime())[0];

      if (submittedAt) {
        const deadline = new Date(submittedAt);
        deadline.setDate(deadline.getDate() + graceDays);

        if (now >= deadline) {
          return { unlocked: true, reason: null };
        }
        return {
          unlocked: false,
          reason: `Menunggu penilaian ${label}. Tahap ini terbuka otomatis pada ${this.formatDate(deadline)} bila penilaian belum selesai.`,
        };
      }
    }

    return {
      unlocked: false,
      reason: `Menunggu nilai ${label} keluar.`,
    };
  }

  /** Tahap mana yang nilainya dibaca, menurut `scoreBasis`. */
  private resolveSourceSections(
    section: GateSection,
    idx: number,
    sections: GateSection[],
  ): GateSection[] {
    switch (section.scoreBasis) {
      case GateScoreBasis.SPECIFIC_STAGES: {
        const wanted = new Set(section.gateSourceIds);
        return sections.filter((s) => wanted.has(s.id));
      }
      case GateScoreBasis.CUMULATIVE:
        return sections.slice(0, idx);
      case GateScoreBasis.PREVIOUS_STAGE:
      default: {
        const previous = sections[idx - 1];
        return previous ? [previous] : [];
      }
    }
  }

  /**
   * Nilai gabungan tahap sumber, 0-100, dibobot poin tiap tahap.
   *
   * Rata-rata polos akan membuat tahap berisi satu soal sama beratnya dengan
   * tahap berisi dua puluh soal. Mengembalikan null bila ada satu saja tahap
   * sumber yang belum bernilai — separuh nilai bukan nilai.
   */
  private aggregateScore(
    sources: GateSection[],
    attemptBySection: Map<string, GateAttempt>,
  ): number | null {
    let weighted = 0;
    let weightTotal = 0;

    for (const source of sources) {
      const attempt = attemptBySection.get(source.id);
      if (!attempt) return null;

      // Tahap yang kedaluwarsa tanpa jawaban tetap punya nilai: nol. Tanpa
      // perlakuan ini kandidat bisa menghindari gerbang dengan cara sederhana,
      // yaitu tidak mengumpulkan apa pun.
      const score =
        attempt.score ??
        (attempt.status === StageAttemptStatus.EXPIRED ? 0 : null);

      if (score === null) return null;

      const weight = this.stageWeight(source);
      weighted += score * weight;
      weightTotal += weight;
    }

    if (weightTotal === 0) return null;
    return weighted / weightTotal;
  }

  /**
   * Bobot satu tahap: total poin soalnya, dengan minimum 1 supaya tahap tanpa
   * poin tidak menghilang dari rata-rata. Soal psikometrik tidak dihitung —
   * skala Likert tidak punya jawaban benar.
   */
  private stageWeight(section: GateSection): number {
    const total = section.components
      .filter((c) => c.type !== ComponentType.PSYCHOMETRIC)
      .reduce((acc, c) => acc + c.points, 0);
    return total > 0 ? total : 1;
  }

  private sourceLabel(sources: GateSection[]): string {
    if (sources.length === 1) return `tahap "${sources[0].title}"`;
    return `tahap ${sources.map((s) => `"${s.title}"`).join(', ')}`;
  }

  private formatScore(value: number): string {
    return Number.isInteger(value) ? String(value) : value.toFixed(1);
  }

  private formatDate(value: Date): string {
    return new Intl.DateTimeFormat('id-ID', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: 'Asia/Jakarta',
    }).format(value);
  }

  /**
   * Mencap dimulainya pengerjaan satu tahap.
   *
   * Idempoten: pemanggilan kedua tidak menyetel ulang `startedAt`. Kalau tidak,
   * memuat ulang halaman menjadi cara memperpanjang waktu.
   */
  async startStage(talentId: string, enrollmentId: string, sectionId: string) {
    const stages = await this.getStages(talentId, enrollmentId);
    const stage = stages.find((s) => s.sectionId === sectionId);

    if (!stage) throw new NotFoundException('Tahap tidak ditemukan');

    if (stage.status === StageAttemptStatus.IN_PROGRESS) {
      return stage;
    }
    if (StageGateService.TERMINAL_STATUSES.includes(stage.status)) {
      throw new BadRequestException('Tahap ini sudah tidak bisa dikerjakan.');
    }
    if (!stage.unlocked) {
      throw new ForbiddenException(
        stage.lockReason ?? 'Tahap ini belum terbuka untuk Anda.',
      );
    }

    const now = new Date();
    const expiresAt = stage.timeLimit
      ? new Date(now.getTime() + stage.timeLimit * 60_000)
      : null;

    // Batas tahap tidak boleh melewati waktu tutupnya sendiri; kalau tidak,
    // tahap yang dibuka lima menit sebelum tutup tetap memberi waktu penuh.
    const effectiveExpiry =
      expiresAt && stage.closesAt && stage.closesAt < expiresAt
        ? stage.closesAt
        : expiresAt;

    await this.prisma.stageAttempt.update({
      where: { enrollmentId_sectionId: { enrollmentId, sectionId } },
      data: {
        status: StageAttemptStatus.IN_PROGRESS,
        startedAt: now,
        expiresAt: effectiveExpiry,
        unlockedAt: now,
        lockReason: null,
      },
    });

    const refreshed = await this.getStages(talentId, enrollmentId);
    return refreshed.find((s) => s.sectionId === sectionId)!;
  }

  /**
   * Memeriksa bahwa satu tahap masih boleh menerima pengumpulan.
   *
   * Dipanggil dari alur pengumpulan sebelum apa pun ditulis. Perbandingannya
   * selalu terhadap `expiresAt` di basis data — hitungan di peramban hanya
   * tampilan.
   */
  async assertStageSubmittable(enrollmentId: string, sectionId: string) {
    const attempt = await this.prisma.stageAttempt.findUnique({
      where: { enrollmentId_sectionId: { enrollmentId, sectionId } },
    });

    if (!attempt) {
      throw new NotFoundException('Tahap ini belum dimulai.');
    }
    if (attempt.status !== StageAttemptStatus.IN_PROGRESS) {
      throw new BadRequestException(
        attempt.status === StageAttemptStatus.EXPIRED
          ? 'Waktu pengerjaan tahap ini sudah habis.'
          : 'Tahap ini sudah dikumpulkan.',
      );
    }
    if (
      attempt.expiresAt &&
      Date.now() - attempt.expiresAt.getTime() > StageGateService.CLOCK_SKEW_MS
    ) {
      await this.prisma.stageAttempt.update({
        where: { id: attempt.id },
        data: {
          status: StageAttemptStatus.EXPIRED,
          lockReason: 'Waktu pengerjaan tahap ini sudah habis.',
        },
      });
      throw new BadRequestException('Waktu pengerjaan tahap ini sudah habis.');
    }

    return attempt;
  }

  /**
   * Menutup satu tahap setelah jawabannya masuk.
   *
   * `pendingGrade` menandai masih ada bagian yang menunggu AI atau manusia —
   * esai, unggahan, rekaman. Nilai tahapnya belum ditulis dalam hal itu:
   * separuh nilai bukan nilai, dan gerbang yang membacanya akan mengambil
   * keputusan atas angka yang belum lengkap.
   */
  async closeStage(
    tx: Prisma.TransactionClient,
    attemptId: string,
    input: { score: number | null; pendingGrade: boolean },
  ) {
    const now = new Date();

    return tx.stageAttempt.update({
      where: { id: attemptId },
      data: {
        status: input.pendingGrade
          ? StageAttemptStatus.AWAITING_GRADE
          : StageAttemptStatus.SUBMITTED,
        submittedAt: now,
        score: input.pendingGrade ? null : input.score,
        gradedAt: input.pendingGrade ? null : now,
        // Jam dihentikan: tahap yang sudah dikumpulkan tidak boleh ikut
        // disapu cron kedaluwarsa.
        expiresAt: null,
      },
    });
  }

  /**
   * Menuliskan nilai akhir satu tahap dan membuka tahap berikutnya bila
   * syaratnya sudah terpenuhi.
   *
   * Dipanggil setelah nilai keluar — dari perhitungan objektif, dari cron AI,
   * atau dari penilaian manusia.
   */
  async settleStageScore(attemptId: string, score: number) {
    const attempt = await this.prisma.stageAttempt.update({
      where: { id: attemptId },
      data: {
        score,
        gradedAt: new Date(),
        status: StageAttemptStatus.SUBMITTED,
      },
      include: {
        enrollment: { include: { talent: { select: { userId: true } } } },
        section: { select: { title: true } },
      },
    });

    await this.notifyUnlocked(
      attempt.enrollmentId,
      attempt.enrollment.talentId,
    );
    return attempt;
  }

  /**
   * Memberi kabar tahap yang baru terbuka.
   *
   * Tanpa ini gerbang berbasis nilai menjadi ruang tunggu tanpa pintu: kandidat
   * tidak punya cara mengetahui bahwa tahap berikutnya sudah bisa dikerjakan
   * selain membuka halaman itu berulang kali.
   */
  private async notifyUnlocked(enrollmentId: string, talentId: string) {
    const before = await this.prisma.stageAttempt.findMany({
      where: { enrollmentId, unlockedAt: null },
      select: { sectionId: true },
    });
    if (before.length === 0) return;

    const stages = await this.getStages(talentId, enrollmentId).catch(
      () => null,
    );
    if (!stages) return;

    const opened = stages.filter(
      (s) => s.unlocked && before.some((b) => b.sectionId === s.sectionId),
    );
    if (opened.length === 0) return;

    const talent = await this.prisma.talentProfile.findUnique({
      where: { id: talentId },
      select: { userId: true },
    });
    if (!talent) return;

    for (const stage of opened) {
      await this.notificationsService.sendNotification(
        talent.userId,
        'Tahap Berikutnya Terbuka',
        `Tahap "${stage.title}" sudah bisa Anda kerjakan.`,
        `/workspace/${enrollmentId}`,
      );
    }
  }

  /**
   * Kandidat yang sedang menunggu keputusan manual perusahaan.
   *
   * Endpoint tersendiri, bukan bagian dari daftar submisi, karena tahap yang
   * menunggu persetujuan justru belum punya submisi apa pun — kandidat belum
   * boleh masuk, jadi belum ada yang dikumpulkan. Mencarinya dari daftar submisi
   * berarti mencari sesuatu yang secara definisi tidak ada di sana.
   */
  async listPendingApprovals(profileId: string, challengeId: string) {
    const challenge = await this.prisma.challenge.findFirst({
      where: {
        id: challengeId,
        OR: [{ companyId: profileId }, { talentId: profileId }],
      },
      select: { id: true },
    });

    if (!challenge) {
      throw new ForbiddenException(
        'Akses ditolak: Anda bukan pemilik studi kasus ini.',
      );
    }

    const attempts = await this.prisma.stageAttempt.findMany({
      where: {
        approvedAt: null,
        unlockedAt: null,
        section: {
          challengeId,
          // Dua keadaan yang menuntut keputusan manusia: gerbangnya memang
          // manual, atau gerbangnya berbasis nilai tetapi perusahaan memilih
          // memutuskan sendiri ketika nilainya belum keluar.
          OR: [
            { gateMode: StageGateMode.MANUAL_APPROVAL },
            { pendingPolicy: StagePendingPolicy.MANUAL_ONLY },
          ],
        },
      },
      select: {
        id: true,
        lockReason: true,
        enrollmentId: true,
        section: { select: { id: true, title: true, order: true } },
        enrollment: {
          select: {
            talent: {
              select: {
                slug: true,
                fullName: true,
                headline: true,
                avatarUrl: true,
              },
            },
          },
        },
      },
      orderBy: [{ section: { order: 'asc' } }, { createdAt: 'asc' }],
    });

    // Nilai tahap sebelumnya disertakan karena itulah dasar keputusan. Tanpanya
    // perusahaan diminta meloloskan orang tanpa satu pun angka di depannya.
    const previousScores = await this.prisma.stageAttempt.findMany({
      where: {
        enrollmentId: { in: attempts.map((a) => a.enrollmentId) },
        score: { not: null },
      },
      select: {
        enrollmentId: true,
        score: true,
        section: { select: { title: true, order: true } },
      },
      orderBy: { section: { order: 'asc' } },
    });

    return attempts.map((attempt) => ({
      attemptId: attempt.id,
      enrollmentId: attempt.enrollmentId,
      lockReason: attempt.lockReason,
      section: attempt.section,
      talent: attempt.enrollment.talent,
      previousScores: previousScores
        .filter(
          (s) =>
            s.enrollmentId === attempt.enrollmentId &&
            s.section.order < attempt.section.order,
        )
        .map((s) => ({ title: s.section.title, score: s.score })),
    }));
  }

  /**
   * Meloloskan seorang kandidat ke satu tahap secara manual.
   *
   * Hanya pemilik studi kasus. Dipakai mode MANUAL_APPROVAL dan sebagai jalan
   * keluar untuk MANUAL_ONLY.
   */
  async approveStage(
    approverUserId: string,
    profileId: string,
    attemptId: string,
  ) {
    const attempt = await this.prisma.stageAttempt.findUnique({
      where: { id: attemptId },
      include: {
        enrollment: {
          include: {
            challenge: { select: { companyId: true, talentId: true } },
            talent: { select: { id: true, userId: true } },
          },
        },
        section: { select: { title: true } },
      },
    });

    if (!attempt) throw new NotFoundException('Tahap tidak ditemukan');

    const challenge = attempt.enrollment.challenge;
    const isOwner =
      challenge.companyId === profileId || challenge.talentId === profileId;
    if (!isOwner) {
      throw new ForbiddenException(
        'Hanya pemilik studi kasus yang bisa meloloskan kandidat.',
      );
    }

    // Sudah diloloskan sebelumnya: pemanggilan kedua tidak menggeser jejaknya
    // dan tidak mengirim kabar dua kali. Klik ganda pada tombol adalah kejadian
    // biasa, bukan luar biasa.
    if (attempt.approvedAt) {
      return {
        attemptId,
        approvedAt: attempt.approvedAt,
        alreadyApproved: true,
      };
    }

    const now = new Date();

    await this.prisma.stageAttempt.update({
      where: { id: attemptId },
      data: {
        approvedAt: now,
        approvedById: approverUserId,
        lockReason: null,
        unlockedAt: now,
      },
    });

    await this.notificationsService.sendNotification(
      attempt.enrollment.talent.userId,
      'Anda Lolos ke Tahap Berikutnya',
      `Perusahaan meloloskan Anda ke tahap "${attempt.section.title}".`,
      `/workspace/${attempt.enrollmentId}`,
    );

    // Yang dikembalikan hanya jejak keputusannya. Keadaan tahap adalah pandangan
    // kandidat — perusahaan tidak butuh, dan membangunnya di sini berarti satu
    // rangkaian penulisan lagi hanya untuk mengisi jawaban.
    return { attemptId, approvedAt: now, alreadyApproved: false };
  }

  /**
   * Menetapkan siapa saja yang lolos kuota satu tahap.
   *
   * Berbeda dari gerbang lain, ini tidak bisa diputuskan per kandidat: peringkat
   * baru ada setelah tahap sumbernya ditutup dan seluruh kandidat dinilai.
   * Karena itu dijalankan sekali per tahap oleh cron, bukan saat kandidat
   * membuka halaman.
   */
  async applyQuota(sectionId: string) {
    const section = await this.prisma.challengeSection.findUnique({
      where: { id: sectionId },
      include: {
        challenge: {
          include: {
            sections: {
              orderBy: { order: 'asc' },
              include: { components: { select: { type: true, points: true } } },
            },
          },
        },
      },
    });

    if (
      !section ||
      section.gateMode !== StageGateMode.TOP_N ||
      section.maxAdvancing == null
    ) {
      return 0;
    }

    const sections = section.challenge.sections;
    const idx = sections.findIndex((s) => s.id === sectionId);
    // Tahap yang sama diambil dari daftar `sections`, bukan dari hasil query di
    // atas: hanya daftar itu yang membawa komponennya, dan pembobotan nilai
    // membutuhkan poin tiap soal.
    const self = sections[idx];
    if (!self) return 0;

    const sources = this.resolveSourceSections(self, idx, sections);
    if (sources.length === 0) return 0;

    // Semua pendaftaran yang punya attempt di tahap ini, beserta nilai tahap
    // sumbernya.
    const attempts = await this.prisma.stageAttempt.findMany({
      where: { sectionId: { in: [...sources.map((s) => s.id), sectionId] } },
    });

    const byEnrollment = new Map<string, Map<string, GateAttempt>>();
    for (const attempt of attempts) {
      const bucket = byEnrollment.get(attempt.enrollmentId) ?? new Map();
      bucket.set(attempt.sectionId, attempt);
      byEnrollment.set(attempt.enrollmentId, bucket);
    }

    const ranked: { enrollmentId: string; score: number }[] = [];
    for (const [enrollmentId, bucket] of byEnrollment) {
      const score = this.aggregateScore(sources, bucket);
      if (score !== null) ranked.push({ enrollmentId, score });
    }

    ranked.sort((a, b) => b.score - a.score);
    const winnerIds = new Set(
      ranked.slice(0, section.maxAdvancing).map((r) => r.enrollmentId),
    );

    if (ranked.length === 0) return 0;

    // Hanya attempt yang belum diputuskan yang diproses. Itu sekaligus yang
    // membuat cron ini idempoten: putaran berikutnya tidak menemukan apa pun,
    // jadi tidak ada kabar yang dikirim dua kali.
    const undecided = await this.prisma.stageAttempt.findMany({
      where: {
        sectionId,
        unlockedAt: null,
        status: StageAttemptStatus.LOCKED,
        enrollmentId: { in: ranked.map((r) => r.enrollmentId) },
      },
      select: {
        id: true,
        enrollmentId: true,
        enrollment: { select: { talent: { select: { userId: true } } } },
      },
    });

    if (undecided.length === 0) return 0;

    const winners = undecided.filter((a) => winnerIds.has(a.enrollmentId));
    const losers = undecided.filter((a) => !winnerIds.has(a.enrollmentId));

    const now = new Date();

    if (winners.length > 0) {
      await this.prisma.stageAttempt.updateMany({
        where: { id: { in: winners.map((a) => a.id) } },
        data: { unlockedAt: now, lockReason: null },
      });
    }

    // Yang tidak masuk kuota ditandai FAILED, bukan dibiarkan LOCKED.
    //
    // Dua alasan. Pertama, itu memang yang terjadi — kesempatannya sudah lewat,
    // bukan sedang ditunggu. Kedua, LOCKED yang menggantung membuat pendaftaran
    // tidak pernah dinyatakan selesai, sehingga kandidat tertahan di keadaan
    // yang tidak akan pernah berubah.
    if (losers.length > 0) {
      await this.prisma.stageAttempt.updateMany({
        where: { id: { in: losers.map((a) => a.id) } },
        data: {
          status: StageAttemptStatus.FAILED,
          lockReason: `Kuota tahap ini terbatas pada ${section.maxAdvancing} kandidat teratas.`,
        },
      });
    }

    // Kabar dikirim ke kedua belah pihak. Gerbang kuota yang membuka diam-diam
    // menjadi ruang tunggu tanpa pintu: yang lolos tidak tahu boleh masuk, dan
    // yang tidak lolos menunggu sesuatu yang tidak akan datang.
    for (const attempt of winners) {
      await this.notificationsService
        .sendNotification(
          attempt.enrollment.talent.userId,
          'Anda Lolos ke Tahap Berikutnya',
          `Anda masuk ${section.maxAdvancing} kandidat teratas. Tahap "${section.title}" sudah bisa Anda kerjakan.`,
          `/workspace/${attempt.enrollmentId}`,
        )
        .catch((err) =>
          this.logger.warn(
            `Gagal memberi kabar kuota (lolos) ${attempt.id}: ${err?.message}`,
          ),
        );
    }

    for (const attempt of losers) {
      await this.notificationsService
        .sendNotification(
          attempt.enrollment.talent.userId,
          'Tidak Lanjut ke Tahap Berikutnya',
          `Tahap "${section.title}" hanya menerima ${section.maxAdvancing} kandidat teratas, dan nilai Anda belum masuk. Terima kasih sudah berpartisipasi.`,
          `/workspace/${attempt.enrollmentId}`,
        )
        .catch((err) =>
          this.logger.warn(
            `Gagal memberi kabar kuota (tidak lanjut) ${attempt.id}: ${err?.message}`,
          ),
        );
    }

    this.logger.log(
      `Kuota tahap ${sectionId}: ${winners.length} lolos, ${losers.length} tidak lanjut, dari ${ranked.length} yang dinilai.`,
    );

    return winners.length;
  }
}
