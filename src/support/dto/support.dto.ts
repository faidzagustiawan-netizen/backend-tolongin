import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateTicketDto {
  @ApiProperty({ description: 'Ringkasan satu baris masalahnya' })
  @IsString()
  @IsNotEmpty({ message: 'Judul tiket tidak boleh kosong' })
  @MinLength(5, { message: 'Judul tiket minimal 5 karakter' })
  @MaxLength(200)
  subject: string;

  @ApiProperty({ description: 'Uraian masalah' })
  @IsString()
  @IsNotEmpty({ message: 'Uraian masalah tidak boleh kosong' })
  @MinLength(20, { message: 'Uraian masalah minimal 20 karakter' })
  @MaxLength(5000)
  description: string;
}

export class CreateTicketReplyDto {
  @ApiProperty({ description: 'Isi balasan' })
  @IsString()
  @IsNotEmpty({ message: 'Isi balasan tidak boleh kosong' })
  @MaxLength(5000)
  message: string;
}
