import { Module, Global } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { NotificationsGateway } from './notifications.gateway';
import { PrismaModule } from '../prisma/prisma.module';
import { JwtModule } from '@nestjs/jwt';
import { MailModule } from '../mail/mail.module';

@Global()
@Module({
  // MailModule juga @Global, jadi impornya berlebihan saat aplikasi utuh
  // dibangun. Disebut eksplisit karena `NotificationsService` memang
  // membutuhkannya: tanpa ini modul mana pun yang mengimpor NotificationsModule
  // sendirian gagal dibangun, dan kegagalannya baru muncul saat permintaan
  // pertama masuk.
  imports: [PrismaModule, JwtModule, MailModule],
  controllers: [NotificationsController],
  providers: [NotificationsService, NotificationsGateway],
  exports: [NotificationsService, NotificationsGateway],
})
export class NotificationsModule {}
