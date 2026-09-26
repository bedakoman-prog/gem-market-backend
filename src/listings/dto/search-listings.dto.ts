import { IsIn, IsOptional, IsString } from 'class-validator';

// GET /search?q=&category=&sub=  (section 5)
// `sub` : sous-filtre générique — secteur de métier pour les annonces
// "emploi" (voir job-sectors.ts) ou type de prestation pour les annonces
// "services" (voir service-types.ts).
export class SearchListingsDto {
  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  sub?: string;

  @IsOptional()
  @IsIn(['bien', 'service', 'espace', 'emploi'])
  type?: string;
}
