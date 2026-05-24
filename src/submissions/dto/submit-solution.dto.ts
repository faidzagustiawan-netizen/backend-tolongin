import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class SubmitSolutionDto {
  @IsString()
  @IsNotEmpty({ message: 'ID Enrollment tidak boleh kosong' })
  enrollmentId: string;

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
}
