import {
  IsEmail,
  IsEnum,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MinLength,
  IsBoolean,
} from 'class-validator';
import { Role, SubscriptionTier } from '@prisma/client';

export class CreateUserDto {
  @IsEmail({}, { message: 'Format email tidak valid' })
  @IsNotEmpty({ message: 'Email tidak boleh kosong' })
  email: string;

  // Dinaikkan dari 6 ke 8. Akun perusahaan di sini memegang data pelamar dan
  // dapat memindahkan kandidat ke tahap "diterima kerja"; enam karakter terlalu
  // tipis untuk itu. Akun lama tidak terpengaruh — aturan ini hanya berlaku
  // saat pendaftaran dan penggantian kata sandi.
  @IsString()
  @MinLength(8, { message: 'Password minimal 8 karakter' })
  password: string;

  @IsIn(['TALENT', 'COMPANY'], { message: 'Role harus TALENT atau COMPANY' })
  @IsOptional()
  role?: Role;

  // Untuk profil Talent
  @IsString()
  @IsOptional()
  fullName?: string;

  // Untuk profil Company
  @IsString()
  @IsOptional()
  companyName?: string;

  @IsString()
  @IsOptional()
  industry?: string;

  // Legalitas usaha, wajib untuk pendaftaran perusahaan yang berdiri sendiri.
  // Kewajibannya ditegakkan di UsersService.create, bukan di sini, karena
  // DTO yang sama dipakai jalur talenta dan jalur bergabung lewat undangan —
  // keduanya tidak mengirimkan legalitas apa pun.
  @IsString()
  @IsOptional()
  legalEntityName?: string;

  @IsString()
  @IsOptional()
  businessRegistrationNumber?: string;

  @IsString()
  @IsOptional()
  legalDocumentUrl?: string;

  @IsEnum(SubscriptionTier)
  @IsOptional()
  subscriptionTier?: SubscriptionTier;

  @IsString()
  @IsOptional()
  inviteCode?: string;

  @IsBoolean()
  @IsOptional()
  isJoinTeam?: boolean;
}
