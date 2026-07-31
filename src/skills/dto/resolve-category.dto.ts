import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class ResolveCategoryDto {
  @ApiProperty({
    example: 'Backen Development',
    description: 'Bidang pekerjaan apa adanya seperti yang diketik perusahaan.',
  })
  @IsString()
  name: string;

  @ApiPropertyOptional({
    description:
      'Perusahaan sudah melihat usulan pembetulan dan tetap memilih ketikannya. Melewati pemeriksaan AI, bukan pemeriksaan duplikat.',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  force?: boolean;
}
