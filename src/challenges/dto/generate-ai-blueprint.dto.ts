import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { ChallengeDifficulty } from '@prisma/client';

export class GenerateAiBlueprintDto {
  @IsString()
  @IsNotEmpty({ message: 'Prompt kebutuhan rekrutmen tidak boleh kosong' })
  prompt: string;

  /** Nama bidang pekerjaan, teks bebas dari direktori `Skill`. */
  @IsString()
  @IsOptional()
  @MaxLength(60)
  category?: string;

  @IsEnum(ChallengeDifficulty)
  difficulty: ChallengeDifficulty;

  @IsOptional()
  previousBlueprint?: any;
}
