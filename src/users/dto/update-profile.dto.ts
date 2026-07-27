import { IsOptional, IsString, IsArray, IsNumber } from 'class-validator';

export class UpdateProfileDto {
  // Company Fields
  @IsString()
  @IsOptional()
  companyName?: string;

  @IsString()
  @IsOptional()
  industry?: string;

  @IsString()
  @IsOptional()
  companySize?: string;

  @IsString()
  @IsOptional()
  websiteUrl?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  logoUrl?: string;

  // Talent Fields
  @IsString()
  @IsOptional()
  fullName?: string;

  @IsString()
  @IsOptional()
  headline?: string;

  @IsString()
  @IsOptional()
  bio?: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  skills?: string[];

  @IsString()
  @IsOptional()
  location?: string;

  @IsString()
  @IsOptional()
  roleCategory?: string;

  @IsString()
  @IsOptional()
  githubUrl?: string;

  @IsString()
  @IsOptional()
  linkedinUrl?: string;

  @IsString()
  @IsOptional()
  figmaUrl?: string;

  @IsString()
  @IsOptional()
  resumeUrl?: string;

  @IsString()
  @IsOptional()
  avatarUrl?: string;

  // encryptedPrivateFace dan biometricFeatureVector sengaja TIDAK ada di sini.
  //
  // Keduanya adalah acuan biometrik yang dipakai fitur anti-joki untuk menilai
  // apakah orang yang mengerjakan ujian sama dengan pemilik KTP. Jika bisa
  // ditulis lewat pembaruan profil biasa, kandidat tinggal mengganti acuannya
  // dengan wajah joki lalu lolos pemeriksaan. Nilai ini hanya boleh ditulis
  // oleh alur verifikasi di VerificationService yang mencocokkannya ke KTP.

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  showcasedSubmissionIds?: string[];

  @IsArray()
  @IsOptional()
  experiences?: any[];

  @IsArray()
  @IsOptional()
  educations?: any[];
}
