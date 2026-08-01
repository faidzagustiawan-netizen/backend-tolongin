import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { SupportController } from './support.controller';
import { SupportService } from './support.service';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  // NotificationsModule bersifat @Global, jadi impor ini secara teknis
  // berlebihan — tetapi modul yang bergantung pada pendaftaran global di
  // berkas lain tidak bisa dibangun sendirian, termasuk di dalam uji.
  imports: [PrismaModule, JwtModule, NotificationsModule],
  controllers: [SupportController],
  providers: [SupportService],
})
export class SupportModule {}
