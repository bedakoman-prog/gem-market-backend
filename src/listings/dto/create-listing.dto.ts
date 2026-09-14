import { Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { ListingType, JobKind } from '@prisma/client';

class SpecItemDto {
  @IsString()
  icon!: string;

  @IsString()
  label!: string;
}

export class CreateListingDto {
  @IsString()
  categoryId!: string;

  @IsEnum(ListingType)
  type!: ListingType;

  @IsOptional()
  @IsEnum(JobKind)
  jobKind?: JobKind; // uniquement si type === 'emploi'

  @IsString()
  title!: string;

  @IsString()
  description!: string;

  @IsInt()
  @Min(0)
  priceFcfa!: number;

  // Grille de specs (surface, capacité…) affichée pour les annonces "espace".
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SpecItemDto)
  specs?: SpecItemDto[];
}
