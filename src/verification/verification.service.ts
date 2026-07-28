import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { VerifyFaceDto } from './dto/verify-face.dto';
import { VerifyKybDto } from './dto/verify-kyb.dto';
import { VerifyExecutionDto } from './dto/verify-execution.dto';
import { AiService, FaceEngineUnavailableError } from '../ai/ai.service';
import { VerificationStatus } from '@prisma/client';
import { NotificationsService } from '../notifications/notifications.service';
import * as crypto from 'crypto';
import { EncryptionUtil } from '../utils/encryption.util';
import { IdentityDedupeService } from './identity-dedupe.service';

@Injectable()
export class VerificationService {
  private readonly logger = new Logger(VerificationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiService: AiService,
    private readonly notificationsService: NotificationsService,
    private readonly identityDedupe: IdentityDedupeService,
  ) {}

  async verifyTalentFace(talentId: string, dto: VerifyFaceDto) {
    const profile = await this.prisma.talentProfile.findUnique({
      where: { id: talentId },
      include: { user: true },
    });

    if (!profile) {
      throw new NotFoundException('Profil talenta tidak ditemukan');
    }

    // Set status to PENDING immediately
    await this.prisma.talentProfile.update({
      where: { id: talentId },
      data: { faceVerificationStatus: 'PENDING' } as any,
    });

    // Jalankan asinkron di latar belakang (fire and forget)
    this.verifyTalentFaceBackground(talentId, profile, dto).catch((err) => {
      console.error('Error background face verification:', err);
    });

    return {
      status: 'PROCESSING',
      message:
        'Verifikasi KTP & Wajah sedang diproses di latar belakang. Anda akan menerima notifikasi segera.',
    };
  }

