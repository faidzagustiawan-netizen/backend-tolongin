import { ApiProperty } from '@nestjs/swagger';
import { IsInt, Max, Min } from 'class-validator';

/**
 * ValidationPipe global hanya bekerja pada kelas DTO. Sebelumnya endpoint ini
 * memakai @Body('tokenAmount') mentah sehingga nilai negatif, pecahan, atau
 * string ikut masuk ke perhitungan harga tanpa diperiksa.
 */
export class CreateTopupDto {
  @ApiProperty({
    description: 'Jumlah token yang dibeli',
    minimum: 1,
    maximum: 100000,
    example: 100,
  })
  @IsInt({ message: 'tokenAmount harus berupa bilangan bulat' })
  @Min(1, { message: 'tokenAmount minimal 1' })
  @Max(100000, { message: 'tokenAmount maksimal 100000' })
  tokenAmount: number;
}
