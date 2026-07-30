import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { Role } from '@prisma/client';
import { SeedController } from './seed.controller';
import { SeedModule } from './seed.module';
import { PrismaService } from '../prisma/prisma.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ROLES_KEY } from '../auth/decorators/roles.decorator';

/**
 * Penjagaan `POST /api/v1/seed`.
 *
 * Endpoint ini menjalankan `TRUNCATE TABLE "users" CASCADE`, dan sampai belum
 * lama ini tidak berguard sama sekali. Yang diuji di sini adalah metadata
 * dekoratornya, bukan permintaan HTTP sungguhan: memanggil endpointnya berarti
 * membangun aplikasi utuh dengan basis data, sementara yang perlu dicegah adalah
 * hal yang jauh lebih sederhana — seseorang menghapus satu dekorator saat
 * refactor dan tidak ada yang gagal.
 *
 * Kelemahannya jujur disebut: uji ini membuktikan guardnya terpasang, bukan
 * bahwa guardnya bekerja. Perilaku `JwtAuthGuard` dan `RolesGuard` diuji di
 * tempatnya masing-masing.
 */
describe('SeedController', () => {
  it('mewajibkan JwtAuthGuard dan RolesGuard', () => {
    const guards = Reflect.getMetadata(
      GUARDS_METADATA,
      SeedController,
    ) as unknown[];

    expect(guards).toContain(JwtAuthGuard);
    expect(guards).toContain(RolesGuard);
  });

  // Urutannya penting: `RolesGuard` membaca `request.user`, dan yang mengisinya
  // adalah `JwtAuthGuard`. Terbalik, `RolesGuard` melihat `user` kosong dan
  // melempar ForbiddenException padahal masalahnya bukan peran — atau lebih
  // buruk, meloloskan permintaan bila kelak ada cabang yang mengizinkan
  // permintaan tanpa peran.
  it('menjalankan JwtAuthGuard sebelum RolesGuard', () => {
    const guards = Reflect.getMetadata(
      GUARDS_METADATA,
      SeedController,
    ) as unknown[];

    expect(guards.indexOf(JwtAuthGuard)).toBeLessThan(
      guards.indexOf(RolesGuard),
    );
  });

  it('membatasi aksesnya ke peran ADMIN saja', () => {
    const roles = Reflect.getMetadata(ROLES_KEY, SeedController) as Role[];

    expect(roles).toEqual([Role.ADMIN]);
  });

  /**
   * Guard yang terpasang lewat `@UseGuards` bukan provider: Nest membangunnya
   * lewat mekanisme enhancer, di dalam konteks modul pemilik controllernya —
   * dan baru saat permintaan pertama masuk. Konsekuensinya tidak enak:
   * `SeedModule` yang lupa mengimpor `JwtModule` tidak membuat boot gagal dan
   * tidak tertangkap `app.module.spec.ts` (`compile()` tidak menginstansiasi
   * enhancer). Yang muncul hanyalah 500 pada panggilan `POST /seed` pertama —
   * pada endpoint yang justru dipakai saat seseorang sedang buru-buru.
   *
   * Jadi yang diperiksa di sini adalah hal yang sama seperti yang dilakukan
   * enhancer itu: apakah konteks `SeedModule` bisa menyediakan dependensi
   * konstruktor `JwtAuthGuard`. Sudah diverifikasi gagal bila `JwtModule`
   * dilepas dari `seed.module.ts`.
   */
  it('menyediakan dependensi JwtAuthGuard di konteks SeedModule', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [SeedModule],
    }).compile();

    const konteksSeed = moduleRef.select(SeedModule);

    // `JwtService` yang jadi taruhannya: itu satu-satunya dependensi
    // `JwtAuthGuard` yang tidak sudah tersedia lewat `PrismaModule`.
    expect(konteksSeed.get(JwtService)).toBeInstanceOf(JwtService);
    expect(konteksSeed.get(PrismaService)).toBeDefined();

    await moduleRef.close();
  }, 30000);
});
