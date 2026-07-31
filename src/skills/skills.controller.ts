import { Controller, Get, Post, Body, Query, UseGuards } from '@nestjs/common';
import { SkillsService } from './skills.service';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ResolveCategoryDto } from './dto/resolve-category.dto';

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
  createSkill(@Body('name') name: string) {
    return this.skillsService.createSkill(name);
  }

  @ApiBearerAuth('JWT-auth')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary:
      'Memeriksa bidang pekerjaan yang diketik sendiri: salah ketik, bidang baru, atau bukan bidang',
  })
  @Post('categories/resolve')
  resolveCategory(@Body() dto: ResolveCategoryDto) {
    return this.skillsService.resolveCategory(dto.name, dto.force ?? false);
  }
}
