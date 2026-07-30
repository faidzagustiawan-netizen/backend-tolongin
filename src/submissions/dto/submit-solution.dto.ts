import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class ComponentResponseDto {
  @IsString()
  @IsNotEmpty()
  componentId: string;

  @IsString()
  @IsOptional()
  textValue?: string;

  @IsString()
  @IsOptional()
  fileUrl?: string;
}

export class SubmitSolutionDto {
  @IsString()
  @IsNotEmpty({ message: 'ID Enrollment tidak boleh kosong' })
  enrollmentId: string;

  /**
   * Tahap yang dikumpulkan.
   *
   * Kosong berarti pengumpulan menyeluruh — bentuk lama, satu submisi untuk
   * seluruh studi kasus. Tetap didukung supaya studi kasus tanpa tahapan
   * bergerbang tidak berubah perilakunya.
   */
  @IsString()
  @IsOptional()
  sectionId?: string;

  @IsString()
  @IsOptional()
  solutionFilesUrl?: string;

  @IsString()
  @IsOptional()
  repositoryUrl?: string;

  @IsString()
  @IsOptional()
  figmaUrl?: string;

  @IsString()
  @IsOptional()
  liveDemoUrl?: string;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ComponentResponseDto)
  @IsOptional()
  responses?: ComponentResponseDto[];
}
