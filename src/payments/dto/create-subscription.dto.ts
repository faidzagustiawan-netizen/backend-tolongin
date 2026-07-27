import { ApiProperty } from '@nestjs/swagger';
import { SubscriptionTier } from '@prisma/client';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';

/** Paket langganan yang bisa dibeli sendiri lewat checkout. */
export const SELF_SERVE_TIERS = [
  SubscriptionTier.STARTUP,
  SubscriptionTier.KONGLOMERAT,
] as const;

export type SelfServeTier = (typeof SELF_SERVE_TIERS)[number];

/** Harga per bulan dalam rupiah. */
export const SUBSCRIPTION_MONTHLY_PRICE: Record<SelfServeTier, number> = {
  [SubscriptionTier.STARTUP]: 500000,
  [SubscriptionTier.KONGLOMERAT]: 2500000,
};

export class CreateSubscriptionDto {
  @ApiProperty({
    description:
      'Paket langganan. Tier CUSTOM tidak tersedia lewat checkout mandiri.',
    enum: SELF_SERVE_TIERS,
    default: SubscriptionTier.KONGLOMERAT,
    required: false,
  })
  @IsOptional()
  @IsEnum(SubscriptionTier)
  tier?: SelfServeTier;

  @ApiProperty({
    description: 'Durasi langganan dalam bulan',
    minimum: 1,
    maximum: 12,
    default: 1,
    required: false,
  })
  @IsOptional()
  @IsInt({ message: 'durationMonths harus berupa bilangan bulat' })
  @Min(1)
  @Max(12)
  durationMonths?: number;
}
