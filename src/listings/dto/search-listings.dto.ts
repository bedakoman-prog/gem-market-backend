import { IsIn, IsOptional, IsString } from 'class-validator';

// GET /search?q=&category=&sub=  (section 5)
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
