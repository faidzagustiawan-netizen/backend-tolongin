import { Module } from '@nestjs/common';
import { SubmissionsService } from './submissions.service';
import { SubmissionsController } from './submissions.controller';
import { AiModule } from '../ai/ai.module';
import { TokensModule } from '../tokens/tokens.module';
import { SubmissionsCronService } from './submissions.cron';
import { CompaniesModule } from '../companies/companies.module';

@Module({
  imports: [AiModule, TokensModule, CompaniesModule],
  controllers: [SubmissionsController],
  providers: [SubmissionsService, SubmissionsCronService],
  exports: [SubmissionsService],
})
export class SubmissionsModule {}
