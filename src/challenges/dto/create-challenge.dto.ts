import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsBoolean,
  IsObject,
  IsArray,
  ValidateNested,
  IsNumber,
  IsInt,
  IsDateString,
  ArrayMaxSize,
  MaxLength,
  Max,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  ChallengeCategory,
  ChallengeDifficulty,
  ChallengeStatus,
  ComponentType,
  SectionStageType,
} from '@prisma/client';

/** Batas ukuran payload; badan permintaan sendiri dibatasi 5 MB di main.ts. */
export const MAX_SECTIONS_PER_CHALLENGE = 30;
export const MAX_COMPONENTS_PER_SECTION = 200;
export const MAX_POINTS_PER_COMPONENT = 1000;

export class ChallengeComponentDto {
  @IsEnum(ComponentType)
  type: ComponentType;

  @IsString()
  @IsNotEmpty()
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

  // Poin negatif membuat total nilai tidak masuk akal dan bisa dipakai
  // menggeser skor akhir ke bawah nol.
  @IsNumber()
  @Min(0)
  @Max(MAX_POINTS_PER_COMPONENT)
  @IsOptional()
  points?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  order?: number;

  /**
   * Id soal di bank bila komponen ini dipungut dari sana.
   *
   * Hanya jejak asal — isinya sudah disalin ke kolom di atas. Id yang tidak
   * dikenal dibuang saat penyimpanan, jadi klien tidak bisa memakainya untuk
   * menunjuk soal milik perusahaan lain.
   */
  @IsString()
  @IsOptional()
  sourceItemId?: string;
}

export class ChallengeSectionDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  title: string;

  @IsString()
  @IsOptional()
  @MaxLength(5000)
  description?: string;

  @IsNumber()
  @Min(0)
  @IsOptional()
  order?: number;

  @IsEnum(SectionStageType)
  @IsOptional()
  stageType?: SectionStageType;

  // Menit pengerjaan tahap ini. null berarti tak terbatas, jadi nilai null
  // sengaja dibiarkan lolos oleh @IsOptional.
  @IsInt()
  @Min(1)
  @IsOptional()
  timeLimit?: number | null;

  @IsArray()
  @ArrayMaxSize(MAX_COMPONENTS_PER_SECTION)
  @ValidateNested({ each: true })
  @Type(() => ChallengeComponentDto)
  @IsOptional()
  components?: ChallengeComponentDto[];
}

export class CreateChallengeDto {
  /**
   * Perusahaan pemilik studi kasus. Hanya dibaca untuk peran ADMIN, yang
   * tokennya tidak membawa profil perusahaan; untuk peran COMPANY nilai ini
   * diabaikan dan pemiliknya selalu diambil dari token supaya satu perusahaan
   * tidak bisa membuat studi kasus atas nama perusahaan lain.
   */
  @IsString()
  @IsOptional()
  companyId?: string;

  @IsString()
  @IsNotEmpty({ message: 'Judul challenge tidak boleh kosong' })
  @MaxLength(200, { message: 'Judul maksimal 200 karakter' })
  title: string;

  @IsString()
  @IsNotEmpty({ message: 'Ringkasan tidak boleh kosong' })
  @MaxLength(1000, { message: 'Ringkasan maksimal 1000 karakter' })
  summary: string;

  @IsString()
  @IsNotEmpty({ message: 'Deskripsi masalah tidak boleh kosong' })
  @MaxLength(50000)
  description: string;

  @IsEnum(ChallengeCategory)
  category: ChallengeCategory;

  @IsEnum(ChallengeDifficulty)
  difficulty: ChallengeDifficulty;

  @IsString()
  @IsOptional()
  datasetUrl?: string;

  @IsString()
  @IsOptional()
  mockApiUrl?: string;

  @IsString()
  @IsOptional()
  brandGuidelineUrl?: string;

  @IsObject()
  @IsOptional()
  gradingRubric?: Record<string, any>;

  /** Pengaturan anti-kecurangan; kolom tersendiri, bukan bagian dari rubrik. */
  @IsObject()
  @IsOptional()
  proctoringSettings?: Record<string, any>;

  @IsString()
  @IsOptional()
  rewardDescription?: string;

  // Dulu hanya @IsString(): teks apa pun lolos, lalu `new Date()` menghasilkan
  // Invalid Date dan Prisma menggagalkan permintaan sebagai galat 500.
  @IsDateString(
    {},
    { message: 'Tanggal mulai harus berupa tanggal ISO yang sah' },
  )
  @IsOptional()
  startsAt?: string;

  @IsDateString(
    {},
    { message: 'Batas akhir harus berupa tanggal ISO yang sah' },
  )
  @IsOptional()
  deadlineAt?: string;

  @IsBoolean()
  @IsOptional()
  isPrivate?: boolean;

  @IsEnum(ChallengeStatus)
  @IsOptional()
  status?: ChallengeStatus;

  @IsBoolean()
  @IsOptional()
  createdByAi?: boolean;

  @IsString()
  @IsOptional()
  aiPromptUsed?: string;

  @IsArray()
  @ArrayMaxSize(MAX_SECTIONS_PER_CHALLENGE)
  @ValidateNested({ each: true })
  @Type(() => ChallengeSectionDto)
  @IsOptional()
  sections?: ChallengeSectionDto[];
}
