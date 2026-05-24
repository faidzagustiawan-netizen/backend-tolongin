import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty } from 'class-validator';

export class VerifyFaceDto {
  @ApiProperty({
    example: 'https://storage.tolongin.co/biometrics/sample-selfie.jpg',
    description: 'URL foto selfie talenta untuk perbandingan biometrik',
  })
  @IsString()
  @IsNotEmpty()
  selfiePhotoUrl: string;

  @ApiProperty({
    example: 'https://storage.tolongin.co/biometrics/sample-ktp.jpg',
    description: 'URL foto dokumen identitas (KTP/Paspor)',
  })
  @IsString()
  @IsNotEmpty()
  idCardPhotoUrl: string;
}
