import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  Max,
} from 'class-validator';
import { HiringStatus, SubmissionStatus } from '@prisma/client';

export class GradeSubmissionDto {
  @IsNumber()
  @Min(0, { message: 'Nilai akhir tidak boleh kurang dari 0' })
  @Max(100, { message: 'Nilai akhir tidak boleh lebih dari 100' })
  finalScore: number;

  @IsString()
  @IsOptional()
  reviewerFeedback?: string;

  @IsEnum(SubmissionStatus)
  status: SubmissionStatus;

  @IsEnum(HiringStatus)
  @IsOptional()
  hiringStatus?: HiringStatus;
}
