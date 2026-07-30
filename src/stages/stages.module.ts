import { Module } from '@nestjs/common';
import { StageGateService } from './stage-gate.service';
import { StagesController } from './stages.controller';
import { StagesCronService } from './stages.cron';

@Module({
  controllers: [StagesController],
  providers: [StageGateService, StagesCronService],
  exports: [StageGateService],
})
export class StagesModule {}
