import { Controller, Get, Post, Body, Query, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { SkillsService } from './skills.service';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ResolveCategoryDto } from './dto/resolve-category.dto';

/**
 * Batas khusus untuk endpoint yang memanggil AI.
 *
 * Batas global 100 permintaan per menit pantas untuk endpoint biasa, tetapi di
 * sini setiap permintaan adalah satu panggilan model berbayar yang dipicu hanya
 * dengan memindahkan fokus dari sebuah ruas isian.
 */
const AI_RESOLVE_THROTTLE = { default: { limit: 10, ttl: 60_000 } };

@ApiTags('Skills')
@Controller('skills')
export class SkillsController {
  constructor(private readonly skillsService: SkillsService) {}

  @ApiBearerAuth('JWT-auth')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Mencari skill' })
  @Get()
  searchSkills(@Query('q') query: string) {
    return this.skillsService.searchSkills(query);
  }

  // Sengaja tanpa penjaga: direktori studi kasus publik memakainya sebagai
  // pilihan penyaring, dan pengunjung yang belum masuk pun melihat penyaring
  // itu. Isinya hanya nama bidang yang sudah tampil di kartu studi kasus.
  @ApiOperation({
    summary: 'Bidang pekerjaan yang sedang dipakai, terurut dari tersering',
  })
  @Get('categories')
  listCategories() {
    return this.skillsService.listCategories();
  }

  // `POST /skills` dihapus pada 2026-08-03.
  //
  // Tidak ada satu pun pemanggil: antarmuka selalu lewat `/skills/resolve` dan
  // `/skills/categories/resolve`. Bedanya bukan sepele — `SkillsService.
  // createSkill` hanya memeriksa bentuk dan panjang nama, sedangkan kedua rute
  // resolve juga menanyakan ke AI apakah teksnya memang nama bidang pekerjaan.
  //
  // Selama endpoint ini ada, pengguna terautentikasi mana pun bisa menyuntik
  // nama yang lolos format tetapi bukan bidang pekerjaan langsung ke direktori
  // bersama — dan direktori itulah yang menyetir saran bidang bagi perusahaan.
  // Persis kelas masalah yang sudah diperangi di `createSkill`.
  //
  // `createSkill` sendiri tetap: ia pintu tulis tunggal, dipanggil keempat
  // jalur resolve.

  @ApiBearerAuth('JWT-auth')
  @UseGuards(JwtAuthGuard)
  @Throttle(AI_RESOLVE_THROTTLE)
  @ApiOperation({
    summary:
      'Memeriksa bidang pekerjaan yang diketik sendiri: salah ketik, bidang baru, atau bukan bidang',
  })
  @Post('categories/resolve')
  resolveCategory(@Body() dto: ResolveCategoryDto) {
    return this.skillsService.resolveCategory(
      dto.name,
      dto.force ?? false,
      'category',
    );
  }

  /**
   * Versi keahlian dari pemeriksaan yang sama.
   *
   * Tanpa ini gerbangnya bisa dilewati dari pintu sebelah: layar keahlian di
   * profil talenta dulu memanggil POST /skills langsung, sehingga "Reactt"
   * masuk direktori dan muncul sebagai saran bidang bagi perusahaan.
   */
  @ApiBearerAuth('JWT-auth')
  @UseGuards(JwtAuthGuard)
  @Throttle(AI_RESOLVE_THROTTLE)
  @ApiOperation({
    summary:
      'Memeriksa keahlian yang diketik sendiri: salah ketik, keahlian baru, atau bukan keahlian',
  })
  @Post('resolve')
  resolveSkill(@Body() dto: ResolveCategoryDto) {
    return this.skillsService.resolveCategory(
      dto.name,
      dto.force ?? false,
      'skill',
    );
  }
}
