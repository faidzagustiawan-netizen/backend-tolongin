import { ApiProperty } from '@nestjs/swagger';
import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { SubscriptionTier } from '@prisma/client';

export class UpgradeSubscriptionDto {
  /**
   * Perusahaan yang paketnya diubah.
   *
   * Endpoint ini kini khusus admin — perusahaan tidak boleh menetapkan
   * paketnya sendiri tanpa pembayaran — sehingga tujuannya wajib disebut
   * eksplisit; token admin tidak membawa profil perusahaan.
   */
  @ApiProperty({
    description: 'ID profil perusahaan yang akan diubah paketnya',
  })
  @IsString()
  @IsNotEmpty({ message: 'companyId wajib diisi' })
  companyId: string;

  @ApiProperty({
    example: SubscriptionTier.KONGLOMERAT,
    enum: SubscriptionTier,
    description: 'Tingkatan paket langganan yang dipilih',
  })
  @IsEnum(SubscriptionTier)
  @IsNotEmpty()
  tier: SubscriptionTier;

  @ApiProperty({
    example: 12,
    description: 'Durasi langganan dalam bulan (opsional, default 12, maks 60)',
    required: false,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(60)
  durationInMonths?: number;

  @ApiProperty({
    description: 'Alasan penyesuaian manual, tersimpan di jejak audit',
    required: false,
  })
  @IsString()
  @IsOptional()
  reason?: string;
}
