import {
  IsEmail,
  IsEnum,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { Role, SubscriptionTier } from '@prisma/client';

export class CreateUserDto {
  @IsEmail({}, { message: 'Format email tidak valid' })
  @IsNotEmpty({ message: 'Email tidak boleh kosong' })
  email: string;

  @IsString()
  @MinLength(6, { message: 'Password minimal 6 karakter' })
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

  @IsEnum(SubscriptionTier)
  @IsOptional()
  subscriptionTier?: SubscriptionTier;
}
