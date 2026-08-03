import { Module } from '@nestjs/common';
import { SubmissionsService } from './submissions.service';
import { SubmissionsController } from './submissions.controller';
import { AiModule } from '../ai/ai.module';
import { TokensModule } from '../tokens/tokens.module';
import { BadgesModule } from '../badges/badges.module';
import { SubmissionsCronService } from './submissions.cron';
import { CompaniesModule } from '../companies/companies.module';
import { StagesModule } from '../stages/stages.module';

@Module({
  imports: [
    AiModule,
    TokensModule,
    CompaniesModule,
    StagesModule,
    BadgesModule,
  ],
  controllers: [SubmissionsController],
  providers: [SubmissionsService, SubmissionsCronService],
  exports: [SubmissionsService],
})
export class SubmissionsModule {}
