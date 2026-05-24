import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class VerifyKybDto {
  @ApiProperty({
    example: '12.345.678.9-012.000',
    description: 'Nomor Registrasi Bisnis / NPWP / NIB',
  })
  @IsString()
  @IsNotEmpty()
  businessRegistrationNumber: string;

  @ApiProperty({
    example: 'https://storage.tolongin.co/docs/nib.pdf',
    description: 'URL dokumen legalitas resmi (NIB/Akta Perusahaan)',
  })
  @IsString()
  @IsNotEmpty()
  documentUrl: string;

  @ApiProperty({
    example: 'PT Teknologi Tolongin Indonesia',
    description: 'Nama entitas hukum resmi sesuai dokumen',
    required: false,
  })
  @IsOptional()
  @IsString()
  legalEntityName?: string;
}
