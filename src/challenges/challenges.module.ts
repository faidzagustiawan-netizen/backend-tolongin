import { Module } from '@nestjs/common';
import { ChallengesService } from './challenges.service';
import { ChallengesController } from './challenges.controller';
import { AiModule } from '../ai/ai.module';
import { TokensModule } from '../tokens/tokens.module';
import { CompaniesModule } from '../companies/companies.module';
import { SkillsModule } from '../skills/skills.module';

@Module({
  imports: [AiModule, TokensModule, CompaniesModule, SkillsModule],
  controllers: [ChallengesController],
  providers: [ChallengesService],
  exports: [ChallengesService],
})
export class ChallengesModule {}
