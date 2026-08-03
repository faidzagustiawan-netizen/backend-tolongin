import { Module } from '@nestjs/common';
import { BadgesService } from './badges.service';
import { NotificationsModule } from '../notifications/notifications.module';

/**
 * `NotificationsModule` diimpor terang-terangan meski sudah `@Global()`.
 *
 * Global hanya berlaku ketika aplikasi utuh dirakit. Modul uji yang mengimpor
 * satu modul saja — `Test.createTestingModule({ imports: [SeedModule] })` —
 * tidak mendaftarkan yang global, dan `BadgesService` gagal disuntik dengan
 * "Nest can't resolve dependencies of the BadgesService". Impor eksplisit
 * membuat modul ini berdiri sendiri di konteks mana pun.
 *
 * `PrismaModule` tidak perlu: `PrismaService` disediakan lewat root pada
 * aplikasi utuh maupun pada modul uji yang sudah menyediakannya sendiri.
 */
@Module({
  imports: [NotificationsModule],
  providers: [BadgesService],
  exports: [BadgesService],
})
export class BadgesModule {}
