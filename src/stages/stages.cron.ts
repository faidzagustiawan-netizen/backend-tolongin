import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { StageGateService } from './stage-gate.service';
import {
  StageAttemptStatus,
  StageGateMode,
  StagePendingPolicy,
} from '@prisma/client';

/**
 * Pekerjaan berkala yang membuat batas waktu tahap benar-benar mengikat.
 *
 * Tanpa ini batas waktu hanya berlaku bagi kandidat yang membuka halaman:
 * menutup tab akan menghentikan hitungan, dan tahap yang lewat waktu tetap
 * menunggu jawaban tanpa batas.
 */
@Injectable()
export class StagesCronService {
  private readonly logger = new Logger(StagesCronService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
    private readonly stageGateService: StageGateService,
  ) {}

  /** Sekali proses tidak menyentuh lebih dari ini, supaya satu putaran tetap pendek. */
  private static readonly BATCH_SIZE = 500;

  /**
   * Menutup tahap yang waktunya sudah habis.
   *
   * Jawaban yang sudah tersimpan tidak dibuang: `ComponentResponse` yang sempat
   * masuk tetap dinilai apa adanya. Yang berakhir hanyalah kesempatan menambah.
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async expireOverdueStages() {
    const now = new Date();

    const overdue = await this.prisma.stageAttempt.findMany({
      where: {
        status: StageAttemptStatus.IN_PROGRESS,
        expiresAt: { lt: now },
      },
      select: {
        id: true,
        enrollmentId: true,
        section: { select: { title: true } },
        enrollment: { select: { talent: { select: { userId: true } } } },
      },
      take: StagesCronService.BATCH_SIZE,
    });

    if (overdue.length === 0) return;

    await this.prisma.stageAttempt.updateMany({
      where: { id: { in: overdue.map((a) => a.id) } },
      data: {
        status: StageAttemptStatus.EXPIRED,
        lockReason: 'Waktu pengerjaan tahap ini sudah habis.',
      },
    });

    for (const attempt of overdue) {
      await this.notificationsService
        .sendNotification(
          attempt.enrollment.talent.userId,
          'Waktu Tahap Habis',
          `Waktu pengerjaan tahap "${attempt.section.title}" sudah habis. Jawaban yang sudah tersimpan tetap dinilai.`,
          `/workspace/${attempt.enrollmentId}`,
        )
        .catch((err) =>
          this.logger.warn(
            `Gagal memberi kabar kedaluwarsa tahap ${attempt.id}: ${err?.message}`,
          ),
        );
    }

    this.logger.log(`${overdue.length} tahap ditutup karena waktu habis.`);
  }

  /**
   * Membuka tahap yang gerbangnya menunggu nilai terlalu lama.
   *
   * Ini harga dari `AUTO_ADVANCE_AFTER`: ambang nilai dilewati supaya kandidat
   * tidak terjebak menunggu tinjauan yang tidak datang. Perusahaan ikut
   * dikabari, karena keputusan itu diambil atas namanya.
   */
  @Cron(CronExpression.EVERY_HOUR)
  async releaseStagesWaitingOnGrading() {
    const candidates = await this.prisma.stageAttempt.findMany({
      where: {
        status: StageAttemptStatus.LOCKED,
        unlockedAt: null,
        section: {
          pendingPolicy: StagePendingPolicy.AUTO_ADVANCE_AFTER,
          gateMode: { in: [StageGateMode.MIN_SCORE, StageGateMode.TOP_N] },
        },
      },
      select: {
        enrollmentId: true,
        enrollment: { select: { talentId: true } },
      },
      take: StagesCronService.BATCH_SIZE,
    });

    // Yang membuka tahap tetap `getStages`, bukan cron ini: seluruh aturan
    // gerbang — termasuk hitungan masa tunggu — hanya ada di satu tempat.
    // Cron di sini hanya memaksa evaluasi ulang supaya tahapnya terbuka tanpa
    // menunggu kandidat kebetulan membuka halaman.
    const seen = new Set<string>();
    let evaluated = 0;

    for (const attempt of candidates) {
      if (seen.has(attempt.enrollmentId)) continue;
      seen.add(attempt.enrollmentId);

      await this.stageGateService
        .getStages(attempt.enrollment.talentId, attempt.enrollmentId)
        .then(() => {
          evaluated += 1;
        })
        .catch((err) =>
          this.logger.warn(
            `Gagal mengevaluasi gerbang pendaftaran ${attempt.enrollmentId}: ${err?.message}`,
          ),
        );
    }

    if (evaluated > 0) {
      this.logger.log(`${evaluated} pendaftaran dievaluasi ulang gerbangnya.`);
    }
  }

  /**
   * Menetapkan siapa yang lolos kuota, untuk tahap yang sudah lewat waktu tutup.
   *
   * Berbeda dari gerbang lain, kuota tidak bisa diputuskan per kandidat —
   * peringkat baru ada setelah semua orang dinilai. Jadi keputusannya diambil
   * sekali per tahap di sini, bukan saat kandidat membuka halaman.
   */
  @Cron(CronExpression.EVERY_30_MINUTES)
  async applyStageQuotas() {
    const sections = await this.prisma.challengeSection.findMany({
      where: {
        gateMode: StageGateMode.TOP_N,
        closesAt: { lt: new Date() },
      },
      select: { id: true },
      take: StagesCronService.BATCH_SIZE,
    });

    let opened = 0;
    for (const section of sections) {
      opened += await this.stageGateService
        .applyQuota(section.id)
        .catch((err) => {
          this.logger.warn(
            `Gagal menerapkan kuota tahap ${section.id}: ${err?.message}`,
          );
          return 0;
        });
    }

    if (opened > 0) {
      this.logger.log(`${opened} kandidat dibuka lewat kuota tahap.`);
    }
  }
}
