import { IsIn, IsOptional, IsString } from 'class-validator';

// GET /search?q=&category=&sub=  (section 5)
// `sub` : secteur de métier pour les annonces "emploi" (voir job-sectors.ts) —
// prévu comme sous-filtre générique, aujourd'hui utilisé uniquement ici.
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
