import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { ChallengeCategory, ChallengeDifficulty } from '@prisma/client';

export class GenerateAiChallengeDto {
  @IsString()
  @IsNotEmpty({ message: 'Prompt kebutuhan rekrutmen tidak boleh kosong' })
  prompt: string;

  /**
   * Posisi yang direkrut, teks bebas.
   *
   * Jalur manual sudah menyimpannya sejak `Challenge.role` ada; jalur ini dulu
   * tidak, jadi perusahaan yang memilih "Biarkan AI menyusun" kehilangan
   * jawaban yang sudah mereka ketik di layar pembuka.
   */
  @IsString()
  @IsOptional()
  @MaxLength(150)
  role?: string;

  @IsEnum(ChallengeCategory)
  category: ChallengeCategory;

  @IsEnum(ChallengeDifficulty)
  difficulty: ChallengeDifficulty;

  @IsNotEmpty({ message: 'Blueprint tidak boleh kosong' })
  blueprint: any;
}
