import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class ResolveCategoryDto {
  @ApiProperty({
    example: 'Backen Development',
    description: 'Entri apa adanya seperti yang diketik pengguna.',
  })
  @IsString()
  @IsNotEmpty({ message: 'Nama tidak boleh kosong' })
  @MaxLength(60, { message: 'Nama maksimal 60 karakter' })
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
