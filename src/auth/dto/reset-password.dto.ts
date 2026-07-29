import { IsNotEmpty, IsString, MinLength } from 'class-validator';

export class ResetPasswordDto {
  @IsString()
  @IsNotEmpty({ message: 'Token tidak boleh kosong' })
  token: string;

  @IsString()
  @MinLength(8, { message: 'Kata sandi minimal 8 karakter' })
  password: string;
}
