import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty } from 'class-validator';

export class SaveDraftDto {
  @ApiProperty({
    description: 'Data jawaban sementara dalam format JSON',
    example: { comp1: { textValue: 'const a = 1;' } },
  })
  @IsNotEmpty()
  draftData: any;
}