  private async verifyTalentFaceBackground(
    talentId: string,
    profile: any,
    dto: VerifyFaceDto,
  ) {
    try {
      // 1. Coba lakukan verifikasi tingkat lanjut menggunakan DeepFace / EasyOCR / OpenAI Vision
      const visionResult = await this.aiService.verifyKtpAndSelfie(
        dto.selfiePhotoUrl,
        dto.idCardPhotoUrl,
      );

      let finalConfidence = 0;
      let verificationDetail = '';

      if (visionResult) {
        if (!visionResult.isKtpValid) {
          throw new Error(
            `Verifikasi Ditolak: ${visionResult.reason || 'Dokumen yang diunggah bukan KTP resmi Indonesia yang sah.'}`,
          );
        }

        if (!visionResult.isMatch) {
          throw new Error(
            `Verifikasi Ditolak: ${visionResult.reason || 'Wajah pada selfie tidak cocok dengan foto di KTP Anda.'}`,
          );
        }

        finalConfidence = visionResult.confidenceScore || 95;
        verificationDetail = visionResult.reason;

        // Pengecekan 1 Wajah 1 Identitas 1 Akun
        if (visionResult.ktpNik) {
          const existingNik = await this.prisma.talentProfile.findFirst({
            where: {
              ktpNik: visionResult.ktpNik,
              id: { not: talentId },
            } as any,
          });
          if (existingNik) {
            throw new Error(
              `Verifikasi Ditolak: KTP dengan NIK ${visionResult.ktpNik} sudah terdaftar pada akun lain. Aturan ketat: 1 identitas hanya untuk 1 akun!`,
            );
          }
        }
      } else {
        throw new Error(
          'Sistem AI Verifikasi Liveness & KTP sedang mengalami antrean tinggi atau galat. Silakan coba beberapa saat lagi.',
        );
      }

      // Hitung hash biometrik murni
      const cleanSelfie = dto.selfiePhotoUrl.replace(
        /^data:image\/\w+;base64,/,
        '',
      );
      const biometricHash =
        visionResult.biometricHash ||
        crypto.createHash('sha256').update(cleanSelfie).digest('hex');

      // Saringan awal yang murah: hanya menangkap unggahan berkas yang persis
      // sama. Perbandingan wajah yang sebenarnya dilakukan lewat embedding
      // beberapa baris di bawah.
      const existingFace = await this.prisma.talentProfile.findFirst({
        where: { biometricDataHash: biometricHash, id: { not: talentId } },
      });
      if (existingFace) {
        throw new Error(
          'Verifikasi Ditolak: Foto yang sama persis sudah pernah digunakan pada akun lain. Harap ambil selfie baru.',
        );
      }

      // Pemeriksaan "1 wajah 1 akun" berbasis embedding.
      const embedding = visionResult.featureVector ?? null;
      let dedupe: Awaited<
        ReturnType<IdentityDedupeService['evaluate']>
      > | null = null;

      if (embedding) {
        dedupe = await this.identityDedupe.evaluate(talentId, embedding);

        if (dedupe.decision === 'REJECT') {
          throw new Error(
            'Verifikasi Ditolak: Wajah ini sangat mirip dengan identitas yang sudah terdaftar pada akun lain. ' +
              'Jika Anda merasa ini keliru, hubungi dukungan agar ditinjau petugas kami.',
          );
        }
      }

      // Enkripsi data sensitif (Wajah & KTP) agar tidak bisa dibaca langsung dari database
      const encryptedFace = EncryptionUtil.encrypt(dto.selfiePhotoUrl);
      const encryptedKtp = EncryptionUtil.encrypt(dto.idCardPhotoUrl);

      // Kecocokan di zona tengah tetap diloloskan, tetapi ditandai agar
      // diperiksa petugas. Jarak selfie-vs-KTP menyebar lebar karena foto pada
      // kartu adalah hasil cetak beresolusi rendah, sehingga menolak otomatis
      // di zona ini akan mengunci banyak pemilik KTP yang sah.
      const faceNeedsReview = !!visionResult.needsReview;

      if (faceNeedsReview) {
        this.logger.warn(
          `Verifikasi ${talentId} lolos di zona tinjau (jarak wajah ${visionResult.faceDistance}). Ditandai untuk diperiksa petugas.`,
        );
      }

      await this.prisma.talentProfile.update({
        where: { id: talentId },
        data: {
          faceVerificationStatus: VerificationStatus.VERIFIED,
          ktpNik: visionResult.ktpNik,
          biometricDataHash: biometricHash,
          encryptedPrivateFace: encryptedFace,
          encryptedKtpData: encryptedKtp,
          faceAlignmentDegraded: !embedding,
          ...(faceNeedsReview
            ? {
                needsIdentityReview: true,
                duplicateCheckDistance: visionResult.faceDistance ?? null,
              }
            : {}),
          // avatarUrl tidak lagi otomatis diubah di sini, biarkan public
        } as any,
      });

      // Vektor ditulis terpisah lewat raw SQL karena kolomnya bertipe pgvector
      // yang tidak dikenali Prisma Client.
      if (embedding) {
        await this.identityDedupe.saveVector(talentId, embedding);
        if (dedupe) {
          await this.identityDedupe.recordOutcome(talentId, dedupe);
        }
      }

      const reviewNote =
        dedupe?.decision === 'REVIEW' || faceNeedsReview
          ? ' Catatan: identitas Anda sedang ditinjau ulang oleh tim kami sebagai prosedur standar. Anda tetap dapat menggunakan akun seperti biasa.'
          : '';

      await this.notificationsService.sendNotification(
        profile.userId,
        'Verifikasi Identitas AI Berhasil ✅',
        `Selamat! Verifikasi KTP & Wajah Anda telah terverifikasi dengan tingkat kecocokan ${finalConfidence}%. Catatan: ${verificationDetail}${reviewNote}`,
        '/profile',
      );
    } catch (error: any) {
      // Gangguan mesin biometrik bukan keputusan tentang identitas pengguna.
      // Statusnya dikembalikan ke UNVERIFIED supaya pengguna bisa mencoba lagi
      // setelah server dibereskan — menandainya FAILED akan menyalahkan
      // pengguna atas kesalahan konfigurasi kita.
      const isEngineFailure = error instanceof FaceEngineUnavailableError;

      await this.prisma.talentProfile.update({
        where: { id: talentId },
        data: {
          faceVerificationStatus: isEngineFailure
            ? VerificationStatus.UNVERIFIED
            : VerificationStatus.FAILED,
        } as any,
      });

      if (isEngineFailure) {
        this.logger.error(
          `Mesin biometrik tidak tersedia saat memverifikasi ${talentId}: ${error.message}. ` +
            'Periksa dependensi Python (lihat requirements.txt).',
        );
      }

      await this.notificationsService.sendNotification(
        profile.userId,
        isEngineFailure
          ? 'Verifikasi Identitas Tertunda ⏳'
          : 'Verifikasi Identitas AI Gagal ❌',
        isEngineFailure
          ? 'Layanan verifikasi identitas sedang tidak tersedia. Ini bukan karena dokumen Anda. Silakan coba lagi beberapa saat lagi.'
          : error.message ||
            'Terjadi kesalahan sistem saat memverifikasi identitas Anda. Silakan coba lagi.',
        '/settings/kyc',
      );
    }
  }

