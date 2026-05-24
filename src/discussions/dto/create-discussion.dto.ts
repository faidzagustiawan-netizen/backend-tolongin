import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class CreateDiscussionDto {
  @ApiProperty({
    example:
      'Apakah ada format khusus untuk struktur database PostgreSQL di challenge ini?',
    description: 'Pesan atau pertanyaan untuk Q&A studi kasus',
  })
  @IsString()
  @IsNotEmpty()
  message: string;

  @ApiProperty({
    example: 'uuid-parent-discussion',
    description: 'ID pesan induk jika berupa balasan (thread nested)',
    required: false,
  })
  @IsOptional()
  @IsString()
  parentId?: string;
}
