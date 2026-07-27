import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export const EMBEDDING_DIMENSIONS = 128;

export type DedupeDecision = 'PASS' | 'REVIEW' | 'REJECT';

export interface DedupeEvaluation {
  decision: DedupeDecision;
  /** Jarak cosine ke profil terverifikasi terdekat (0 = identik). */
  distance: number | null;
  /** id TalentProfile yang paling mirip, bila ada. */
  matchTalentId: string | null;
  /** True bila keputusan ditahan karena sistem berjalan dalam mode bayangan. */
  shadowed: boolean;
}

/**
 * Pemeriksaan "1 wajah 1 akun" berbasis embedding.
 *
 * Seluruh akses ke kolom `biometricFeatureVector` dikumpulkan di sini karena
 * kolom itu bertipe `vector` milik pgvector, yang tidak dikenali Prisma Client.
 * Memusatkannya juga memastikan template biometrik tidak pernah tidak sengaja
 * ikut terbawa ke respons API.
 *
 * Keputusan sengaja memakai tiga zona, bukan lolos/tolak. Salah menuduh jauh
 * lebih mahal daripada kecolongan: menolak pencari kerja yang sah berarti
 * mengunci orang itu dari platform, sedangkan akun ganda yang lolos masih bisa
 * ditangkap sinyal lain. Zona tengah karena itu diteruskan ke peninjauan
 * manusia, bukan diblokir mesin.
 */
@Injectable()
export class IdentityDedupeService {
  private readonly logger = new Logger(IdentityDedupeService.name);

  /** Di bawah ini dianggap orang yang sama dengan keyakinan tinggi. */
  private readonly rejectDistance: number;
  /** Antara rejectDistance dan ini: mencurigakan, diteruskan ke admin. */
  private readonly reviewDistance: number;
  /**
   * Mode bayangan mencatat jarak tanpa pernah menolak. Dipakai selama masa
   * kalibrasi supaya ambang ditentukan oleh sebaran data asli, bukan tebakan.
   */
  private readonly enforcing: boolean;

  constructor(
    private readonly prisma: PrismaService,
    configService: ConfigService,
  ) {
    this.rejectDistance = Number(
      configService.get<string>('IDENTITY_DEDUPE_REJECT_DISTANCE') ?? 0.2,
    );
    this.reviewDistance = Number(
      configService.get<string>('IDENTITY_DEDUPE_REVIEW_DISTANCE') ?? 0.35,
    );
    this.enforcing =
      configService.get<string>('IDENTITY_DEDUPE_MODE') === 'enforce';

    this.logger.log(
      `Deteksi duplikat identitas aktif dalam mode ${this.enforcing ? 'ENFORCE' : 'SHADOW'} ` +
        `(tolak < ${this.rejectDistance}, tinjau < ${this.reviewDistance}).`,
    );
  }

  /**
   * Mengubah embedding menjadi literal vector pgvector.
   *
   * Nilai divalidasi satu per satu sebelum dirangkai: literal ini masuk ke
   * kueri sebagai teks, jadi angka yang tidak wajar tidak boleh lolos.
   */
  private toVectorLiteral(embedding: number[]): string {
    if (
      !Array.isArray(embedding) ||
      embedding.length !== EMBEDDING_DIMENSIONS
    ) {
      throw new Error(
        `Embedding harus berupa array ${EMBEDDING_DIMENSIONS} angka, diterima ${embedding?.length ?? 'bukan array'}.`,
      );
    }

    const parts = embedding.map((value) => {
      const num = Number(value);
      if (!Number.isFinite(num)) {
        throw new Error('Embedding memuat nilai yang bukan angka berhingga.');
      }
      return num.toFixed(8);
    });

    return `[${parts.join(',')}]`;
  }

