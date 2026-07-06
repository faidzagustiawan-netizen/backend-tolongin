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

  @IsString()
  @IsOptional()
  encryptedPrivateFace?: string;

  @IsArray()
  @IsNumber({}, { each: true })
  @IsOptional()
  biometricFeatureVector?: number[];

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  showcasedSubmissionIds?: string[];
}
