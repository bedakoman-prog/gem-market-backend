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
import { JOB_SECTOR_IDS } from '../job-sectors';
import { SERVICE_TYPE_IDS } from '../service-types';

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

  // Sous-catégorie de métier — uniquement si type === 'emploi'.
  // Voir job-sectors.ts pour le référentiel complet.
  @IsOptional()
  @IsIn(JOB_SECTOR_IDS)
  jobSector?: string;

  // Sous-catégorie de prestation — uniquement si categoryId === 'services'.
  // Voir service-types.ts pour le référentiel complet.
  @IsOptional()
  @IsIn(SERVICE_TYPE_IDS)
  serviceType?: string;

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