  /** Menyimpan embedding ke profil talenta. */
  async saveVector(talentId: string, embedding: number[]): Promise<void> {
    const literal = this.toVectorLiteral(embedding);
    await this.prisma.$executeRaw`
      UPDATE "talent_profiles"
      SET "biometricFeatureVector" = ${literal}::vector
      WHERE "id" = ${talentId}
    `;
  }

  /** Menghapus embedding, dipakai saat verifikasi dibatalkan atau ditolak. */
  async clearVector(talentId: string): Promise<void> {
    await this.prisma.$executeRaw`
      UPDATE "talent_profiles"
      SET "biometricFeatureVector" = NULL
      WHERE "id" = ${talentId}
    `;
  }

  async hasVector(talentId: string): Promise<boolean> {
    const rows = await this.prisma.$queryRaw<{ present: boolean }[]>`
      SELECT ("biometricFeatureVector" IS NOT NULL) AS present
      FROM "talent_profiles"
      WHERE "id" = ${talentId}
    `;
    return rows[0]?.present ?? false;
  }

  /**
   * Mencari profil terverifikasi paling mirip selain dirinya sendiri.
   * Operator `<=>` pgvector menghitung jarak cosine dan memanfaatkan indeks HNSW.
   */
  async findNearest(
    talentId: string,
    embedding: number[],
  ): Promise<{ talentId: string; distance: number } | null> {
    const literal = this.toVectorLiteral(embedding);

    const rows = await this.prisma.$queryRaw<
      { id: string; distance: number }[]
    >`
      SELECT "id", ("biometricFeatureVector" <=> ${literal}::vector) AS distance
      FROM "talent_profiles"
      WHERE "biometricFeatureVector" IS NOT NULL
        AND "id" <> ${talentId}
        AND "faceVerificationStatus" = 'VERIFIED'
      ORDER BY "biometricFeatureVector" <=> ${literal}::vector
      LIMIT 1
    `;

    const nearest = rows[0];
    if (!nearest) return null;

    return { talentId: nearest.id, distance: Number(nearest.distance) };
  }

  /**
   * Menilai apakah embedding ini milik orang yang sudah terdaftar.
   * Tidak menulis apa pun; pemanggil yang memutuskan tindak lanjutnya.
   */
  async evaluate(
    talentId: string,
    embedding: number[],
  ): Promise<DedupeEvaluation> {
    const nearest = await this.findNearest(talentId, embedding);

    if (!nearest) {
      return {
        decision: 'PASS',
        distance: null,
        matchTalentId: null,
        shadowed: false,
      };
    }

    let decision: DedupeDecision = 'PASS';
    if (nearest.distance < this.rejectDistance) {
      decision = 'REJECT';
    } else if (nearest.distance < this.reviewDistance) {
      decision = 'REVIEW';
    }

    // Dalam mode bayangan, penolakan diturunkan menjadi peninjauan sehingga
    // tidak ada pengguna yang terblokir oleh ambang yang belum terkalibrasi.
    const shadowed = decision === 'REJECT' && !this.enforcing;
    if (shadowed) {
      decision = 'REVIEW';
    }

    this.logger.log(
      `Pemeriksaan duplikat ${talentId}: jarak ${nearest.distance.toFixed(4)} ` +
        `ke ${nearest.talentId} -> ${decision}${shadowed ? ' (ditahan mode bayangan)' : ''}`,
    );

    return {
      decision,
      distance: nearest.distance,
      matchTalentId: nearest.talentId,
      shadowed,
    };
  }

  /** Mencatat hasil pemeriksaan ke profil agar bisa ditinjau admin. */
  async recordOutcome(
    talentId: string,
    evaluation: DedupeEvaluation,
    tx: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<void> {
    await tx.talentProfile.update({
      where: { id: talentId },
      data: {
        needsIdentityReview: evaluation.decision === 'REVIEW',
        duplicateCheckDistance: evaluation.distance,
        duplicateCheckMatchId: evaluation.matchTalentId,
        identityReviewedAt: null,
        identityReviewedBy: null,
      },
    });
  }
}
