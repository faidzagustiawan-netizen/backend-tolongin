import {
  Controller,
  Post,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { SeedService } from './seed.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

/**
 * Endpoint ini destruktif, bukan sekadar menulis: hal pertama yang dikerjakan
 * `SeedService.seed()` adalah `TRUNCATE TABLE "users" CASCADE` beserta
 * `"badges"` dan `"challenges"`. Sampai belum lama ini tidak ada guard sama
 * sekali di sini, dan tidak ada guard global yang menutupinya — satu-satunya
 * `APP_GUARD` di `app.module.ts` adalah pembatas laju. Artinya siapa pun yang
 * bisa menjangkau API bisa mengosongkan basis data.
 *
 * Peran diambil `JwtAuthGuard` dari basis data, bukan dari isi token, sehingga
 * pencabutan hak ADMIN langsung berlaku tanpa menunggu token lama kedaluwarsa.
 *
 * Guard di sini adalah lapisan pertama. Lapisan kedua adalah `seedModuleEnabled`
 * di `common/dev-flags.ts`, yang membuat modul ini tidak terdaftar di produksi.
 * Keduanya dipertahankan dengan sengaja — lihat docstring saklar itu.
 */
@ApiTags('Data Seeding & Demo')
@Controller('seed')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@ApiBearerAuth('JWT-auth')
export class SeedController {
  constructor(private readonly seedService: SeedService) {}

  @ApiOperation({
    summary:
      'Mempopulasi database dengan data sampel (Perusahaan, Talenta, Challenge, Portofolio). ' +
      'DESTRUKTIF: menghapus seluruh isi tabel users, badges, dan challenges lebih dulu. Hanya ADMIN.',
  })
  @ApiResponse({ status: 200, description: 'Seeding berhasil dijalankan.' })
  @HttpCode(HttpStatus.OK)
  @Post()
  async seed() {
    return this.seedService.seed();
  }
}
