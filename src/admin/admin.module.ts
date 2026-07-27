import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { PrismaModule } from '../prisma/prisma.module';
import { JwtModule } from '@nestjs/jwt';
import { VerificationModule } from '../verification/verification.module';

@Module({
  // VerificationModule diimpor untuk IdentityDedupeService, satu-satunya pintu
  // akses ke kolom vektor biometrik.
  imports: [PrismaModule, JwtModule, VerificationModule],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
