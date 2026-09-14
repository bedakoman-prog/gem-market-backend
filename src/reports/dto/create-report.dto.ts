import { IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateReportDto {
  @IsOptional()
  @IsUUID()
  listingId?: string;

  @IsOptional()
  @IsUUID()
  sellerId?: string;

  @IsString()
  reason!: string;
}
