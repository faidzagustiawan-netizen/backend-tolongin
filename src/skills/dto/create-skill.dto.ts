import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';

/**
 * Endpoint ini dulu menerima `@Body('name') name: string` telanjang, sehingga
 * `ValidationPipe` tidak punya kelas untuk diperiksa dan string sepanjang apa
 * pun — termasuk yang kosong — masuk langsung ke direktori. Sejak tabel yang
 * sama juga menyetir bidang pekerjaan, isian sembarangan dari layar keahlian
 * talenta muncul sebagai saran bidang bagi perusahaan.
 *
 * Batasnya disamakan dengan `SkillsService`, yang tetap memeriksa ulang karena
 * ia adalah satu-satunya pintu tulis.
 */
export class CreateSkillDto {
  @ApiProperty({ example: 'Kubernetes' })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : value,
  )
  @IsString()
  @IsNotEmpty({ message: 'Nama tidak boleh kosong' })
  @MinLength(2, { message: 'Nama minimal 2 karakter' })
  @MaxLength(60, { message: 'Nama maksimal 60 karakter' })
  name: string;
}
