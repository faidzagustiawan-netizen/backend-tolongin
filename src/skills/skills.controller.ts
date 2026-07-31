import { Controller, Get, Post, Body, Query, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { SkillsService } from './skills.service';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ResolveCategoryDto } from './dto/resolve-category.dto';
import { CreateSkillDto } from './dto/create-skill.dto';

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

  @ApiBearerAuth('JWT-auth')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Membuat skill baru di directory' })
  @Post()
  createSkill(@Body() dto: CreateSkillDto) {
    return this.skillsService.createSkill(dto.name);
  }

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
