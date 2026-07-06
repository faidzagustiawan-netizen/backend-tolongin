import { Controller, Get, Post, Query, UseGuards, UseInterceptors, UploadedFile, BadRequestException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery, ApiBearerAuth, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
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

  @ApiOperation({ summary: 'Unggah berkas langsung ke Cloudflare R2' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
  @ApiResponse({ status: 201, description: 'Berkas berhasil diunggah.' })
  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  async uploadFile(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('Berkas tidak ditemukan dalam permintaan unggah.');
    }
    return this.storageService.uploadFileDirect(file);
  }
}
