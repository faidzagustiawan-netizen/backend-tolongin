import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';
import { HiringStatus, SubmissionStatus } from '@prisma/client';

export class GradeSubmissionDto {
  @IsNumber()
  @IsNotEmpty({ message: 'Nilai akhir tidak boleh kosong' })
  finalScore: number;

  @IsString()
  @IsNotEmpty({ message: 'Ulasan rekruter tidak boleh kosong' })
  reviewerFeedback: string;

  @IsEnum(SubmissionStatus)
  status: SubmissionStatus;

  @IsEnum(HiringStatus)
  @IsOptional()
  hiringStatus?: HiringStatus;
}
