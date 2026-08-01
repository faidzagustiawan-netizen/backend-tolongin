import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Role } from '@prisma/client';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { AdminController } from './admin.controller';
import { AdminModule } from './admin.module';
import { PrismaService } from '../prisma/prisma.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ROLES_KEY } from '../auth/decorators/roles.decorator';
import {
  CreateAnnouncementDto,
  TakedownChallengeDto,
  ToggleBanUserDto,
  VerifyCompanyDto,
} from './dto/admin-actions.dto';

describe('AdminController', () => {
  it('mewajibkan JwtAuthGuard dan RolesGuard', () => {
    const guards = Reflect.getMetadata(
      GUARDS_METADATA,
      AdminController,
    ) as unknown[];

    expect(guards).toContain(JwtAuthGuard);
    expect(guards).toContain(RolesGuard);
  });

  // `RolesGuard` membaca `request.user`, dan yang mengisinya `JwtAuthGuard`.
  it('menjalankan JwtAuthGuard sebelum RolesGuard', () => {
    const guards = Reflect.getMetadata(
      GUARDS_METADATA,
      AdminController,
    ) as unknown[];

    expect(guards.indexOf(JwtAuthGuard)).toBeLessThan(
      guards.indexOf(RolesGuard),
    );
  });

  it('membatasi seluruh controller ke peran ADMIN', () => {
    const roles = Reflect.getMetadata(ROLES_KEY, AdminController) as Role[];

    expect(roles).toEqual([Role.ADMIN]);
  });

  it('menyediakan dependensi JwtAuthGuard di konteks AdminModule', async () => {
    const moduleRef = await Test.createTestingModule({
      // `AdminModule` menarik `VerificationModule` lalu `AiModule`, yang
      // bergantung pada `ConfigService`. Di aplikasi sungguhan modulnya
      // didaftarkan global di `app.module.ts`; di sini harus disebut sendiri.
      imports: [ConfigModule.forRoot({ isGlobal: true }), AdminModule],
    }).compile();

    const konteks = moduleRef.select(AdminModule);

    expect(konteks.get(JwtService)).toBeInstanceOf(JwtService);
    expect(konteks.get(PrismaService)).toBeDefined();

    await moduleRef.close();
  }, 30000);
});

/**
 * Validasi badan permintaan.
 *
 * Seluruh controller ini dulu memakai `@Body('status')` dan tipe objek literal.
 * `ValidationPipe` global melewati metatype bawaan, jadi tidak satu pun nilai
 * pernah diperiksa: `POST /admin/companies/:id/verify` tanpa `status`
 * menghasilkan `data: { kybStatus: undefined }`, Prisma membuang bidangnya, dan
 * admin menerima 200 OK untuk perubahan yang tidak pernah terjadi.
 */
describe('DTO AdminController', () => {
  const errorsFor = async (cls: any, payload: unknown) =>
    validate(plainToInstance(cls, payload));

  it('menolak keputusan KYB yang kosong', async () => {
    expect(await errorsFor(VerifyCompanyDto, {})).not.toHaveLength(0);
  });

  it('menolak keputusan KYB di luar VERIFIED/FAILED', async () => {
    expect(
      await errorsFor(VerifyCompanyDto, { status: 'PENDING' }),
    ).not.toHaveLength(0);
  });

  it('menerima keputusan KYB yang sah', async () => {
    expect(
      await errorsFor(VerifyCompanyDto, { status: 'VERIFIED' }),
    ).toHaveLength(0);
  });

  it('menolak isBanned berupa string alih-alih memblokir karena truthy', async () => {
    expect(
      await errorsFor(ToggleBanUserDto, { isBanned: 'false' }),
    ).not.toHaveLength(0);
  });

  it('menolak isBanned yang tidak dikirim', async () => {
    expect(await errorsFor(ToggleBanUserDto, {})).not.toHaveLength(0);
  });

  it('mewajibkan alasan penurunan yang berisi', async () => {
    expect(
      await errorsFor(TakedownChallengeDto, { reason: 'nope' }),
    ).not.toHaveLength(0);
    expect(
      await errorsFor(TakedownChallengeDto, { reason: 'Konten menyesatkan' }),
    ).toHaveLength(0);
  });

  it('menolak tipe pengumuman yang tidak dikenal', async () => {
    expect(
      await errorsFor(CreateAnnouncementDto, {
        title: 'Halo',
        content: 'Isi',
        type: 'DANGER',
      }),
    ).not.toHaveLength(0);
  });

  it('menolak expiresAt yang bukan tanggal', async () => {
    expect(
      await errorsFor(CreateAnnouncementDto, {
        title: 'Halo',
        content: 'Isi',
        expiresAt: 'besok',
      }),
    ).not.toHaveLength(0);
  });
});
