import { IsEnum, IsNotEmpty, IsString } from 'class-validator';
import { ChallengeCategory, ChallengeDifficulty } from '@prisma/client';

export class GenerateAiBlueprintDto {
  @IsString()
  @IsNotEmpty({ message: 'Prompt kebutuhan rekrutmen tidak boleh kosong' })
  prompt: string;

  @IsEnum(ChallengeCategory)
  category: ChallengeCategory;

  @IsEnum(ChallengeDifficulty)
  difficulty: ChallengeDifficulty;
}
