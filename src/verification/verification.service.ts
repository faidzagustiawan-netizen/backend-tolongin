import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { VerifyFaceDto } from './dto/verify-face.dto';
import { VerifyKybDto } from './dto/verify-kyb.dto';
import { VerifyExecutionDto } from './dto/verify-execution.dto';
import { AiService } from '../ai/ai.service';
import { VerificationStatus } from '@prisma/client';
import * as crypto from 'crypto';

@Injectable()
export class VerificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly aiService: AiService,
  ) {}



  async verifyTalentFace(talentId: string, dto: VerifyFaceDto) {
    const profile = await this.prisma.talentProfile.findUnique({
      where: { id: talentId },
      include: { user: true },
    });

    if (!profile) {
      throw new NotFoundException('Profil talenta tidak ditemukan');
    }

    // 1. Coba lakukan verifikasi tingkat lanjut menggunakan DeepFace / EasyOCR / OpenAI Vision
    const visionResult = await this.aiService.verifyKtpAndSelfie(dto.selfiePhotoUrl, dto.idCardPhotoUrl);

    let finalConfidence = 0;
    let verificationDetail = '';

    if (visionResult) {
      if (!visionResult.isKtpValid) {
        throw new BadRequestException(
          `Verifikasi Ditolak: ${visionResult.reason || 'Dokumen yang diunggah bukan KTP resmi Indonesia yang sah.'}`,
        );
      }

      if (!visionResult.isMatch) {
        throw new BadRequestException(
          `Verifikasi Ditolak: ${visionResult.reason || 'Wajah pada selfie tidak cocok dengan foto di KTP Anda.'}`,
        );
      }

      finalConfidence = visionResult.confidenceScore || 95;
      verificationDetail = visionResult.reason;

      // Pengecekan 1 Wajah 1 Identitas 1 Akun (Anti Double Account - Prisma Validated)
      if (visionResult.ktpNik) {
        const existingNik = await this.prisma.talentProfile.findFirst({
          where: { ktpNik: visionResult.ktpNik, id: { not: talentId } } as any,
        });
        if (existingNik) {
          throw new BadRequestException(
            `Verifikasi Ditolak: KTP dengan NIK ${visionResult.ktpNik} sudah terdaftar pada akun lain. Aturan ketat: 1 identitas hanya untuk 1 akun!`,
          );
        }
      }
    } else {
      throw new BadRequestException(
        'Sistem AI Verifikasi Liveness & KTP sedang mengalami antrean tinggi atau galat. Silakan coba beberapa saat lagi.',
      );
    }

    // Hitung hash biometrik murni dari konten gambar wajah tanpa menyertakan talentId agar keunikan wajah konsisten
    const cleanSelfie = dto.selfiePhotoUrl.replace(/^data:image\/\w+;base64,/, '');
    const biometricHash = visionResult.biometricHash || crypto.createHash('sha256').update(cleanSelfie).digest('hex');

    const existingFace = await this.prisma.talentProfile.findFirst({
      where: { biometricDataHash: biometricHash, id: { not: talentId } },
    });
    if (existingFace) {
      throw new BadRequestException(
        'Verifikasi Ditolak: Wajah (data biometrik) ini sudah terdaftar pada akun lain. Aturan ketat: 1 wajah hanya untuk 1 akun!',
      );
    }

    const updatedProfile = await this.prisma.talentProfile.update({
      where: { id: talentId },
      data: {
        faceVerificationStatus: VerificationStatus.VERIFIED,
        ktpNik: visionResult.ktpNik,
        biometricDataHash: biometricHash,
        avatarUrl: dto.selfiePhotoUrl,
      } as any,
    });

    await this.prisma.notification.create({
      data: {
        userId: profile.userId,
        title: 'Verifikasi Identitas AI Berhasil',
        content: `Selamat! Verifikasi KTP & Wajah Anda telah terverifikasi dengan tingkat kecocokan ${finalConfidence}%. Catatan: ${verificationDetail}`,
        linkUrl: '/profile',
      },
    });

    return {
      status: VerificationStatus.VERIFIED,
      confidenceScore: finalConfidence,
      message: `Verifikasi KTP & Wajah berhasil: ${verificationDetail}`,
      biometricHash,
      avatarUrl: dto.selfiePhotoUrl,
    };
  }

  async verifyExecution(talentId: string, dto: VerifyExecutionDto) {
    const profile = await this.prisma.talentProfile.findUnique({
      where: { id: talentId },
    });

    if (!profile || profile.faceVerificationStatus !== 'VERIFIED' || !profile.avatarUrl) {
      throw new BadRequestException('Profil Anda belum terverifikasi KTP. Harap lakukan verifikasi KTP/Selfie di halaman Profil terlebih dahulu!');
    }

    const matchResult = await this.aiService.verifyFaceMatch(dto.livePhotoUrl, profile.avatarUrl);

    if (!matchResult.isMatch) {
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
      message: 'Dokumen KYB berhasil divalidasi. Perusahaan Anda mendapatkan lencana Verified Partner.',
    };
  }

  async getVerificationStatus(userId: string, role: string) {
    if (role === 'TALENT') {
      const profile = await this.prisma.talentProfile.findUnique({
        where: { userId },
      });
      return {
        status: profile?.faceVerificationStatus ?? VerificationStatus.UNVERIFIED,
      };
    } else {
      const profile = await this.prisma.companyProfile.findUnique({
        where: { userId },
      });
      return {
        status: profile?.kybStatus ?? VerificationStatus.UNVERIFIED,
      };
    }
  }
}