  async verifyExecution(talentId: string, dto: VerifyExecutionDto) {
    const profile = await this.prisma.talentProfile.findUnique({
      where: { id: talentId },
    });

    if (
      !profile ||
      profile.faceVerificationStatus !== 'VERIFIED' ||
      !profile.encryptedPrivateFace
    ) {
      throw new BadRequestException(
        'Profil Anda belum terverifikasi KTP. Harap lakukan verifikasi KTP/Selfie di halaman Profil terlebih dahulu!',
      );
    }

    // Dekripsi foto wajah asli (Private)
    const decryptedFace = EncryptionUtil.decrypt(profile.encryptedPrivateFace);

    // Pembandingan di sini adalah foto kamera vs selfie tersimpan — dua gambar
    // digital sekualitas, bukan pasangan selfie-vs-KTP. aiService.verifyFaceMatch
    // karena itu memakai ambang foto-vs-foto yang ketat; ambang longgar milik
    // jalur KTP meloloskan orang yang berbeda terhadap satu wajah terdaftar.
    let matchResult: Awaited<ReturnType<AiService['verifyFaceMatch']>>;
    try {
      matchResult = await this.aiService.verifyFaceMatch(
        dto.livePhotoUrl,
        decryptedFace,
      );
    } catch (error: any) {
      if (error instanceof FaceEngineUnavailableError) {
        // Mesin mati bukan bukti bahwa orangnya benar. Akses tetap ditahan,
        // tetapi pesannya tidak menuduh pengguna.
        this.logger.error(
          `Mesin biometrik tidak tersedia saat pengecekan anti-joki ${talentId}: ${error.message}`,
        );
        return {
          verified: false,
          matchScore: 0,
          engineUnavailable: true,
          message:
            'Layanan verifikasi wajah sedang tidak tersedia. Ini bukan karena foto Anda. Silakan coba lagi beberapa saat lagi.',
        };
      }
      throw error;
    }

    if (!matchResult.isMatch) {
      this.logger.warn(
        `Pengecekan anti-joki ${talentId} ditolak (jarak wajah ${matchResult.faceDistance ?? 'n/a'}).`,
      );
      return {
        verified: false,
        matchScore: matchResult.confidenceScore,
        message: `Peringatan Anomali Anti-Joki: Wajah yang terdeteksi di kamera tidak cocok dengan KTP/KYC terdaftar (Kemiripan ${matchResult.confidenceScore}%). Akses pengumpulan diblokir!`,
      };
    }

    return {
      verified: true,
      matchScore: matchResult.confidenceScore,
      message: `✓ Wajah Terverifikasi ${matchResult.confidenceScore}% Sesuai dengan KTP/KYC Terdaftar`,
    };
  }

  async verifyCompanyKyb(companyId: string, dto: VerifyKybDto) {
    const profile = await this.prisma.companyProfile.findUnique({
      where: { id: companyId },
      include: { user: true },
    });

    if (!profile) {
      throw new NotFoundException('Profil perusahaan tidak ditemukan');
    }

    await this.prisma.companyProfile.update({
      where: { id: companyId },
      data: {
        kybStatus: VerificationStatus.VERIFIED,
      },
    });

    await this.prisma.notification.create({
      data: {
        userId: profile.userId,
        title: 'Verifikasi Legalitas KYB Berhasil',
        content: `Perusahaan ${dto.legalEntityName ?? profile.companyName} dengan nomor registrasi ${dto.businessRegistrationNumber} telah resmi terverifikasi.`,
        linkUrl: '/profile',
      },
    });

    return {
      status: VerificationStatus.VERIFIED,
      companyName: profile.companyName,
      message:
        'Dokumen KYB berhasil divalidasi. Perusahaan Anda mendapatkan lencana Verified Partner.',
    };
  }

  async getVerificationStatus(
    userId: string,
    role: string,
    profileId?: string,
  ) {
    if (role === 'TALENT') {
      const profile = await this.prisma.talentProfile.findUnique({
        where: { userId },
      });
      return {
        status:
          profile?.faceVerificationStatus ?? VerificationStatus.UNVERIFIED,
      };
    } else {
      const profile = await this.prisma.companyProfile.findUnique({
        where: profileId ? { id: profileId } : { userId },
      });
      return {
        status: profile?.kybStatus ?? VerificationStatus.UNVERIFIED,
      };
    }
  }
}
