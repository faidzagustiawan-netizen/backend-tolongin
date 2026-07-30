import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import {
  GateScoreBasis,
  StageGateMode,
  StagePendingPolicy,
} from '@prisma/client';
import { MAX_SECTIONS_PER_CHALLENGE } from './create-challenge.dto';

/**
 * Pengaturan satu tahap yang boleh diubah walau studi kasusnya sudah terbit.
 *
 * Studi kasus yang sudah terbit sengaja dibekukan — soalnya tidak boleh berubah
 * di tengah pengerjaan, karena jawaban kandidat sudah menunjuk soal-soal itu.
 * Tetapi ambang lolos dan jadwal adalah hal lain: keduanya baru terbukti
 * terlalu ketat atau terlalu longgar setelah kandidat sungguhan mengerjakannya,
 * dan tanpa jalan ini perusahaan tidak punya pilihan selain membiarkan studi
 * kasusnya rusak sampai selesai.
 *
 * Yang tidak ada di sini disengaja: judul, deskripsi, dan soal tetap terkunci.
 */
export class UpdateStageGateDto {
  @IsInt()
  @Min(1)
  @IsOptional()
  timeLimit?: number | null;

  @IsDateString()
  @IsOptional()
  opensAt?: string | null;

  @IsDateString()
  @IsOptional()
  closesAt?: string | null;

  @IsEnum(StageGateMode)
  @IsOptional()
  gateMode?: StageGateMode;

  @IsNumber()
  @Min(0)
  @Max(100)
  @IsOptional()
  minScore?: number | null;

  @IsInt()
  @Min(1)
  @IsOptional()
  maxAdvancing?: number | null;

  @IsEnum(GateScoreBasis)
  @IsOptional()
  scoreBasis?: GateScoreBasis;

  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(MAX_SECTIONS_PER_CHALLENGE)
  @IsOptional()
  gateSourceIds?: string[];

  @IsEnum(StagePendingPolicy)
  @IsOptional()
  pendingPolicy?: StagePendingPolicy;

  @IsInt()
  @Min(1)
  @Max(90)
  @IsOptional()
  graceDays?: number | null;
}
