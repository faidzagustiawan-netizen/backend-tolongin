import { Module } from '@nestjs/common';
import { AiService } from './ai.service';
import { PythonWorkerService } from './python-worker.service';

@Module({
  providers: [AiService, PythonWorkerService],
  exports: [AiService, PythonWorkerService],
})
export class AiModule {}
