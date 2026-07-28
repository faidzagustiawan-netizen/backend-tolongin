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

export class ChallengeComponentDto {
  @IsEnum(ComponentType)
  type: ComponentType;

  @IsString()
  @IsNotEmpty()
  question: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsOptional()
  options?: any;

  @IsOptional()
  metadata?: any;

  @IsNumber()
  @IsOptional()
  points?: number;

  @IsNumber()
  @IsOptional()
  order?: number;
}

export class ChallengeSectionDto {
  @IsString()
  @IsNotEmpty()
  title: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsNumber()
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
  @ValidateNested({ each: true })
  @Type(() => ChallengeComponentDto)
  @IsOptional()
  components?: ChallengeComponentDto[];
}

export class CreateChallengeDto {
  @IsString()
  @IsNotEmpty({ message: 'Judul challenge tidak boleh kosong' })
  title: string;

  @IsString()
  @IsNotEmpty({ message: 'Ringkasan tidak boleh kosong' })
  summary: string;

  @IsString()
  @IsNotEmpty({ message: 'Deskripsi masalah tidak boleh kosong' })
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

  @IsString()
  @IsOptional()
  rewardDescription?: string;

  @IsString()
  @IsOptional()
  startsAt?: string;

  @IsString()
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
  @ValidateNested({ each: true })
  @Type(() => ChallengeSectionDto)
  @IsOptional()
  sections?: ChallengeSectionDto[];
}
