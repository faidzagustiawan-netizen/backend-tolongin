import { PartialType } from '@nestjs/swagger';
import { CreateChallengeDto } from './create-challenge.dto';

/**
 * Sebelumnya endpoint PATCH memakai `Partial<CreateChallengeDto>` langsung
 * sebagai tipe parameter. TypeScript membuang `Partial<T>` saat kompilasi,
 * sehingga `design:paramtypes` yang dibaca Nest hanya berisi `Object` dan
 * ValidationPipe melewatkan badan permintaan tanpa diperiksa sama sekali —
 * tidak ada whitelist, tidak ada pemeriksaan enum.
 *
 * PartialType mempertahankan seluruh metadata class-validator milik
 * CreateChallengeDto sambil menjadikan setiap properti opsional.
 */
export class UpdateChallengeDto extends PartialType(CreateChallengeDto) {}
