import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { HiringStatus } from '@prisma/client';

/**
 * Perpindahan tahap rekrutmen setelah submisi dinilai.
 *
 * Dipisahkan dari GradeSubmissionDto dengan sengaja. Penilaian memberi XP dan
 * token sehingga hanya boleh sekali, sedangkan tahap rekrutmen justru harus
 * bisa berpindah berkali-kali: SHORTLISTED lalu INTERVIEW_INVITED lalu HIRED.
 * Sebelumnya keduanya menempel pada satu endpoint, jadi tahap rekrutmen ikut
 * terkunci bersama penilaian.
 */
export class UpdateHiringStatusDto {
  @IsEnum(HiringStatus, { message: 'Status rekrutmen tidak dikenali' })
  hiringStatus: HiringStatus;

  /** Catatan internal rekruter. Tidak dikirim ke kandidat. */
  @IsString()
  @IsOptional()
  @MaxLength(500, { message: 'Catatan maksimal 500 karakter' })
  note?: string;
}
