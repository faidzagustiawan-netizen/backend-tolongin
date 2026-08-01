import { ApiProperty } from '@nestjs/swagger';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { AnnouncementType, VerificationStatus } from '@prisma/client';

/**
 * DTO untuk seluruh endpoint `AdminController`.
 *
 * Sebelumnya tidak ada satu pun: setiap route memakai `@Body('status')`,
 * `@Body('isBanned')`, atau tipe objek literal. `ValidationPipe` global
 * melewati metatype bawaan (String, Boolean, Object), jadi tak satu pun nilai
 * itu pernah diperiksa. Akibatnya bukan sekadar galat yang jelek: `POST
 * /admin/companies/:id/verify` tanpa `status` menghasilkan
 * `data: { kybStatus: undefined }`, Prisma membuang bidangnya, dan admin
 * menerima 200 OK untuk perubahan yang tidak pernah terjadi. Sama halnya
 * dengan pemblokiran pengguna.
 */

/** Nilai `kybStatus` yang boleh ditetapkan admin dari antrean verifikasi. */
const KYB_DECISIONS = [
  VerificationStatus.VERIFIED,
  VerificationStatus.FAILED,
] as const;

export type KybDecision = (typeof KYB_DECISIONS)[number];

export class VerifyCompanyDto {
  @ApiProperty({
    enum: KYB_DECISIONS,
    description: 'Keputusan tinjauan legalitas usaha',
  })
  @IsIn(KYB_DECISIONS, {
    message: 'status harus VERIFIED atau FAILED',
  })
  status: KybDecision;

  @ApiProperty({
    required: false,
    description:
      'Alasan penolakan. Ikut dikirim ke perusahaan agar tahu apa yang harus diperbaiki.',
  })
  @IsString()
  @IsOptional()
  @MaxLength(1000)
  reason?: string;
}

export class ToggleBanUserDto {
  @ApiProperty({ description: 'true memblokir akun, false membukanya kembali' })
  @IsBoolean({ message: 'isBanned wajib bernilai boolean' })
  isBanned: boolean;

  @ApiProperty({
    required: false,
    description: 'Alasan pemblokiran, tersimpan di jejak audit',
  })
  @IsString()
  @IsOptional()
  @MaxLength(1000)
  reason?: string;
}

export class SendWarningDto {
  @ApiProperty({ description: 'Isi peringatan yang dikirim ke pengguna' })
  @IsString()
  @IsNotEmpty({ message: 'Isi peringatan tidak boleh kosong' })
  @MinLength(10, { message: 'Isi peringatan minimal 10 karakter' })
  @MaxLength(2000)
  message: string;
}

export class ResolveIdentityReviewDto {
  @ApiProperty({
    description: 'true berarti kedua profil dinyatakan orang yang berbeda',
  })
  @IsBoolean({ message: 'approve wajib bernilai boolean' })
  approve: boolean;

  @ApiProperty({ required: false, description: 'Catatan peninjau' })
  @IsString()
  @IsOptional()
  @MaxLength(1000)
  note?: string;
}

export class TakedownChallengeDto {
  @ApiProperty({
    description:
      'Alasan penurunan. Wajib: pemilik menerima alasan ini di notifikasinya.',
  })
  @IsString()
  @IsNotEmpty({ message: 'Alasan penurunan wajib diisi' })
  @MinLength(10, { message: 'Alasan penurunan minimal 10 karakter' })
  @MaxLength(1000)
  reason: string;
}

export class CreateAnnouncementDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty({ message: 'Judul pengumuman tidak boleh kosong' })
  @MaxLength(200)
  title: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty({ message: 'Isi pengumuman tidak boleh kosong' })
  @MaxLength(5000)
  content: string;

  @ApiProperty({ enum: AnnouncementType, default: AnnouncementType.INFO })
  @IsEnum(AnnouncementType, {
    message: 'type harus INFO, WARNING, SUCCESS, atau MAINTENANCE',
  })
  @IsOptional()
  type?: AnnouncementType;

  @ApiProperty({
    required: false,
    default: true,
    description: 'Pengumuman non-aktif tidak tampil di sisi pengguna',
  })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @ApiProperty({
    required: false,
    description:
      'Setelah waktu ini pengumuman berhenti tampil dengan sendirinya',
  })
  @IsDateString({}, { message: 'expiresAt harus tanggal ISO 8601 yang sah' })
  @IsOptional()
  expiresAt?: string;
}

export class ReplyTicketDto {
  @ApiProperty({ description: 'Isi balasan' })
  @IsString()
  @IsNotEmpty({ message: 'Isi balasan tidak boleh kosong' })
  @MaxLength(5000)
  message: string;
}
