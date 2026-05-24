import { IsNotEmpty, IsString } from 'class-validator';

export class EnrollDto {
  @IsString()
  @IsNotEmpty({ message: 'ID Challenge tidak boleh kosong' })
  challengeId: string;
}
