import { Module } from '@nestjs/common';
import { VerificationController } from './verification.controller';
import { VerificationService } from './verification.service';
import { PrismaModule } from '../prisma/prisma.module';
import { JwtModule } from '@nestjs/jwt';
import { AiModule } from '../ai/ai.module';

@Module({
  imports: [PrismaModule, JwtModule, AiModule],
  controllers: [VerificationController],
  providers: [VerificationService],
})
export class VerificationModule {}
