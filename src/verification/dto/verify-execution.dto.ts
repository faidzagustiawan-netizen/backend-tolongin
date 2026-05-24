import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty } from 'class-validator';

export class VerifyExecutionDto {
  @ApiProperty({
    example: 'data:image/jpeg;base64,...',
    description: 'String base64 snapshot webcam langsung saat pengerjaan studi kasus',
  })
  @IsString()
  @IsNotEmpty()
  livePhotoUrl: string;
}
