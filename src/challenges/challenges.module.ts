import { Module } from '@nestjs/common';
import { ChallengesService } from './challenges.service';
import { ChallengesController } from './challenges.controller';
import { TemplateController } from './template.controller';
import { AiModule } from '../ai/ai.module';
import { TokensModule } from '../tokens/tokens.module';
import { CompaniesModule } from '../companies/companies.module';

@Module({
  imports: [AiModule, TokensModule, CompaniesModule],
  controllers: [ChallengesController, TemplateController],
  providers: [ChallengesService],
  exports: [ChallengesService],
})
export class ChallengesModule {}
