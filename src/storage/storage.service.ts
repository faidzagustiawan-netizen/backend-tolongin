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
    // Kredensial penyimpanan tidak punya nilai bawaan: konfigurasi yang salah
    // harus terlihat saat start, bukan berujung berkas kandidat tersimpan ke
    // bucket yang tidak diniatkan.
    const endpoint = this.configService.get<string>('STORAGE_ENDPOINT');
    const accessKeyId = this.configService.get<string>('STORAGE_ACCESS_KEY');
    const secretAccessKey =
      this.configService.get<string>('STORAGE_SECRET_KEY');
    const bucketName = this.configService.get<string>('STORAGE_BUCKET_NAME');
    const publicUrl = this.configService.get<string>('STORAGE_PUBLIC_URL');

    const missing = Object.entries({
      STORAGE_ENDPOINT: endpoint,
      STORAGE_ACCESS_KEY: accessKeyId,
      STORAGE_SECRET_KEY: secretAccessKey,
      STORAGE_BUCKET_NAME: bucketName,
      STORAGE_PUBLIC_URL: publicUrl,
    })
      .filter(([, value]) => !value)
      .map(([key]) => key);

    if (missing.length > 0) {
      throw new Error(
        `Variabel penyimpanan berikut wajib diisi: ${missing.join(', ')}`,
      );
    }

    this.bucketName = bucketName as string;
    this.publicUrl = publicUrl as string;

    this.s3Client = new S3Client({
      region: 'auto',
      endpoint,
      credentials: {
        accessKeyId: accessKeyId as string,
        secretAccessKey: secretAccessKey as string,
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
      const presignedUrl = await getSignedUrl(this.s3Client, command, {
        expiresIn: 900,
      });
      const fileUrl = `${this.publicUrl}/${uniqueKey}`;

      return {
        presignedUrl,
        fileUrl,
        key: uniqueKey,
        expiresIn: 900,
      };
    } catch (error: any) {
      throw new InternalServerErrorException(
        'Gagal membuat presigned URL untuk Cloudflare R2: ' + error.message,
      );
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
      throw new InternalServerErrorException(
        'Gagal mengunggah file ke Cloudflare R2: ' + error.message,
      );
    }
  }
}
