import { IsInt, Min } from 'class-validator';

export class SubscribeDto {
  @IsInt()
  @Min(1)
  days!: number;
}
