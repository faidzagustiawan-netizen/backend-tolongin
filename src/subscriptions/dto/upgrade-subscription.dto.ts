import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsNumber, IsOptional } from 'class-validator';
import { SubscriptionTier } from '@prisma/client';

export class UpgradeSubscriptionDto {
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
    description: 'Durasi langganan dalam bulan (opsional, default 12)',
    required: false,
  })
  @IsOptional()
  @IsNumber()
  durationInMonths?: number;
}
