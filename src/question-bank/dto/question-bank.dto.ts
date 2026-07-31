import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ChallengeDifficulty, ComponentType } from '@prisma/client';

/** Sejalan dengan MAX_POINTS_PER_COMPONENT di create-challenge.dto.ts. */
export const MAX_DEFAULT_POINTS = 1000;
export const MAX_TAGS_PER_ITEM = 20;

/**
 * Cakupan bank yang diminta.
 *
 * PLATFORM  — hanya soal bawaan platform.
 * MINE      — hanya koleksi pribadi pemanggil.
 * ALL       — keduanya; bawaan, karena inilah yang berguna saat menyusun soal.
 */
export enum QuestionBankScope {
  PLATFORM = 'PLATFORM',
  MINE = 'MINE',
  ALL = 'ALL',
}

export class QueryQuestionBankDto {
  @IsEnum(QuestionBankScope)
  @IsOptional()
  scope?: QuestionBankScope;

  /** Nama bidang pekerjaan dari direktori keahlian. */
  @IsString()
  @IsOptional()
  @MaxLength(60)
  category?: string;

  @IsEnum(ChallengeDifficulty)
  @IsOptional()
  difficulty?: ChallengeDifficulty;

  @IsEnum(ComponentType)
  @IsOptional()
  type?: ComponentType;

  /**
   * Daftar id skill dipisah koma. Soal cocok bila membawa SALAH SATU di
   * antaranya, bukan seluruhnya: rekomendasi untuk "Backend Developer"
   * menyertakan Database, API, dan NodeJS sekaligus, dan menuntut satu soal
   * membawa ketiganya akan mengosongkan hasilnya.
   */
  @IsString()
  @IsOptional()
  skillIds?: string;

  @IsString()
  @IsOptional()
  @MaxLength(200)
  search?: string;

  @IsOptional()
  page?: string;

  @IsOptional()
  limit?: string;
}

export class CreateQuestionBankItemDto {
  @IsEnum(ComponentType)
  type: ComponentType;

  @IsString()
  @IsNotEmpty({ message: 'Pertanyaan tidak boleh kosong' })
  @MaxLength(5000)
  question: string;

  @IsString()
  @IsOptional()
  @MaxLength(10000)
  description?: string;

  @IsOptional()
  options?: any;

  @IsOptional()
  metadata?: any;

  @IsInt()
  @Min(0)
  @Max(MAX_DEFAULT_POINTS)
  @IsOptional()
  defaultPoints?: number;

  /**
   * Nama bidang pekerjaan dari direktori keahlian. Dikosongkan berarti berlaku
   * lintas bidang — soft skill, wawancara, etika.
   */
  @IsString()
  @IsOptional()
  @MaxLength(60)
  category?: string;

  @IsEnum(ChallengeDifficulty)
  difficulty: ChallengeDifficulty;

  /**
   * Penanda topik, memakai id dari direktori `skills`. Sengaja bukan teks
   * bebas: dua perbendaharaan kata yang terpisah pasti menyimpang, dan
   * pencocokan rekomendasi jadi meleset. Skill baru dibuat lewat POST /skills.
   */
  @IsArray()
  @ArrayMaxSize(MAX_TAGS_PER_ITEM)
  @IsString({ each: true })
  @IsOptional()
  skillIds?: string[];
}

export class UpdateQuestionBankItemDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  @IsOptional()
  question?: string;

  @IsString()
  @IsOptional()
  @MaxLength(10000)
  description?: string;

  @IsOptional()
  options?: any;

  @IsOptional()
  metadata?: any;

  @IsInt()
  @Min(0)
  @Max(MAX_DEFAULT_POINTS)
  @IsOptional()
  defaultPoints?: number;

  /** Nama bidang pekerjaan dari direktori keahlian. */
  @IsString()
  @IsOptional()
  @MaxLength(60)
  category?: string;

  @IsEnum(ChallengeDifficulty)
  @IsOptional()
  difficulty?: ChallengeDifficulty;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @IsArray()
  @ArrayMaxSize(MAX_TAGS_PER_ITEM)
  @IsString({ each: true })
  @IsOptional()
  skillIds?: string[];
}
