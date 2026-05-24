import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery, ApiBearerAuth } from '@nestjs/swagger';
import { StorageService } from './storage.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('Cloudflare R2 Object Storage')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller('storage')
export class StorageController {
  constructor(private readonly storageService: StorageService) {}

  @ApiOperation({ summary: 'Mendapatkan Pre-signed URL untuk mengunggah berkas ke Cloudflare R2 / S3' })
  @ApiQuery({ name: 'fileName', required: true, description: 'Nama asli berkas (misal: solusi-akhir.zip)' })
  @ApiQuery({ name: 'contentType', required: true, description: 'Tipe MIME berkas (misal: application/zip)' })
  @ApiResponse({ status: 200, description: 'Pre-signed URL dan tautan publik berhasil dibuat.' })
  @Get('presigned-url')
  async getPresignedUrl(@Query('fileName') fileName: string, @Query('contentType') contentType: string) {
    return this.storageService.getPresignedUploadUrl(fileName, contentType);
  }
}
