import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

@Injectable()
export class StorageService {
  private s3Client: S3Client;
  private bucketName: string;
  private publicUrl: string;

  constructor(private readonly configService: ConfigService) {
    const endpoint = this.configService.get<string>('STORAGE_ENDPOINT', 'https://e7b7f1b2c3d4e5f6.r2.cloudflarestorage.com');
    const accessKeyId = this.configService.get<string>('STORAGE_ACCESS_KEY', 'r2-dev-access-key');
    const secretAccessKey = this.configService.get<string>('STORAGE_SECRET_KEY', 'r2-dev-secret-key');
    this.bucketName = this.configService.get<string>('STORAGE_BUCKET_NAME', 'tolongin-assets');
    this.publicUrl = this.configService.get<string>('STORAGE_PUBLIC_URL', 'https://storage.tolongin.co');

    this.s3Client = new S3Client({
      region: 'auto',
      endpoint,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });
  }

  async getPresignedUploadUrl(fileName: string, contentType: string) {
    try {
      const timestamp = Date.now();
      const sanitizedName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
      const uniqueKey = `uploads/${timestamp}-${sanitizedName}`;

      const command = new PutObjectCommand({
        Bucket: this.bucketName,
        Key: uniqueKey,
        ContentType: contentType,
      });

      // Expire in 15 minutes (900 seconds)
      const presignedUrl = await getSignedUrl(this.s3Client, command, { expiresIn: 900 });
      const fileUrl = `${this.publicUrl}/${uniqueKey}`;

      return {
        presignedUrl,
        fileUrl,
        key: uniqueKey,
        expiresIn: 900,
      };
    } catch (error: any) {
      throw new InternalServerErrorException('Gagal membuat presigned URL untuk Cloudflare R2: ' + error.message);
    }
  }

  async uploadFileDirect(file: Express.Multer.File) {
    try {
      const timestamp = Date.now();
      const sanitizedName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
      const uniqueKey = `uploads/${timestamp}-${sanitizedName}`;

      const command = new PutObjectCommand({
        Bucket: this.bucketName,
        Key: uniqueKey,
        ContentType: file.mimetype,
        Body: file.buffer,
      });

      await this.s3Client.send(command);
      const fileUrl = `${this.publicUrl}/${uniqueKey}`;

      return { fileUrl, key: uniqueKey };
    } catch (error: any) {
      throw new InternalServerErrorException('Gagal mengunggah file ke Cloudflare R2: ' + error.message);
    }
  }
}
