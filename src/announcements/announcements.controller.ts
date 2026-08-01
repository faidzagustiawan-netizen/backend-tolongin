import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AnnouncementsService } from './announcements.service';

@ApiTags('Announcements')
@Controller('announcements')
export class AnnouncementsController {
  constructor(private readonly announcementsService: AnnouncementsService) {}

  @ApiOperation({
    summary: 'Pengumuman yang sedang aktif',
    description:
      'Terbuka tanpa autentikasi: pengumuman pemeliharaan justru paling ' +
      'dibutuhkan saat pengguna belum atau tidak bisa masuk.',
  })
  @ApiResponse({ status: 200, description: 'Daftar pengumuman aktif.' })
  @Get()
  async listActive() {
    return this.announcementsService.listActive();
  }
}
