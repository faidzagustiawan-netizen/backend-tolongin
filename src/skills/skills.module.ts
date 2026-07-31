import { Module } from '@nestjs/common';
import { SkillsService } from './skills.service';
import { SkillsController } from './skills.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { AiModule } from '../ai/ai.module';

@Module({
  imports: [PrismaModule, AiModule],
  controllers: [SkillsController],
  providers: [SkillsService],
  // Jalur penyimpanan studi kasus dan bank soal menerima nama bidang, bukan id,
  // lalu menukarnya lewat `resolveCategoryId`.
  exports: [SkillsService],
})
export class SkillsModule {}
