import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { PrismaModule } from '../prisma/prisma.module';
import { JwtModule } from '@nestjs/jwt';
import { VerificationModule } from '../verification/verification.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  // VerificationModule diimpor untuk IdentityDedupeService, satu-satunya pintu
  // akses ke kolom vektor biometrik.
  //
  // NotificationsModule bersifat @Global, jadi impor ini secara teknis
  // berlebihan — tetapi ketergantungannya nyata (setiap keputusan moderasi
  // mengabari orang yang terkena) dan modul yang bergantung pada pendaftaran
  // global di berkas lain tidak bisa dibangun sendirian, termasuk di dalam uji.
  imports: [PrismaModule, JwtModule, VerificationModule, NotificationsModule],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
